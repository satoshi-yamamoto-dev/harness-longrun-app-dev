import type { ArtifactReference, CommandResult, IsoDateTime } from "./common.js";

export interface BuildReport {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly specId: string;
  readonly round: number;
  readonly startedAt: IsoDateTime;
  readonly completedAt: IsoDateTime;
  readonly summary: string;
  readonly changedFiles: readonly ChangedFile[];
  readonly requirementResults: readonly RequirementImplementation[];
  readonly qaIssueResults: readonly QaIssueResolution[];
  readonly verification: readonly CommandResult[];
  readonly artifacts: readonly ArtifactReference[];
  readonly knownIssues: readonly KnownIssue[];
}

export interface ChangedFile {
  readonly path: string;
  readonly change: "added" | "modified" | "deleted";
  readonly summary: string;
}

export interface RequirementImplementation {
  readonly requirementId: string;
  readonly status: "implemented" | "partial" | "blocked";
  readonly evidence: readonly string[];
  readonly notes?: string;
}

export interface QaIssueResolution {
  readonly issueId: string;
  readonly status: "unaddressed" | "resolved" | "not-reproducible" | "design-changed";
  readonly evidence: readonly string[];
  readonly notes?: string;
}

export interface KnownIssue {
  readonly id: string;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly description: string;
  readonly relatedRequirementIds: readonly string[];
}
