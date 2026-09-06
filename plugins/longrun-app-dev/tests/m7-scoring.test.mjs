import assert from "node:assert/strict";
import test from "node:test";
import { applyWebThresholds } from "../runtime/dist/evaluator/index.js";
const thresholds = { productDepth: 8, functionality: 8, visualDesign: 8, codeQuality: 8 };
const score = () => ({ score: 9, threshold: 1, applicable: true, rationale: "observed" });
const report = () => ({ verdict: "pass", scores: Object.fromEntries(Object.keys(thresholds).map((key) => [key, score()])), uiScores: Object.fromEntries(["designQuality", "originality", "craft", "functionality"].map((key) => [key, score()])), requirementResults: [{ requirementId: "a", status: "passed" }], issues: [] });
test("each common and detailed UI criterion is an independent hard gate", () => {
  assert.equal(applyWebThresholds(report(), thresholds).verdict, "pass");
  for (const group of ["scores", "uiScores"]) for (const key of Object.keys(report()[group])) {
    const input = report(); input[group][key].score = 7.9;
    const result = applyWebThresholds(input, thresholds);
    assert.equal(result.verdict, "fail"); assert.equal(result[group][key].threshold, 8);
  }
});
test("untested, N/A, unresolved issues and model-supplied lower thresholds cannot pass", () => {
  for (const edit of [(r) => { r.scores.visualDesign.applicable = false; }, (r) => { r.scores.functionality.score = null; }, (r) => { r.requirementResults[0].status = "not-tested"; }, (r) => { r.issues.push({ issueId: "x" }); }, (r) => { r.scores.codeQuality.score = 5; }]) {
    const r = report(); edit(r); assert.equal(applyWebThresholds(r, thresholds).verdict, "fail");
  }
  assert.throws(() => applyWebThresholds({ ...report(), uiScores: undefined }, thresholds), /uiScores/);
});
