import type { ArtifactReference, IsoDateTime } from "./common.js";

export type RunPhase =
  | "INITIALIZING"
  | "PLANNING"
  | "BUILDING"
  | "EVALUATING"
  | "PAUSED"
  | "COMPLETED"
  | "STOPPED"
  | "FAILED";

export type TerminationReason =
  | "quality-passed"
  | "quality-not-met"
  | "cost-limit"
  | "duration-limit"
  | "qa-round-limit"
  | "manual-stop"
  | "api-failure-limit"
  | "unrecoverable-error";

export interface RunState {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly phase: RunPhase;
  readonly qaRound: number;
  readonly buildRound: number;
  readonly startedAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly completedAt?: IsoDateTime;
  readonly projectRoot: string;
  readonly initialGit: InitialGitState;
  readonly usage: RunUsage;
  readonly consecutiveApiFailures: number;
  readonly latestArtifacts: readonly ArtifactReference[];
  readonly resumeTarget?: "BUILDING" | "EVALUATING";
  readonly terminationReason?: TerminationReason;
  readonly error?: RunError;
}

export interface InitialGitState {
  readonly branch: string;
  readonly headSha: string;
  readonly hadUncommittedChanges: boolean;
}

export interface RunUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly elapsedMs: number;
}

export interface RunError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}
