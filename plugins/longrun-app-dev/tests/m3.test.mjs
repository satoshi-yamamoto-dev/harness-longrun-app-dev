import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AdapterStartError, WebProjectAdapter, detectWebProject } from "../runtime/dist/adapters/index.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.resolve(pluginRoot, "..", "..", "examples", "web-app");

async function waitForExit(child, timeoutMs = 3_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("process did not exit")), timeoutMs)),
  ]);
}

test("detects package manager, lockfile, and scripts", async () => {
  const detection = await detectWebProject(fixtureRoot);
  assert.equal(detection.detected, true);
  assert.equal(detection.packageManager, "npm");
  assert.equal(path.basename(detection.lockfilePath), "package-lock.json");
  assert.deepEqual(Object.keys(detection.scripts).sort(), ["build", "lint", "start", "test"]);
});

test("runs prerequisites, setup, build, test, and lint", async () => {
  const adapter = new WebProjectAdapter(fixtureRoot);
  for (const operation of ["prerequisites", "setup", "build", "test", "lint"]) {
    const result = await adapter[operation]();
    assert.equal(result.status, "passed", `${operation}: ${result.stderr}`);
    assert.equal(result.operation, operation);
  }
});

test("starts, reports its URL, becomes ready, and stops its process tree", async (context) => {
  const adapter = new WebProjectAdapter(fixtureRoot);
  const running = await adapter.start({ readyPath: "/api/health", timeoutMs: 5_000 });
  context.after(async () => {
    if (running.process.exitCode === null && running.process.signalCode === null) await adapter.stop(running);
  });
  const response = await fetch(`${running.url}/api/items`);
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].title, "Adapter fixture");
  assert.ok(running.port > 0);

  const result = await adapter.stop(running);
  assert.equal(result.status, "passed", result.stderr);
  await waitForExit(running.process);
  assert.ok(running.process.exitCode !== null || running.process.signalCode !== null);
});

test("distinguishes a startup failure", async () => {
  const adapter = new WebProjectAdapter(fixtureRoot);
  await assert.rejects(
    adapter.start({ readyPath: "/api/health", timeoutMs: 3_000, environment: { FIXTURE_START_FAILURE: "1" } }),
    (error) => error instanceof AdapterStartError && error.code === "START_FAILED" && error.stderr.includes("fixture startup failure"),
  );
});

test("distinguishes a ready timeout and collects the process", async () => {
  const adapter = new WebProjectAdapter(fixtureRoot);
  await assert.rejects(
    adapter.start({ readyPath: "/api/health", timeoutMs: 300, environment: { FIXTURE_NEVER_READY: "1" } }),
    (error) => error instanceof AdapterStartError && error.code === "READY_TIMEOUT",
  );
});

test("exposes an abnormal exit after readiness", async () => {
  const adapter = new WebProjectAdapter(fixtureRoot);
  const running = await adapter.start({
    readyPath: "/api/health",
    timeoutMs: 3_000,
    environment: { FIXTURE_EXIT_AFTER_MS: "500" },
  });
  await waitForExit(running.process);
  assert.notEqual(running.process.exitCode, 0);
});
