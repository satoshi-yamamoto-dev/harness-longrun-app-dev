import type { ArtifactReference, IsoDateTime } from "./common.js";

export type QaVerdict = "pass" | "fail";
export type QaSeverity = "critical" | "high" | "medium" | "low";
export type QualityDimension = "productDepth" | "functionality" | "visualDesign" | "codeQuality";

export interface QaResult {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly specId: string;
  readonly round: number;
  readonly startedAt: IsoDateTime;
  readonly completedAt: IsoDateTime;
  readonly verdict: QaVerdict;
  readonly scores: Readonly<Record<QualityDimension, QualityScore>>;
  readonly uiScores?: Readonly<Record<"designQuality" | "originality" | "craft" | "functionality", QualityScore>>;
  readonly issues: readonly QaIssue[];
  readonly requirementResults: readonly QaRequirementResult[];
  readonly evidence: readonly ArtifactReference[];
  readonly summary: string;
}

export interface QualityScore {
  readonly score: number | null;
  readonly threshold: number;
  readonly applicable: boolean;
  readonly rationale: string;
}

export interface QaIssue {
  readonly issueId: string;
  readonly title: string;
  readonly severity: QaSeverity;
  readonly specificationIds: readonly string[];
  readonly reproductionSteps: readonly string[];
  readonly expectedResult: string;
  readonly actualResult: string;
  readonly evidence: readonly ArtifactReference[];
}

export interface QaRequirementResult {
  readonly requirementId: string;
  readonly status: "passed" | "failed" | "not-tested";
  readonly evidence: readonly ArtifactReference[];
  readonly notes?: string;
}
