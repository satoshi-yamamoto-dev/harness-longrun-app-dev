import { execFile } from "node:child_process";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { ArtifactStore } from "../artifacts/index.js";
import { loadConfig } from "../config/index.js";
import { findPlaywrightCli } from "../evaluator/index.js";
import type { RunState } from "../contracts/index.js";

export async function inspectRuns(projectRoot: string, runId?: string): Promise<unknown> {
  if (runId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) throw new Error("Invalid Run ID");
  const root = await realpath(projectRoot);
  const harness = join(root, ".longrun-app-dev");
  const runs = join(harness, "runs");
  try {
    for (const directory of [harness, runs]) {
      if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== resolve(directory)) throw new Error("Run directory must not redirect");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !runId) return { runs: [] };
    throw error;
  }
  const ids = runId ? [runId] : (await readdir(runs, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const summaries = [];
  for (const id of ids) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) continue;
    const directory = join(runs, id);
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("Run directory must not redirect");
    try {
      const state = await new ArtifactStore(directory).readJson<RunState>("state.json", "state");
      if (state.runId !== id) throw new Error("Run ID mismatch");
      summaries.push({ runId: id, phase: state.phase, terminationReason: state.terminationReason, updatedAt: state.updatedAt,
        buildRound: state.buildRound, qaRound: state.qaRound, usage: state.usage });
    } catch (error) {
      if (runId) throw error;
      summaries.push({ runId: id, status: "unreadable", reason: "No valid Run state; inspect artifacts (comparison Runs use benchmark-summary.json)" });
    }
  }
  return { runs: summaries, note: "Persisted state only; phase does not prove that a process is alive" };
}

export async function inspectEnvironment(root: string, pluginRoot: string): Promise<{ checks: Record<string, unknown>; complete: boolean }> {
  const checks: Record<string, unknown> = { node: process.version, authentication: "not-tested", browserLaunch: "not-tested" };
  let complete = true;
  const check = async (name: string, operation: () => Promise<unknown>) => {
    try { checks[name] = { status: "available", value: await operation() }; }
    catch { checks[name] = { status: "missing-or-invalid" }; complete = false; }
  };
  const execute = promisify(execFile);
  await check("git", async () => (await execute("git", ["--version"], { cwd: root, windowsHide: true, timeout: 5000 })).stdout.trim());
  await check("config", async () => {
    const config = await loadConfig(join(root, ".longrun-app-dev/config.yaml"));
    if (Object.values(config.models).some((model) => model.includes("<"))) throw new Error("Model placeholders");
    return { models: config.models, limits: config.limits };
  });
  await check("playwright", () => findPlaywrightCli(pluginRoot));
  if (process.platform === "win32") {
    await check("browser", async () => {
      for (const directory of [process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", process.env.ProgramFiles ?? "C:\\Program Files"]) {
        const executable = join(directory, "Microsoft/Edge/Application/msedge.exe");
        try { await access(executable); return { executable, status: "executable-found" }; } catch { /* next location */ }
      }
      throw new Error("Edge missing");
    });
  } else { checks.browser = { status: "not-tested", reason: "Browser discovery is currently Windows-only" }; complete = false; }
  return { checks, complete };
}
