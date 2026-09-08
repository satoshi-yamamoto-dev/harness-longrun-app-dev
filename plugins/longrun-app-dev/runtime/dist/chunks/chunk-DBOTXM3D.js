import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// runtime/src/adapters/web/process.ts
import { spawn } from "node:child_process";
function commandText(command, args) {
  return [command, ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(" ");
}
async function runCommand(operation, command, args, cwd, environment = {}, timeoutMs = 3e5, signal) {
  signal?.throwIfAborted();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("Command timeout must be positive");
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const child = process.platform === "win32" ? spawn(commandText(command, args), {
    cwd,
    env: { ...process.env, ...environment },
    shell: true,
    windowsHide: true
  }) : spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    windowsHide: true,
    detached: true
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const cancel = () => {
    timedOut = true;
    stderr += signal?.aborted ? "\nCommand stopped" : "\nCommand timed out";
    if (process.platform === "win32" && child.pid) {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      killer.on("error", () => child.kill());
    } else if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  };
  const timer = setTimeout(cancel, timeoutMs);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  child.stdout?.setEncoding("utf8").on("data", (chunk) => stdout += chunk);
  child.stderr?.setEncoding("utf8").on("data", (chunk) => stderr += chunk);
  const outcome = await new Promise((resolve) => {
    child.once("error", (error) => {
      stderr += `${stderr ? "\n" : ""}${error.message}`;
      resolve({ code: null, signal: null });
    });
    child.once("exit", (code, signal2) => resolve({ code, signal: signal2 }));
  });
  clearTimeout(timer);
  signal?.removeEventListener("abort", cancel);
  const completed = Date.now();
  return {
    operation,
    command: commandText(command, args),
    status: !timedOut && outcome.code === 0 ? "passed" : "failed",
    exitCode: outcome.code,
    signal: outcome.signal,
    stdout,
    stderr,
    startedAt,
    completedAt: new Date(completed).toISOString(),
    durationMs: completed - started
  };
}
function skipped(operation, reason) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    operation,
    command: null,
    status: "skipped",
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    reason
  };
}

export {
  commandText,
  runCommand,
  skipped
};
//# sourceMappingURL=chunk-DBOTXM3D.js.map
