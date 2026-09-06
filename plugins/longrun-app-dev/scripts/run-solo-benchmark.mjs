import { safeConsole } from "./lib/safe-output.mjs";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { WebProjectAdapter } from "../runtime/dist/adapters/index.js";
import { findPlaywrightCli } from "../runtime/dist/evaluator/index.js";
import { DefaultSessionRunner, ClaudeAgentSdkClient } from "../runtime/dist/sessions/index.js";
import { runSoloBenchmark } from "./lib/solo-benchmark.mjs";

async function main(args) {
  if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== "--execute")) {
    throw new Error("Usage: node run-solo-benchmark.mjs <Harness Run directory> <clean Solo project> [--execute]");
  }
  const [sourceRoot, projectRoot] = await Promise.all(args.slice(0, 2).map((p) => realpath(p)));
  const store = new ArtifactStore(sourceRoot);
  const config = await store.readJson("config.json", "config");
  const spec = await store.readJson("product-spec.json", "product-spec");
  const sourceState = await store.readJson("state.json", "state");
  if (path.resolve(sourceState.projectRoot) === projectRoot) throw new Error("Solo requires a separate project");
  if (Object.values(config.models).some((model) => model.includes("<"))) throw new Error("Unresolved model IDs");
  const request = await readFile(path.join(sourceRoot, "request.txt"), "utf8");
  const events = (await readFile(path.join(sourceRoot, "logs/events.jsonl"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const planning = events.filter((e) => e.agent === "planner" && e.event === "session-ended");
  if (!planning.length) throw new Error("Source Run has no Planner measurements");
  const sharedPlanner = { costUsd: 0, durationMs: 0 };
  for (const event of planning) {
    for (const key of ["costUsd", "durationMs"]) {
      if (!Number.isFinite(event.payload?.[key]) || event.payload[key] < 0) throw new Error("Invalid Planner measurements");
      sharedPlanner[key] += event.payload[key];
    }
  }
  const git = async (...gitArgs) => (await promisify(execFile)("git", gitArgs, { cwd: projectRoot, windowsHide: true })).stdout.trim();
  const headSha = await git("rev-parse", "--verify", "HEAD");
  if (headSha !== sourceState.initialGit.headSha) throw new Error("Solo HEAD must match the Harness initial HEAD");
  if (await git("status", "--porcelain")) throw new Error("Solo project must have no uncommitted changes");
  const preview = { status: "dry-run", projectRoot, sourceRoot, headSha, models: config.models, limits: config.limits, sharedPlanner };
  if (!args[2]) { safeConsole.log(JSON.stringify(preview, null, 2)); return; }
  const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
  const result = await runSoloBenchmark({ request, spec, config, sharedPlanner, projectRoot,
    playwright: { cliPath: await findPlaywrightCli(pluginRoot), browser: process.platform === "win32" ? "msedge" : "chromium" } },
    new DefaultSessionRunner(new ClaudeAgentSdkClient()), new WebProjectAdapter(projectRoot));
  safeConsole.log(JSON.stringify({ ...result.summary, runRoot: result.layout.runRoot }, null, 2));
  if (result.summary.status !== "completed") process.exitCode = 1;
}
try { await main(process.argv.slice(2)); }
catch (error) { safeConsole.error(error.message); process.exitCode = 1; }
