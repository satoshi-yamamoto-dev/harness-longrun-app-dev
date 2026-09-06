export type AgentRole = "planner" | "generator" | "qa-functional" | "qa-visual";
export type AgentPermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions";

export interface StdioMcpServer {
  readonly type: "stdio";
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface AgentDefinition {
  readonly id: string;
  readonly role: AgentRole;
  readonly model: string;
  readonly systemPrompt: string;
  readonly allowedTools: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly cwd: string;
  readonly permissionMode: AgentPermissionMode;
  readonly mcpServers?: Readonly<Record<string, StdioMcpServer>>;
  readonly strictMcpConfig?: boolean;
}

export interface SessionLimits {
  readonly maxCostUsd: number;
  readonly maxDurationMs: number;
  readonly maxConsecutiveApiFailures: number;
  readonly maxTurns?: number;
}

export interface SessionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
}

export type SessionTerminationReason =
  | "completed"
  | "manual_stop"
  | "sdk_error"
  | "cost_limit"
  | "timeout"
  | "api_failure_limit"
  | "stream_ended_without_result";

export interface SessionRunResult {
  readonly status: "completed" | "failed" | "stopped";
  readonly terminationReason: SessionTerminationReason;
  readonly sessionId: string | null;
  readonly output: string;
  readonly usage: SessionUsage;
  readonly totalCostUsd: number;
  readonly durationMs: number;
  readonly sdkDurationMs: number | null;
  readonly turns: number;
  readonly compactionCount: number;
  readonly eventCount: number;
  readonly errorMessages: readonly string[];
}

export interface SessionRunRequest {
  readonly signal?: AbortSignal;
  readonly agent: AgentDefinition;
  readonly prompt: string;
  readonly limits: SessionLimits;
  readonly resumeSessionId?: string;
}

export interface SdkQueryRequest {
  readonly prompt: string;
  readonly options: {
    readonly model: string;
    readonly systemPrompt: string;
    readonly allowedTools: readonly string[];
    readonly disallowedTools: readonly string[];
    readonly cwd: string;
    readonly permissionMode: AgentPermissionMode;
    readonly maxBudgetUsd: number;
    readonly maxTurns?: number;
    readonly resume?: string;
    readonly mcpServers?: Readonly<Record<string, StdioMcpServer>>;
    readonly strictMcpConfig?: boolean;
  };
}

export type SdkEvent = Readonly<Record<string, unknown>> & {
  readonly type: string;
  readonly subtype?: string;
  readonly session_id?: string;
};

export interface SdkQuery extends AsyncIterable<SdkEvent> {
  interrupt?(): Promise<void>;
  close?(): void;
}

export interface AgentSdkClient {
  query(request: SdkQueryRequest): SdkQuery;
}

export interface SessionRunner {
  run(request: SessionRunRequest): Promise<SessionRunResult>;
}
