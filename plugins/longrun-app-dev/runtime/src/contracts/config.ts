export interface HarnessConfig {
  readonly schemaVersion: 1;
  readonly models: ModelConfig;
  readonly evaluation: EvaluationConfig;
  readonly limits: LimitConfig;
  readonly quality: QualityConfig;
  readonly adapter: WebAdapterConfig;
  readonly git: GitConfig;
  readonly logging: LoggingConfig;
}

export interface ModelConfig {
  readonly planner: string;
  readonly generator: string;
  readonly evaluator: string;
}

export interface EvaluationConfig {
  readonly mode: "required";
}

export interface LimitConfig {
  readonly maxQaRounds: number;
  readonly maxDurationMinutes: number;
  readonly maxCostUsd: number;
  readonly maxConsecutiveErrors: number;
}

export interface QualityConfig {
  readonly thresholds: QualityThresholds;
}

export interface QualityThresholds {
  readonly productDepth: number;
  readonly functionality: number;
  readonly visualDesign: number;
  readonly codeQuality: number;
}

export interface WebAdapterConfig {
  readonly type: "auto" | "web";
  readonly setup?: string;
  readonly build?: string;
  readonly start?: string;
  readonly test?: string;
  readonly lint?: string;
  readonly stop?: string;
}

export interface GitConfig {
  readonly workBranchPrefix: string;
  readonly commitEachBuildRound: boolean;
  readonly allowPush: false;
}

export interface LoggingConfig {
  readonly saveFullPrompts: boolean;
  readonly saveFullResponses: boolean;
}
