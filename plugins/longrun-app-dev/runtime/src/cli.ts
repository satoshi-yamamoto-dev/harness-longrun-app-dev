import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, realpath, lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadConfig } from "./config/index.js";
import { WebProjectAdapter } from "./adapters/index.js";
import { findPlaywrightCli } from "./evaluator/index.js";
import { Orchestrator, cleanRun, recoverRunLock } from "./orchestrator/index.js";
import { ClaudeAgentSdkClient, DefaultSessionRunner } from "./sessions/index.js";
import { inspectEnvironment, inspectRuns } from "./orchestrator/inspection.js";
import { atomicWriteFile } from "./artifacts/index.js";
import { redactText, redactValue } from "./logging/redaction.js";

const VERSION = "0.1.0";
const pluginRoot = fileURLToPath(new URL("../../", import.meta.url));
const execute = promisify(execFile);
function writeResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(redactValue(value))}\n`);
}
async function main(args: string[]): Promise<number> {
  const [command, ...request] = args;
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`longrun-app-dev ${VERSION}\n\nUsage: longrun-app-dev <command>\n\ninit: create config without overwriting existing settings\nstart <request>: run Planner, Generator and required Web QA under configured limits\nstatus [run-id]: inspect saved Run states\ndoctor: inventory configuration and dependencies (no model or browser launch)\nstop: request cancellation of the current project Run\nresume <run-id>: resume a saved safe boundary with remaining budget\nrecover-lock: archive a confirmed dead local owner's lock\nclean <run-id>: delete one terminal Run's saved artifacts\n`);
    return 0;
  }
  if (["--version", "-v"].includes(command)) { process.stdout.write(`${VERSION}\n`); return 0; }
  const root = process.cwd();
  const configPath = join(root, ".longrun-app-dev/config.yaml");
  if (command === "recover-lock") {
    if (request.length) throw new Error("Usage: recover-lock");
    writeResult({ status: "lock-recovered", archive: await recoverRunLock(root) });
    return 0;
  }
  if (command === "resume") {
    if (request.length !== 1) throw new Error("Usage: resume <run-id>");
    const result = await new Orchestrator(new DefaultSessionRunner(new ClaudeAgentSdkClient()), new WebProjectAdapter(root))
      .resume(root, request[0]!, { cliPath: await findPlaywrightCli(pluginRoot), browser: process.platform === "win32" ? "msedge" : "chromium" });
    writeResult({ status: result.state.phase.toLowerCase(), runRoot: result.layout.runRoot, usage: result.state.usage });
    return result.state.phase === "COMPLETED" ? 0 : 1;
  }
  if (command === "clean") {
    if (request.length !== 1) throw new Error("Usage: clean <terminal-run-id>");
    writeResult({ status: "cleaned", path: await cleanRun(root, request[0]!) });
    return 0;
  }
  if (command === "stop") {
    if (request.length) throw new Error("Usage: stop (current project Run)");
    const directory = join(await realpath(root), ".longrun-app-dev");
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("Harness directory must not redirect");
    const lockPath = join(directory, "run.lock");
    if ((await lstat(lockPath)).isSymbolicLink()) throw new Error("Run lock must not redirect");
    const owner = JSON.parse(await readFile(lockPath, "utf8")) as { token?: string };
    if (!owner.token) throw new Error("Invalid Run lock");
    await atomicWriteFile(join(directory, "stop.request"), JSON.stringify({ token: owner.token }));
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
    await mkdir(join(root, ".longrun-app-dev"), { recursive: true });
    let status = "initialized";
    try { await copyFile(join(pluginRoot, "templates/project-config.yaml"), configPath, constants.COPYFILE_EXCL); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; status = "already-initialized"; }
    writeResult({ status, configPath, next: "Set model IDs and explicit cost/time limits before start. Playwright MCP and a supported browser must already be installed." });
    return 0;
  }
  if (command !== "start") throw new Error(`Unknown command: ${command}`);
  if (!request.join(" ").trim()) throw new Error("start requires an application request");
  const config = await loadConfig(configPath);
  if (Object.values(config.models).some((model) => model.includes("<"))) throw new Error("Replace model placeholders in config.yaml before starting");
  const git = async (args: string[]) => (await execute("git", args, { cwd: root, windowsHide: true })).stdout.trim();
  let headSha: string;
  try { headSha = await git(["rev-parse", "--verify", "HEAD"]); }
  catch { throw new Error("start requires a Git repository with an initial commit"); }
  const initialGit = { headSha, branch: await git(["branch", "--show-current"]) || "detached", hadUncommittedChanges: (await git(["status", "--porcelain"])).length > 0 };
  if (initialGit.hadUncommittedChanges) throw new Error("start requires a clean Git working tree; preserve and commit your changes before running");
  if (initialGit.branch === "detached") throw new Error("start requires a named Git branch");
  const cliPath = await findPlaywrightCli(pluginRoot);
  const run = await new Orchestrator(new DefaultSessionRunner(new ClaudeAgentSdkClient()), new WebProjectAdapter(root)).run({ request: request.join(" "), projectRoot: root,
    config, initialGit, playwright: { cliPath, browser: process.platform === "win32" ? "msedge" : "chromium" } });
  writeResult({ status: run.state.phase.toLowerCase(), runRoot: run.layout.runRoot, terminationReason: run.state.terminationReason, usage: run.state.usage });
  return run.state.phase === "COMPLETED" ? 0 : 1;
}
try { process.exitCode = await main(process.argv.slice(2)); }
catch (error) { process.stderr.write(`${JSON.stringify({ status: "failed", error: redactText(error instanceof Error ? error.message : String(error)) })}\n`); process.exitCode = 1; }

