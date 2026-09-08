import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  commandText,
  runCommand,
  skipped
} from "./chunk-DBOTXM3D.js";

// runtime/src/adapters/web/detect.ts
import { access, readFile } from "node:fs/promises";
import path from "node:path";
var lockfiles = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"]
];
async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
function packageManagerHint(value) {
  if (typeof value !== "string") return null;
  const name = value.split("@")[0];
  return name === "pnpm" || name === "npm" || name === "yarn" || name === "bun" ? name : null;
}
function scriptEntries(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry) => typeof entry[1] === "string")
  );
}
async function detectWebProject(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const packageJsonPath = path.join(resolvedRoot, "package.json");
  if (!await exists(packageJsonPath)) {
    return {
      detected: false,
      projectRoot: resolvedRoot,
      packageJsonPath: null,
      packageManager: null,
      lockfilePath: null,
      scripts: {},
      reason: "package.json was not found"
    };
  }
  let manifest;
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("package.json must contain an object");
    }
    manifest = parsed;
  } catch (error) {
    return {
      detected: false,
      projectRoot: resolvedRoot,
      packageJsonPath,
      packageManager: null,
      lockfilePath: null,
      scripts: {},
      reason: `package.json could not be read: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  let packageManager = null;
  let lockfilePath = null;
  for (const [filename, manager] of lockfiles) {
    const candidate = path.join(resolvedRoot, filename);
    if (await exists(candidate)) {
      packageManager = manager;
      lockfilePath = candidate;
      break;
    }
  }
  packageManager ??= packageManagerHint(manifest.packageManager) ?? "npm";
  return {
    detected: true,
    projectRoot: resolvedRoot,
    packageJsonPath,
    packageManager,
    lockfilePath,
    scripts: scriptEntries(manifest.scripts)
  };
}

// runtime/src/adapters/web/web-project-adapter.ts
import { spawn } from "node:child_process";
import { createServer } from "node:net";
var AdapterStartError = class extends Error {
  constructor(code, message, stdout = "", stderr = "") {
    super(message);
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
    this.name = "AdapterStartError";
  }
  code;
  stdout;
  stderr;
};
function managerArgs(manager, script) {
  return manager === "npm" ? ["run", script] : ["run", script];
}
function setupArgs(detection) {
  const manager = detection.packageManager;
  if (manager === "pnpm") return detection.lockfilePath ? ["install", "--frozen-lockfile"] : ["install"];
  if (manager === "npm") return detection.lockfilePath ? ["ci"] : ["install"];
  if (manager === "yarn") return detection.lockfilePath ? ["install", "--immutable"] : ["install"];
  return detection.lockfilePath ? ["install", "--frozen-lockfile"] : ["install"];
}
async function availablePort(host) {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const port = address.port;
        server.close((error) => error ? reject(error) : resolve(port));
      } else {
        server.close();
        reject(new Error("Could not allocate a port"));
      }
    });
  });
}
async function waitForReady(child, url, timeoutMs, signal) {
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
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return child.exitCode !== null || child.signalCode !== null ? "exited" : "timeout";
}
async function terminateTree(pid) {
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
  }
}
var WebProjectAdapter = class {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  projectRoot;
  kind = "web";
  detect() {
    return detectWebProject(this.projectRoot);
  }
  async prerequisites(options = {}) {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      return skipped("prerequisites", detection.reason ?? "Web project was not detected");
    }
    return runCommand("prerequisites", detection.packageManager, ["--version"], detection.projectRoot, {}, options.timeoutMs, options.signal);
  }
  async setup(options = {}) {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      return skipped("setup", detection.reason ?? "Web project was not detected");
    }
    return runCommand("setup", detection.packageManager, setupArgs(detection), detection.projectRoot, {}, options.timeoutMs, options.signal);
  }
  build(options = {}) {
    return this.runScript("build", "build", options);
  }
  test(options = {}) {
    return this.runScript("test", "test", options);
  }
  lint(options = {}) {
    return this.runScript("lint", "lint", options);
  }
  async runScript(operation, script, options) {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      return skipped(operation, detection.reason ?? "Web project was not detected");
    }
    if (!(script in detection.scripts)) return skipped(operation, `package script '${script}' is not defined`);
    return runCommand(operation, detection.packageManager, managerArgs(detection.packageManager, script), detection.projectRoot, {}, options.timeoutMs, options.signal);
  }
  async start(options = {}) {
    const detection = await this.detect();
    if (!detection.detected || detection.packageManager === null) {
      throw new AdapterStartError("PROJECT_NOT_DETECTED", detection.reason ?? "Web project was not detected");
    }
    const script = "start" in detection.scripts ? "start" : "dev" in detection.scripts ? "dev" : null;
    if (script === null) throw new AdapterStartError("START_SCRIPT_MISSING", "Neither start nor dev package script is defined");
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? await availablePort(host);
    const args = managerArgs(detection.packageManager, script);
    const spawnOptions = {
      cwd: detection.projectRoot,
      env: { ...process.env, ...options.environment, HOST: host, PORT: String(port) },
      windowsHide: true,
      detached: process.platform !== "win32"
    };
    const child = process.platform === "win32" ? spawn(commandText(detection.packageManager, args), { ...spawnOptions, shell: true }) : spawn(detection.packageManager, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk) => stdout += chunk);
    child.stderr?.setEncoding("utf8").on("data", (chunk) => stderr += chunk);
    const pid = child.pid;
    if (pid === void 0) throw new AdapterStartError("START_FAILED", "The start process did not provide a PID");
    const baseUrl = `http://${host}:${port}`;
    const readyPath = options.readyPath ?? "/";
    const outcome = await waitForReady(child, new URL(readyPath, baseUrl).href, options.timeoutMs ?? 1e4, options.signal);
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
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      command: commandText(detection.packageManager, args),
      process: child,
      stdout: () => stdout,
      stderr: () => stderr
    };
  }
  async stop(running) {
    const started = Date.now();
    await terminateTree(running.pid);
    if (running.process.exitCode === null && running.process.signalCode === null) {
      await Promise.race([
        new Promise((resolve) => running.process.once("exit", () => resolve())),
        new Promise((resolve) => setTimeout(resolve, 2e3))
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
      durationMs: completed - started
    };
  }
};

export {
  detectWebProject,
  AdapterStartError,
  WebProjectAdapter
};
//# sourceMappingURL=chunk-4KK4ZLQB.js.map
