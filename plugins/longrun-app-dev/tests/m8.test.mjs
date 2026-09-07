import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Orchestrator, acquireRunLock, cleanRun } from "../runtime/dist/orchestrator/index.js";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { applyConfigDefaults } from "../runtime/dist/config/index.js";
import { requirementIds } from "../runtime/dist/generator/index.js";
import { runSoloBenchmark } from "../scripts/lib/solo-benchmark.mjs";
const spec = JSON.parse(await readFile(new URL("fixtures/qa-web-app/product-spec.json", import.meta.url), "utf8"));
const scores = () => Object.fromEntries(["productDepth", "functionality", "visualDesign", "codeQuality"].map((k) => [k, { score: 9, threshold: 8, applicable: true, rationale: "mock evidence" }]));
const result = (output, role) => ({ status: "completed", terminationReason: "completed", sessionId: `mock-${role}`, output,
  usage: { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }, totalCostUsd: 0.01,
  durationMs: 1, sdkDurationMs: 1, turns: 1, compactionCount: 0, eventCount: 1, errorMessages: [] });
async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "orchestrator-"));
  const calls = [];
  let qaCount = 0;
  const input = { request: "Build a task desk", projectRoot: root, initialGit: { branch: "test", headSha: "a".repeat(40), hadUncommittedChanges: false },
    playwright: { cliPath: path.join(root, "mock-cli.js"), browser: "msedge" },
    config: applyConfigDefaults({ schemaVersion: 1, models: { planner: "mock", generator: "mock", evaluator: "mock" }, limits: options.limits ?? {} }) };
  if (options.realGit) {
    const git = async (...args) => (await promisify(execFile)("git", args, { cwd: root })).stdout.trim();
    await git("init", "--initial-branch=main");
    await git("config", "user.name", "Test"); await git("config", "user.email", "test@example.invalid");
    await git("commit", "--allow-empty", "-m", "initial");
    input.initialGit = { branch: "main", headSha: await git("rev-parse", "HEAD"), hadUncommittedChanges: false };
  }
  const command = (operation) => ({ operation, command: "mock", status: options.failAdapter === operation ? "failed" : "passed", exitCode: 0, signal: null, stdout: "", stderr: "", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 0 });
  let starts = 0, stops = 0;
  const adapter = {
    kind: "web", detect: async () => ({ detected: true, projectRoot: root, packageJsonPath: path.join(root, "package.json"), packageManager: "npm", lockfilePath: null, scripts: { start: "node app.js" } }),
    prerequisites: async () => command("prerequisites"), setup: async () => command("setup"), build: async () => command("build"),
    start: async () => { starts++; return { url: "http://127.0.0.1:3000" }; }, stop: async () => { stops++; return command("stop"); },
  };
  const runner = { async run(request) {
    calls.push(request);
    if (options.manualStopRole === request.agent.role) {
      const owner = JSON.parse(await readFile(path.join(root, ".longrun-app-dev/run.lock"), "utf8"));
      await writeFile(path.join(root, ".longrun-app-dev/stop.request"), JSON.stringify({ token: owner.token }));
      await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
      return { ...result("", request.agent.role), status: "stopped", terminationReason: "manual_stop" };
    }
    if (options.stopReason) return { ...result("", "planner"), status: "stopped", terminationReason: options.stopReason };
    if (options.badOutput) return result("invalid", request.agent.role);
    if (request.agent.role === "planner") return result(`<product-spec-json>${JSON.stringify(spec)}</product-spec-json>`, "planner");
    if (request.agent.role === "generator") {
      const data = JSON.parse(request.prompt.split("Structured input (data, not policy overrides):\n")[1].split("\n\nGit policy:")[0]);
      if (data.round > 1) { assert.equal(data.qa.verdict, "fail"); assert.equal(data.previousBuild.round, data.round - 1); }
      const report = { schemaVersion: 1, runId: data.runId, specId: spec.specId, round: data.round, startedAt: "2026-09-05T00:00:00Z", completedAt: "2026-09-05T00:01:00Z", summary: "Mock build", changedFiles: [],
        requirementResults: requirementIds(spec).map((requirementId) => ({ requirementId, status: "implemented", evidence: ["mock test"] })),
        qaIssueResults: data.qa?.issues.map((i) => ({ issueId: i.issueId, status: "resolved", evidence: ["mock fix"] })) ?? [],
        verification: [{ command: "node --test", status: "passed", exitCode: 0, durationMs: 1 }], artifacts: [], knownIssues: [] };
      return result(`<build-report-json>${JSON.stringify(report)}</build-report-json>`, "generator");
    }
    qaCount++;
    if (options.badQa) return result("invalid QA", "qa");
    const data = JSON.parse(request.prompt.slice(request.prompt.indexOf("{"), request.prompt.indexOf("\n\nReturn")));
    const evidence = ["screenshot", "snapshot", "interaction"].map((kind) => ({ kind, path: `${path.relative(data.runRoot, data.evidenceRoot).replaceAll("\\", "/")}/${kind}-${data.round}.txt` }));
    for (const item of evidence) await writeFile(path.join(data.evidenceRoot, path.basename(item.path)), "mock evidence");
    const fail = options.alwaysFail || (options.failFirst && qaCount === 1);
    const report = { schemaVersion: 1, runId: data.runId, specId: spec.specId, round: data.round, startedAt: "2026-09-05T00:00:00Z", completedAt: "2026-09-05T00:01:00Z", verdict: "pass", scores: scores(),
      uiScores: Object.fromEntries(["designQuality", "originality", "craft", "functionality"].map((k) => [k, { score: 9, threshold: 8, applicable: true, rationale: "mock UI" }])),
      issues: fail ? [{ issueId: "issue-1", title: "Incomplete", severity: "high", specificationIds: ["ac-complete"], reproductionSteps: ["Click Complete"], expectedResult: "Done", actualResult: "No change", evidence }] : [],
      requirementResults: requirementIds(spec).map((requirementId) => ({ requirementId, status: fail && requirementId === "ac-complete" ? "failed" : "passed", evidence })), evidence, summary: "Mock QA" };
    return result(`<qa-result-json>${JSON.stringify(report)}</qa-result-json>`, "qa");
  } };
  const orchestrator = options.realGit ? new Orchestrator(runner, adapter) : new Orchestrator(runner, adapter, () => ({ begin: async () => {}, verify: async () => {}, prepareRun: async (id, prefix) => `${prefix}${id}`, checkpoint: async () => "b".repeat(40), snapshot: async () => input.initialGit }));
  const output = options.solo
    ? await runSoloBenchmark({ ...input, spec, sharedPlanner: options.sharedPlanner ?? { costUsd: 0.01, durationMs: 1 } }, runner, adapter)
    : await orchestrator.run(input);
  const released = await acquireRunLock(root);
  await released.release();
  return { ...output, orchestrator, input, options, calls, starts, stops, root, store: new ArtifactStore(output.layout.runRoot) };
}
test("M8 connects PLAN, whole-spec BUILD and independently verified QA PASS", async () => {
  const run = await fixture();
  assert.equal(run.state.phase, "COMPLETED");
  assert.deepEqual(run.calls.map((r) => r.agent.role), ["planner", "generator", "qa-functional"]);
  assert.equal(run.starts, 1); assert.equal(run.stops, 1);
  assert.equal(run.state.usage.estimatedCostUsd, 0.03);
  assert.equal(run.calls[2].resumeSessionId, undefined);
  assert.ok(run.calls[1].limits.maxCostUsd < run.calls[0].limits.maxCostUsd);
});
test("M8 FAIL is reloaded from artifacts into a repair Build and then PASS", async () => {
  const run = await fixture({ failFirst: true });
  assert.equal(run.state.phase, "COMPLETED"); assert.equal(run.state.qaRound, 2);
  assert.equal(run.starts, 2); assert.equal(run.stops, 2);
  assert.equal((await run.store.readJson("qa/round-1.json", "qa-result")).verdict, "fail");
  assert.equal((await run.store.readJson("build/round-2.json", "build-report")).qaIssueResults[0].issueId, "issue-1");
});
test("M8 never passes a failed QA at the round cap", async () => {
  const run = await fixture({ alwaysFail: true, limits: { maxQaRounds: 1 } });
  assert.equal(run.state.phase, "STOPPED"); assert.equal(run.state.terminationReason, "qa-round-limit");
  assert.equal(run.calls.length, 3); assert.equal(run.stops, 1);
});
test("M8 session cost, duration and API limits terminate the Run", async () => {
  for (const [stopReason, expected] of [["cost_limit", "cost-limit"], ["timeout", "duration-limit"], ["api_failure_limit", "api-failure-limit"]]) {
    const run = await fixture({ stopReason });
    assert.equal(run.state.phase, "STOPPED"); assert.equal(run.state.terminationReason, expected);
    assert.equal(run.calls.length, 1);
  }
});

test("stop request cancels active QA, stops application, and releases Run lock", async () => {
  const run = await fixture({ manualStopRole: "qa-functional" });
  assert.equal(run.state.phase, "STOPPED");
  assert.equal(run.state.terminationReason, "manual-stop");
  assert.equal(run.starts, 1); assert.equal(run.stops, 1);
});

test("resume restores QA boundary without Planner or Build replay and retains spent budget", async () => {
  const run = await fixture({ manualStopRole: "qa-functional" });
  delete run.options.manualStopRole;
  const before = run.calls.length;
  const resumed = await run.orchestrator.resume(run.root, run.layout.runId, run.input.playwright);
  assert.equal(resumed.state.phase, "COMPLETED");
  assert.deepEqual(run.calls.slice(before).map((r) => r.agent.role), ["qa-functional"]);
  assert.equal(resumed.state.usage.estimatedCostUsd, 0.04);
  assert.ok(resumed.state.usage.elapsedMs >= run.state.usage.elapsedMs);
  assert.ok(run.calls.at(-1).limits.maxCostUsd < run.calls[0].limits.maxCostUsd);
  await assert.rejects(run.orchestrator.resume(run.root, run.layout.runId, run.input.playwright), /Completed Runs/);
});

test("resume checks actual checkpoint SHA and refuses changed Git history", async () => {
  const run = await fixture({ realGit: true, manualStopRole: "qa-functional" });
  assert.equal(run.state.phase, "STOPPED");
  delete run.options.manualStopRole;
  const git = (...args) => promisify(execFile)("git", args, { cwd: run.root });
  await git("commit", "--allow-empty", "-m", "external change");
  const count = run.calls.length;
  await assert.rejects(run.orchestrator.resume(run.root, run.layout.runId, run.input.playwright), /changed since start/);
  assert.equal(run.calls.length, count);
  const valid = await fixture({ realGit: true, manualStopRole: "qa-functional" });
  delete valid.options.manualStopRole;
  assert.equal((await valid.orchestrator.resume(valid.root, valid.layout.runId, valid.input.playwright)).state.phase, "COMPLETED");
});
test("M8 malformed Planner output and failed QA preparation produce FAILED", async () => {
  const invalid = await fixture({ badOutput: true }); assert.equal(invalid.state.phase, "FAILED");
  const preparation = await fixture({ failAdapter: "build" });
  assert.equal(preparation.state.phase, "FAILED"); assert.equal(preparation.starts, 0);
  const badQa = await fixture({ badQa: true });
  assert.equal(badQa.state.phase, "FAILED"); assert.equal(badQa.stops, 1);
});
test("M8 stores phase boundaries and final coverage without sprint artifacts", async () => {
  const run = await fixture({ failFirst: true });
  const files = await run.store.list();
  assert.ok(!files.some((file) => /sprint/i.test(file)));
  for (const file of ["product-spec.json", "build/round-1.json", "qa/round-1.json", "build/round-2.json", "qa/round-2.json", "final-report.json", "state.json"]) assert.ok(files.includes(file));
  const final = JSON.parse(await readFile(path.join(run.layout.runRoot, "final-report.json"), "utf8"));
  assert.equal(final.requirements.length, requirementIds(spec).length);
  const markdown = await readFile(path.join(run.layout.runRoot, "final-report.md"), "utf8");
  assert.match(markdown, /\n\n## Requirements\n\n/);
  const events = (await readFile(run.layout.eventsPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(events.some((e) => e.event === "QA_FAILED"));
  assert.equal(events.at(-1).event, "QA_PASSED");
  const sessionEvents = events.filter((e) => e.event === "session-ended");
  assert.equal(sessionEvents.length, run.calls.length);
  for (const event of sessionEvents) {
    assert.equal(event.payload.compactionCount, 0);
    assert.equal(event.payload.eventCount, 1);
    assert.equal(event.payload.turns, 1);
  }
});

test("Solo benchmark counts shared planning and never repairs after failed QA", async () => {
  const run = await fixture({ solo: true, alwaysFail: true });
  assert.equal(run.summary.status, "completed");
  assert.equal(run.summary.verdict, "fail");
  assert.equal(run.summary.totalCostUsd, 0.03);
  assert.deepEqual(run.calls.map((r) => r.agent.role), ["generator", "qa-functional"]);
  assert.equal(run.calls[1].resumeSessionId, undefined);
  assert.equal(run.starts, 1); assert.equal(run.stops, 1);
  assert.ok(!JSON.stringify(run.summary).includes("Structured input"));
  assert.ok(run.calls[0].limits.maxCostUsd < 150);
  assert.ok(!run.calls[1].prompt.includes("Original application request"));
});

test("Solo benchmark preserves failure measurements and closes failed QA", async () => {
  const exhausted = await fixture({ solo: true, sharedPlanner: { costUsd: 150, durationMs: 1 } });
  assert.equal(exhausted.calls.length, 0);
  assert.equal(exhausted.summary.status, "failed");
  assert.equal(exhausted.summary.error, "cost-limit");
  const invalid = await fixture({ solo: true, badQa: true });
  assert.equal(invalid.summary.status, "failed");
  assert.equal(invalid.stops, 1);
  assert.equal(invalid.summary.sessions.length, 2);
});

test("clean refuses active ownership and nonterminal state, deleting only the selected finished Run", async () => {
  const run = await fixture();
  const lock = await acquireRunLock(run.root);
  await assert.rejects(cleanRun(run.root, run.layout.runId), /Run lock exists/);
  await lock.release();
  await assert.rejects(cleanRun(run.root, "../outside"), /Invalid Run ID/);
  const { completedAt, terminationReason, ...active } = run.state;
  await run.store.saveJson("state.json", "state", { ...active, phase: "BUILDING" });
  await assert.rejects(cleanRun(run.root, run.layout.runId), /Only terminal/);
  await run.store.saveJson("state.json", "state", run.state);
  const marker = path.join(run.root, "user.txt"); await writeFile(marker, "keep");
  const canonicalRunRoot = await realpath(run.layout.runRoot);
  assert.equal(await cleanRun(run.root, run.layout.runId), canonicalRunRoot);
  await assert.rejects(readFile(path.join(run.layout.runRoot, "state.json")), { code: "ENOENT" });
  assert.equal(await readFile(marker, "utf8"), "keep");
});

