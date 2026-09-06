import type { QaResult, QualityScore, QualityThresholds } from "../contracts/index.js";

export const QUALITY_DIMENSIONS = ["productDepth", "functionality", "visualDesign", "codeQuality"] as const;
export const UI_DIMENSIONS = ["designQuality", "originality", "craft", "functionality"] as const;
export function validateThresholds(thresholds: QualityThresholds): void {
  for (const key of QUALITY_DIMENSIONS) if (!Number.isFinite(thresholds[key]) || thresholds[key] < 0 || thresholds[key] > 10) throw new TypeError(`Invalid threshold ${key}`);
}
export function applyWebThresholds(result: QaResult, thresholds: QualityThresholds): QaResult {
  validateThresholds(thresholds);
  if (!result.uiScores) throw new TypeError("Web QA requires all four uiScores");
  const normalize = (score: QualityScore, threshold: number): QualityScore => ({ ...score, threshold });
  const scores = { ...result.scores };
  const uiScores = { ...result.uiScores };
  for (const key of QUALITY_DIMENSIONS) scores[key] = normalize(scores[key], thresholds[key]);
  for (const key of UI_DIMENSIONS) uiScores[key] = normalize(uiScores[key], key === "functionality" ? thresholds.functionality : thresholds.visualDesign);
  const passed = (score: QualityScore) => score.applicable && score.score !== null && Number.isFinite(score.score) && score.score >= score.threshold && score.score <= 10;
  const verdict = [...Object.values(scores), ...Object.values(uiScores)].every(passed)
    && result.requirementResults.length > 0 && result.requirementResults.every((item) => item.status === "passed") && result.issues.length === 0 ? "pass" : "fail";
  return { ...result, scores, uiScores, verdict };
}
