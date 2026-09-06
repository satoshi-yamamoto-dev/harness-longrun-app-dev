import { spawn } from "node:child_process";
import { createServer } from "node:net";

import type {
  AdapterCommandResult,
  AdapterCommandOptions,
  AdapterOperation,
  AdapterStartOptions,
  PackageManager,
  ProjectAdapter,
  ProjectDetection,
  RunningProject,
} from "../types.js";
import { detectWebProject } from "./detect.js";
import { commandText, runCommand, skipped } from "./process.js";

export type AdapterStartErrorCode = "PROJECT_NOT_DETECTED" | "START_SCRIPT_MISSING" | "START_FAILED" | "READY_TIMEOUT";

export class AdapterStartError extends Error {
  constructor(
    readonly code: AdapterStartErrorCode,
    message: string,
    readonly stdout = "",
    readonly stderr = "",
  ) {
    super(message);
    this.name = "AdapterStartError";
  }
}

function managerArgs(manager: PackageManager, script: string): readonly string[] {
  return manager === "npm" ? ["run", script] : ["run", script];
}

function setupArgs(detection: ProjectDetection): readonly string[] {
  const manager = detection.packageManager;
  if (manager === "pnpm") return detection.lockfilePath ? ["install", "--frozen-lockfile"] : ["install"];
  if (manager === "npm") return detection.lockfilePath ? ["ci"] : ["install"];
  if (manager === "yarn") return detection.lockfilePath ? ["install", "--immutable"] : ["install"];
  return detection.lockfilePath ? ["install", "--frozen-lockfile"] : ["install"];
}

async function availablePort(host: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const port = address.port;
        server.close((error) => (error ? reject(error) : resolve(port)));
      } else {
        server.close();
        reject(new Error("Could not allocate a port"));
      }
    });
  });
}

async function waitForReady(
  child: import("node:child_process").ChildProcess,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<"ready" | "exited" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return "timeout";
    if (child.exitCode !== null || child.signalCode !== null) return "exited";
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(500, Math.max(1, deadline - Date.now()))) });
      const ready = response.ok;
      await response.arrayBuffer();
      if (ready) return "ready";
    } catch {
      // The server may still be binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return child.exitCode !== null || child.signalCode !== null ? "exited" : "timeout";
}

async function terminateTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try { process.kill(pid, "SIGTERM"); } catch { return; }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try { process.kill(-pid, "SIGKILL"); } catch { /* already stopped */ }
}

export class WebProjectAdapter implements ProjectAdapter {
  readonly kind = "web" as const;

  constructor(readonly projectRoot: string) {}

  detect(): Promise<ProjectDetection> {
    return detectWebProject(this.projectRoot);
  }

  async prerequisites(options: AdapterCommandOptions = {}): Promise<AdapterCommandResult> {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      return skipped("prerequisites", detection.reason ?? "Web project was not detected");
    }
    return runCommand("prerequisites", detection.packageManager, ["--version"], detection.projectRoot, {}, options.timeoutMs, options.signal);
  }

  async setup(options: AdapterCommandOptions = {}): Promise<AdapterCommandResult> {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      return skipped("setup", detection.reason ?? "Web project was not detected");
    }
    return runCommand("setup", detection.packageManager, setupArgs(detection), detection.projectRoot, {}, options.timeoutMs, options.signal);
  }

  build(options: AdapterCommandOptions = {}): Promise<AdapterCommandResult> { return this.runScript("build", "build", options); }
  test(options: AdapterCommandOptions = {}): Promise<AdapterCommandResult> { return this.runScript("test", "test", options); }
  lint(options: AdapterCommandOptions = {}): Promise<AdapterCommandResult> { return this.runScript("lint", "lint", options); }

  private async runScript(operation: AdapterOperation, script: string, options: AdapterCommandOptions): Promise<AdapterCommandResult> {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      return skipped(operation, detection.reason ?? "Web project was not detected");
    }
    if (!(script in detection.scripts)) return skipped(operation, `package script '${script}' is not defined`);
    return runCommand(operation, detection.packageManager, managerArgs(detection.packageManager, script), detection.projectRoot, {}, options.timeoutMs, options.signal);
  }

  async start(options: AdapterStartOptions = {}): Promise<RunningProject> {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      throw new AdapterStartError("PROJECT_NOT_DETECTED", detection.reason ?? "Web project was not detected");
    }
    const script = "start" in detection.scripts ? "start" : "dev" in detection.scripts ? "dev" : null;
    if (script === null) throw new AdapterStartError("START_SCRIPT_MISSING", "Neither start nor dev package script is defined");

    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? (await availablePort(host));
    const args = managerArgs(detection.packageManager, script);
    const spawnOptions = {
      cwd: detection.projectRoot,
      env: { ...process.env, ...options.environment, HOST: host, PORT: String(port) },
      windowsHide: true,
      detached: process.platform !== "win32",
    };
    const child = process.platform === "win32"
      ? spawn(commandText(detection.packageManager, args), { ...spawnOptions, shell: true })
      : spawn(detection.packageManager, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    const pid = child.pid;
    if (pid === undefined) throw new AdapterStartError("START_FAILED", "The start process did not provide a PID");

    const baseUrl = `http://${host}:${port}`;
    const readyPath = options.readyPath ?? "/";
    const outcome = await waitForReady(child, new URL(readyPath, baseUrl).href, options.timeoutMs ?? 10_000, options.signal);
    if (outcome !== "ready") {
      await terminateTree(pid);
      const code = outcome === "timeout" ? "READY_TIMEOUT" : "START_FAILED";
      throw new AdapterStartError(code, outcome === "timeout" ? `Ready check timed out for ${baseUrl}` : "Start process exited before becoming ready", stdout, stderr);
    }
    return {
      url: baseUrl,
      host,
      port,
      pid,
      startedAt: new Date().toISOString(),
      command: commandText(detection.packageManager, args),
      process: child,
      stdout: () => stdout,
      stderr: () => stderr,
    };
  }

  async stop(running: RunningProject): Promise<AdapterCommandResult> {
    const started = Date.now();
    await terminateTree(running.pid);
    if (running.process.exitCode === null && running.process.signalCode === null) {
      await Promise.race([
        new Promise<void>((resolve) => running.process.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    const completed = Date.now();
    return {
      operation: "stop",
      command: `terminate process tree ${running.pid}`,
      status: running.process.exitCode !== null || running.process.signalCode !== null ? "passed" : "failed",
      exitCode: running.process.exitCode,
      signal: running.process.signalCode,
      stdout: running.stdout(),
      stderr: running.stderr(),
      startedAt: new Date(started).toISOString(),
      completedAt: new Date(completed).toISOString(),
      durationMs: completed - started,
    };
  }
}

