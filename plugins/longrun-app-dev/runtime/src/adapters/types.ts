export type AdapterOperation = "prerequisites" | "setup" | "build" | "test" | "lint" | "start" | "stop";
export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";
export interface AdapterCommandOptions { readonly timeoutMs?: number; readonly signal?: AbortSignal; }

export interface AdapterCommandResult {
  readonly operation: AdapterOperation;
  readonly command: string | null;
  readonly status: "passed" | "failed" | "skipped";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly reason?: string;
}

export interface ProjectDetection {
  readonly detected: boolean;
  readonly projectRoot: string;
  readonly packageJsonPath: string | null;
  readonly packageManager: PackageManager | null;
  readonly lockfilePath: string | null;
  readonly scripts: Readonly<Record<string, string>>;
  readonly reason?: string;
}

export interface AdapterStartOptions {
  readonly signal?: AbortSignal;
  readonly host?: string;
  readonly port?: number;
  readonly readyPath?: string;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
}

export interface RunningProject {
  readonly url: string;
  readonly host: string;
  readonly port: number;
  readonly pid: number;
  readonly startedAt: string;
  readonly command: string;
  readonly process: import("node:child_process").ChildProcess;
  readonly stdout: () => string;
  readonly stderr: () => string;
}

export interface ProjectAdapter {
  readonly kind: "web";
  detect(): Promise<ProjectDetection>;
  prerequisites(options?: AdapterCommandOptions): Promise<AdapterCommandResult>;
  setup(options?: AdapterCommandOptions): Promise<AdapterCommandResult>;
  build(options?: AdapterCommandOptions): Promise<AdapterCommandResult>;
  test(options?: AdapterCommandOptions): Promise<AdapterCommandResult>;
  lint(options?: AdapterCommandOptions): Promise<AdapterCommandResult>;
  start(options?: AdapterStartOptions): Promise<RunningProject>;
  stop(running: RunningProject): Promise<AdapterCommandResult>;
}
