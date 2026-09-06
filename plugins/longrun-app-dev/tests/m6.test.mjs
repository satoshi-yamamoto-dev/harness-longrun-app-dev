import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { Generator, GeneratorExecutionError, createGeneratorAgent, requirementIds, validateBuildReport } from "../runtime/dist/generator/index.js";

const spec = JSON.parse(await readFile(new URL("fixtures/planner-valid-spec.json", import.meta.url), "utf8"));
const limits = { maxCostUsd: 1, maxDurationMs: 10_000, maxConsecutiveApiFailures: 3 };
const input = {
  runId: "generator-test", round: 1, spec,
  adapter: { detection: { detected: false, projectRoot: process.cwd(), packageJsonPath: null, packageManager: null, lockfilePath: null, scripts: {} }, config: { type: "web" } },
};
const report = {
  schemaVersion: 1, runId: input.runId, specId: spec.specId, round: 1,
  startedAt: "2026-09-05T00:00:00Z", completedAt: "2026-09-05T00:01:00Z",
  summary: "Mock implementation for orchestration validation; not a built application.",
  changedFiles: [{ path: "src/app.js", change: "added", summary: "Mock implementation" }],
  requirementResults: requirementIds(spec).map((requirementId) => ({ requirementId, status: "implemented", evidence: ["mock: verification"] })),
  qaIssueResults: [], verification: [{ command: "node --test", status: "passed", exitCode: 0, durationMs: 1 }], artifacts: [], knownIssues: [],
};
const scores = Object.fromEntries(["productDepth", "functionality", "visualDesign", "codeQuality"].map((key) => [key, { score: 2, threshold: 4, applicable: true, rationale: "Mock failure" }]));
const qa = {
  schemaVersion: 1, runId: input.runId, specId: spec.specId, round: 1,
  startedAt: report.startedAt, completedAt: report.completedAt, verdict: "fail", scores,
  issues: [{ issueId: "qa-persist", title: "Schedule lost", severity: "high", specificationIds: ["ac-schedule"], reproductionSteps: ["Approve", "Reload"], expectedResult: "Saved schedule", actualResult: "Empty", evidence: [{ kind: "mock", path: "qa/evidence/reload.txt" }] }],
  requirementResults: [{ requirementId: "ac-schedule", status: "failed", evidence: [] }], evidence: [], summary: "Persistence failed",
};
const envelope = (value) => `<build-report-json>\n${JSON.stringify(value)}\n</build-report-json>`;
class Runner {
  constructor(outputs) { this.outputs = [...outputs]; this.requests = []; }
  async run(request) {
    this.requests.push(request);
    const value = this.outputs.shift();
    if (value === undefined) throw new Error("Unexpected extra call");
    return { status: "completed", terminationReason: "completed", sessionId: "build-session", output: typeof value === "string" ? value : envelope(value),
      totalCostUsd: 0.1, durationMs: 1, sdkDurationMs: 1, turns: 1, eventCount: 1, compactionCount: 0, errorMessages: [],
      usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } };
  }
}
const make = async (runner, budget = limits) => new Generator(runner, await createGeneratorAgent(process.cwd(), "test-model"), budget);

test("initial Build covers all requirements and persists validated reports", async () => {
  const runner = new Runner([report]);
  const store = new ArtifactStore(await mkdtemp(path.join(os.tmpdir(), "generator-test-")));
  const output = await (await make(runner)).buildAndSave(input, store);
  assert.equal(output.sessionId, "build-session");
  assert.deepEqual(await store.readJson("build/round-1.json", "build-report"), report);
  assert.deepEqual(await store.list(), ["build/round-1.json", "build/round-1.md"]);
  assert.match(output.markdown, /ac-schedule/);
  assert.match(runner.requests[0].prompt, /private local workspace/);
  assert.match(runner.requests[0].prompt, /preserve user changes/);
  assert.equal(runner.requests[0].resumeSessionId, undefined);
});

test("repair Build receives full prior artifacts and resolves every QA issue", async () => {
  const repaired = { ...report, round: 2, qaIssueResults: [{ issueId: "qa-persist", status: "resolved", evidence: ["mock: reload test"] }] };
  const runner = new Runner([repaired]);
  const output = await (await make(runner)).build({ ...input, round: 2, previousBuild: report, qa });
  assert.equal(output.report.round, 2);
  assert.match(runner.requests[0].prompt, /Schedule lost/);
  assert.match(runner.requests[0].prompt, /actualResult/);
  assert.equal(runner.requests[0].resumeSessionId, undefined);
});

test("invalid report repair resumes the session and reduces remaining budget", async () => {
  const runner = new Runner([{ ...report, requirementResults: [] }, report]);
  const output = await (await make(runner)).build(input);
  assert.equal(output.attempts, 2);
  assert.equal(runner.requests[1].resumeSessionId, "build-session");
  assert.equal(runner.requests[1].limits.maxCostUsd, 0.9);
  assert.ok(runner.requests[1].limits.maxDurationMs <= runner.requests[0].limits.maxDurationMs);
  assert.match(runner.requests[1].prompt, /missing 'ac-schedule'/);
});

test("schema errors and malformed envelopes are repaired before acceptance", async () => {
  const runner = new Runner(["not-json", { schemaVersion: 1 }, report]);
  assert.equal((await (await make(runner)).build(input)).attempts, 3);
  assert.match(runner.requests[1].prompt, /envelope/);
  assert.match(runner.requests[2].prompt, /build-report/);
});

test("semantic validation rejects wrong IDs, unsafe paths and false success records", () => {
  const cases = [
    { ...report, round: 2 },
    { ...report, requirementResults: [...report.requirementResults, report.requirementResults[0]] },
    { ...report, requirementResults: [{ requirementId: "invented", status: "implemented", evidence: [] }] },
    ...["../outside.js", "C:\\outside.js", "/outside.js", "src/../../outside", "C:relative.js"].map((p) => ({ ...report, changedFiles: [{ path: p, change: "added", summary: "x" }] })),
    { ...report, verification: [{ command: "test", status: "passed", exitCode: 1, durationMs: 0 }] },
    { ...report, verification: [{ command: "lint", status: "skipped", exitCode: null, durationMs: 0 }] },
    { ...report, verification: [] },
    { ...report, completedAt: "2026-09-04T00:00:00Z" },
  ];
  for (const candidate of cases) assert.ok(validateBuildReport(candidate, spec, input.runId, 1).length > 0, JSON.stringify(candidate));
  assert.ok(validateBuildReport({ ...report, round: 2 }, spec, input.runId, 2, qa).some((e) => e.includes("qa-persist")));
});

test("mismatched previous artifacts are rejected before model execution", async () => {
  const runner = new Runner([]);
  const generator = await make(runner);
  for (const bad of [
    { ...input, round: 2 },
    { ...input, round: 2, previousBuild: report, qa: { ...qa, runId: "other" } },
    { ...input, round: 2, previousBuild: report, qa: { ...qa, verdict: "pass" } },
    { ...input, repairAttempts: -1 },
    { ...input, qa },
    { ...input, adapter: { ...input.adapter, detection: { ...input.adapter.detection, projectRoot: path.join(process.cwd(), "other") } } },
  ]) await assert.rejects(generator.build(bad));
  assert.equal(runner.requests.length, 0);
});

test("exhausted retries never save an invalid report", async () => {
  const runner = new Runner(["bad", "bad"]);
  const store = new ArtifactStore(await mkdtemp(path.join(os.tmpdir(), "generator-invalid-")));
  await assert.rejects((await make(runner)).buildAndSave({ ...input, repairAttempts: 1 }, store), (e) => e instanceof GeneratorExecutionError && e.attempts === 2);
  assert.deepEqual(await store.list(), []);
});

test("cost exhaustion prevents a fresh repair call", async () => {
  const runner = new Runner(["bad"]);
  await assert.rejects((await make(runner, { ...limits, maxCostUsd: 0.1 })).build(input), /budget exhausted/);
  assert.equal(runner.requests.length, 1);
});

test("session failure does not attempt report repair", async () => {
  let calls = 0;
  const generator = await make({ async run() { calls++; return { status: "stopped", terminationReason: "timeout", errorMessages: [], totalCostUsd: 0 }; } });
  await assert.rejects(generator.build(input), (e) => e instanceof GeneratorExecutionError && /timeout/.test(e.message));
  assert.equal(calls, 1);
});
