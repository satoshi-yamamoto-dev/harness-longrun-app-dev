import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { applyConfigDefaults } from "../runtime/dist/config/index.js";
const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/run-solo-benchmark.mjs", import.meta.url));

test("Solo CLI previews saved inputs without starting agents and rejects dirty targets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "solo-preview-"));
  const project = path.join(root, "project"), source = path.join(root, "source");
  await mkdir(project); await mkdir(path.join(source, "logs"), { recursive: true });
  const git = (...args) => execute("git", args, { cwd: project });
  await git("init", "--initial-branch=main");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
  const headSha = (await git("rev-parse", "HEAD")).stdout.trim();
  const now = new Date().toISOString();
  const state = { schemaVersion: 1, runId: "fixture", phase: "INITIALIZING", qaRound: 0, buildRound: 0,
    startedAt: now, updatedAt: now, projectRoot: path.join(root, "harness-project"), initialGit: { branch: "main", headSha, hadUncommittedChanges: false },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 }, consecutiveApiFailures: 0, latestArtifacts: [] };
  await writeFile(path.join(source, "state.json"), JSON.stringify(state));
  await writeFile(path.join(source, "config.json"), JSON.stringify(applyConfigDefaults({ schemaVersion: 1, models: { planner: "mock", generator: "mock", evaluator: "mock" }, limits: { maxCostUsd: 5, maxDurationMinutes: 30 } })));
  await writeFile(path.join(source, "product-spec.json"), await readFile(new URL("fixtures/qa-web-app/product-spec.json", import.meta.url)));
  await writeFile(path.join(source, "request.txt"), "Build task desk");
  await writeFile(path.join(source, "logs/events.jsonl"), JSON.stringify({ agent: "planner", event: "session-ended", payload: { costUsd: 0.2, durationMs: 200 } }) + "\n");
  const preview = JSON.parse((await execute(process.execPath, [cli, source, project])).stdout);
  assert.equal(preview.status, "dry-run");
  assert.deepEqual(preview.sharedPlanner, { costUsd: 0.2, durationMs: 200 });
  assert.equal(preview.limits.maxCostUsd, 5);
  assert.deepEqual(await readdir(project), [".git"]);
  await writeFile(path.join(project, "user.txt"), "preserve");
  await assert.rejects(execute(process.execPath, [cli, source, project]), (e) => /no uncommitted changes/.test(e.stderr));
  assert.equal(await readFile(path.join(project, "user.txt"), "utf8"), "preserve");
});
