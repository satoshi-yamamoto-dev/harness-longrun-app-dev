import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  Orchestrator,
  acquireRunLock,
  cleanRun,
  recoverRunLock
} from "./chunks/chunk-MWXF4HW7.js";
import {
  ensureProjectDependencies,
  findProjectPlaywrightCli
} from "./chunks/chunk-4O6357AP.js";
import "./chunks/chunk-EBCTSJ3O.js";
import {
  WebProjectAdapter
} from "./chunks/chunk-4KK4ZLQB.js";
import "./chunks/chunk-DBOTXM3D.js";
import {
  loadConfig
} from "./chunks/chunk-FSOMYPVC.js";
import "./chunks/chunk-2MNF7VRW.js";
import "./chunks/chunk-CCPLXG66.js";
import "./chunks/chunk-AMSUIGH4.js";
import "./chunks/chunk-FJRNEWY2.js";
import "./chunks/chunk-3FFAZEYU.js";
import {
  ClaudeAgentSdkClient,
  DefaultSessionRunner
} from "./chunks/chunk-ZISWBL5N.js";
import {
  ArtifactStore,
  atomicWriteFile
} from "./chunks/chunk-ESBLYH7U.js";
import "./chunks/chunk-2TRA5NZA.js";
import {
  redactText,
  redactValue
} from "./chunks/chunk-5CGYLQMM.js";
import "./chunks/chunk-6PDSFK2S.js";

// runtime/src/cli.ts
import { execFile as execFile2 } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, realpath as realpath2, lstat as lstat2 } from "node:fs/promises";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify as promisify2 } from "node:util";

// runtime/src/orchestrator/inspection.ts
import { execFile } from "node:child_process";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
async function inspectRuns(projectRoot, runId) {
  if (runId !== void 0 && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) throw new Error("Invalid Run ID");
  const root = await realpath(projectRoot);
  const harness = join(root, ".longrun-app-dev");
  const runs = join(harness, "runs");
  try {
    for (const directory of [harness, runs]) {
      if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== resolve(directory)) throw new Error("Run directory must not redirect");
    }
  } catch (error) {
    if (error.code === "ENOENT" && !runId) return { runs: [] };
    throw error;
  }
  const ids = runId ? [runId] : (await readdir(runs, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const summaries = [];
  for (const id of ids) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) continue;
    const directory = join(runs, id);
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("Run directory must not redirect");
    try {
      const state = await new ArtifactStore(directory).readJson("state.json", "state");
      if (state.runId !== id) throw new Error("Run ID mismatch");
      summaries.push({
        runId: id,
        phase: state.phase,
        terminationReason: state.terminationReason,
        updatedAt: state.updatedAt,
        buildRound: state.buildRound,
        qaRound: state.qaRound,
        usage: state.usage
      });
    } catch (error) {
      if (runId) throw error;
      summaries.push({ runId: id, status: "unreadable", reason: "No valid Run state; inspect artifacts (comparison Runs use benchmark-summary.json)" });
    }
  }
  return { runs: summaries, note: "Persisted state only; phase does not prove that a process is alive" };
}
async function inspectEnvironment(root, _pluginRoot) {
  const checks = { node: process.version, authentication: "not-tested", browserLaunch: "not-tested" };
  let complete = true;
  const check = async (name, operation) => {
    try {
      checks[name] = { status: "available", value: await operation() };
    } catch {
      checks[name] = { status: "missing-or-invalid" };
      complete = false;
    }
  };
  const execute2 = promisify(execFile);
  await check("git", async () => (await execute2("git", ["--version"], { cwd: root, windowsHide: true, timeout: 5e3 })).stdout.trim());
  await check("config", async () => {
    const config = await loadConfig(join(root, ".longrun-app-dev/config.yaml"));
    if (Object.values(config.models).some((model) => model.includes("<"))) throw new Error("Model placeholders");
    return { models: config.models, limits: config.limits };
  });
  await check("playwright", () => findProjectPlaywrightCli(root));
  if (process.platform === "win32") {
    await check("browser", async () => {
      for (const directory of [process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", process.env.ProgramFiles ?? "C:\\Program Files"]) {
        const executable = join(directory, "Microsoft/Edge/Application/msedge.exe");
        try {
          await access(executable);
          return { executable, status: "executable-found" };
        } catch {
        }
      }
      throw new Error("Edge missing");
    });
  } else {
    checks.browser = { status: "not-tested", reason: "Browser discovery is currently Windows-only" };
    complete = false;
  }
  return { checks, complete };
}

// runtime/src/cli.ts
var VERSION = "0.1.0";
var pluginRoot = fileURLToPath(new URL("../../", import.meta.url));
var execute = promisify2(execFile2);
function writeResult(value) {
  process.stdout.write(`${JSON.stringify(redactValue(value))}
`);
}
async function main(args) {
  const [command, ...request] = args;
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`longrun-app-dev ${VERSION}

Usage: longrun-app-dev <command>

init: create config and install project-local Playwright MCP dependencies
start <request>: run Planner, Generator and required Web QA under configured limits
status [run-id]: inspect saved Run states
doctor: inventory configuration and dependencies (no model or browser launch)
stop: request cancellation of the current project Run
resume <run-id>: resume a saved safe boundary with remaining budget
recover-lock: archive a confirmed dead local owner's lock
clean <run-id>: delete one terminal Run's saved artifacts
`);
    return 0;
  }
  if (["--version", "-v"].includes(command)) {
    process.stdout.write(`${VERSION}
`);
    return 0;
  }
  const root = process.cwd();
  const configPath = join2(root, ".longrun-app-dev/config.yaml");
  if (command === "recover-lock") {
    if (request.length) throw new Error("Usage: recover-lock");
    writeResult({ status: "lock-recovered", archive: await recoverRunLock(root) });
    return 0;
  }
  if (command === "resume") {
    if (request.length !== 1) throw new Error("Usage: resume <run-id>");
    const result = await new Orchestrator(new DefaultSessionRunner(new ClaudeAgentSdkClient()), new WebProjectAdapter(root)).resume(root, request[0], { cliPath: await findProjectPlaywrightCli(root), browser: process.platform === "win32" ? "msedge" : "chromium" });
    writeResult({ status: result.state.phase.toLowerCase(), runRoot: result.layout.runRoot, usage: result.state.usage });
    return result.state.phase === "COMPLETED" ? 0 : 1;
  }
  if (command === "clean") {
    if (request.length !== 1) throw new Error("Usage: clean <terminal-run-id>");
    writeResult({ status: "cleaned", path: await cleanRun(root, request[0]) });
    return 0;
  }
  if (command === "stop") {
    if (request.length) throw new Error("Usage: stop (current project Run)");
    const directory = join2(await realpath2(root), ".longrun-app-dev");
    if ((await lstat2(directory)).isSymbolicLink()) throw new Error("Harness directory must not redirect");
    const lockPath = join2(directory, "run.lock");
    if ((await lstat2(lockPath)).isSymbolicLink()) throw new Error("Run lock must not redirect");
    const owner = JSON.parse(await readFile(lockPath, "utf8"));
    if (!owner.token) throw new Error("Invalid Run lock");
    await atomicWriteFile(join2(directory, "stop.request"), JSON.stringify({ token: owner.token }));
    writeResult({ status: "stop-requested", note: "Wait for STOPPED state; no PID is killed by this command" });
    return 0;
  }
  if (command === "status") {
    if (request.length > 1) throw new Error("Usage: status [run-id]");
    writeResult(await inspectRuns(root, request[0]));
    return 0;
  }
  if (command === "doctor") {
    if (request.length) throw new Error("Usage: doctor");
    const result = await inspectEnvironment(root, pluginRoot);
    writeResult({ status: result.complete ? "inventory-available" : "incomplete", ...result });
    return result.complete ? 0 : 2;
  }
  if (command === "init") {
    const lock = await acquireRunLock(root);
    try {
      await mkdir(join2(root, ".longrun-app-dev"), { recursive: true });
      let status = "initialized";
      try {
        await copyFile(join2(pluginRoot, "templates/project-config.yaml"), configPath, constants.COPYFILE_EXCL);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        status = "already-initialized";
      }
      const dependencies = await ensureProjectDependencies(root);
      writeResult({ status, configPath, dependencies, next: "Set model IDs and explicit cost/time limits before start. A supported browser must already be installed." });
      return 0;
    } finally {
      await lock.release();
    }
  }
  if (command !== "start") throw new Error(`Unknown command: ${command}`);
  if (!request.join(" ").trim()) throw new Error("start requires an application request");
  const config = await loadConfig(configPath);
  if (Object.values(config.models).some((model) => model.includes("<"))) throw new Error("Replace model placeholders in config.yaml before starting");
  const git = async (args2) => (await execute("git", args2, { cwd: root, windowsHide: true })).stdout.trim();
  let headSha;
  try {
    headSha = await git(["rev-parse", "--verify", "HEAD"]);
  } catch {
    throw new Error("start requires a Git repository with an initial commit");
  }
  const initialGit = { headSha, branch: await git(["branch", "--show-current"]) || "detached", hadUncommittedChanges: (await git(["status", "--porcelain"])).length > 0 };
  if (initialGit.hadUncommittedChanges) throw new Error("start requires a clean Git working tree; preserve and commit your changes before running");
  if (initialGit.branch === "detached") throw new Error("start requires a named Git branch");
  const cliPath = await findProjectPlaywrightCli(root);
  const run = await new Orchestrator(new DefaultSessionRunner(new ClaudeAgentSdkClient()), new WebProjectAdapter(root)).run({
    request: request.join(" "),
    projectRoot: root,
    config,
    initialGit,
    playwright: { cliPath, browser: process.platform === "win32" ? "msedge" : "chromium" }
  });
  writeResult({ status: run.state.phase.toLowerCase(), runRoot: run.layout.runRoot, terminationReason: run.state.terminationReason, usage: run.state.usage });
  return run.state.phase === "COMPLETED" ? 0 : 1;
}
try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: "failed", error: redactText(error instanceof Error ? error.message : String(error)) })}
`);
  process.exitCode = 1;
}
//# sourceMappingURL=cli.js.map
