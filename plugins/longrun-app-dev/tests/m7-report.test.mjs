import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { Evaluator, createEvaluatorAgent, validateQaReferences, validateEvidence } from "../runtime/dist/evaluator/index.js";
import { requirementIds } from "../runtime/dist/generator/index.js";
const spec = JSON.parse(await readFile(new URL("fixtures/planner-valid-spec.json", import.meta.url), "utf8"));
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "qa-report-"));
  const evidenceRoot = path.join(root, "qa/evidence"); await mkdir(evidenceRoot, { recursive: true });
  const evidence = ["screenshot", "snapshot", "interaction"].map((kind) => ({ kind, path: `qa/evidence/${kind}.txt` }));
  for (const item of evidence) await writeFile(path.join(root, item.path), "synthetic evidence for mock tests");
  const score = { score: 9, threshold: 1, applicable: true, rationale: "Mock observation" };
  const report = { schemaVersion: 1, runId: "test", specId: spec.specId, round: 1, startedAt: "2026-09-05T00:00:00Z", completedAt: "2026-09-05T00:01:00Z", verdict: "pass",
    scores: Object.fromEntries(["productDepth", "functionality", "visualDesign", "codeQuality"].map((k) => [k, score])), uiScores: Object.fromEntries(["designQuality", "originality", "craft", "functionality"].map((k) => [k, score])), issues: [], requirementResults: requirementIds(spec).map((id) => ({ requirementId: id, status: "passed", evidence })), evidence, summary: "Mock QA" };
  return { root, evidenceRoot, report };
}
test("QA saves schema-valid reports with independently normalized verdict", async () => {
  const { root, evidenceRoot, report } = await setup();
  report.scores.functionality = { ...report.scores.functionality, score: 5 };
  const agent = await createEvaluatorAgent(root, { cliPath: path.join(root, "cli.js"), evidenceRoot, browser: "msedge" });
  const runner = { async run() { return { status: "completed", sessionId: "qa", output: `Final result:\n<qa-result-json>${JSON.stringify(report)}</qa-result-json>` }; } };
  const evaluator = new Evaluator(runner, agent, { maxCostUsd: 1, maxDurationMs: 1000, maxConsecutiveApiFailures: 2 });
  const result = await evaluator.evaluateAndSave({ runId: "test", round: 1, spec, projectRoot: root, evidenceRoot, appUrl: "http://localhost" }, new ArtifactStore(root), root);
  assert.equal(result.report.verdict, "fail");
  assert.equal((await new ArtifactStore(root).readJson("qa/round-1.json", "qa-result")).verdict, "fail");
  assert.match(result.markdown, /FAIL/);
});
test("QA refuses missing coverage, unknown IDs and non-existent or escaping evidence", async () => {
  const { root, evidenceRoot, report } = await setup();
  assert.ok(validateQaReferences({ ...report, requirementResults: [] }, spec).length > 0);
  assert.ok(validateQaReferences({ ...report, requirementResults: [{ requirementId: "unknown", status: "passed", evidence: [] }] }, spec).length > 0);
  for (const file of ["../escape", "C:\\secret", "qa/evidence/missing.txt"]) {
    await assert.rejects(validateEvidence({ ...report, evidence: [...report.evidence, { kind: "api", path: file }] }, root, evidenceRoot));
  }
});
