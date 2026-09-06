import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  Evaluator,
  createEvaluatorAgent
} from "./chunk-22HC24YG.js";
import {
  transitionRunState
} from "./chunk-EBCTSJ3O.js";
import {
  EventLog
} from "./chunk-2MNF7VRW.js";
import {
  Planner,
  createPlannerAgent
} from "./chunk-CCPLXG66.js";
import {
  Generator,
  createGeneratorAgent
} from "./chunk-AMSUIGH4.js";
import {
  ArtifactStore,
  SchemaValidator,
  initializeRunDirectory,
  openRunDirectory
} from "./chunk-ESBLYH7U.js";

// runtime/src/orchestrator/orchestrator.ts
import { mkdir as mkdir2, readFile as readFile2 } from "node:fs/promises";
import { randomUUID as randomUUID2 } from "node:crypto";
import { join as join2 } from "node:path";

// runtime/src/orchestrator/run-lock.ts
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { lstat, mkdir, open, readFile, realpath, unlink, rename, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
function watchRunStop(root, token) {
  const controller = new AbortController();
  const timer = setInterval(() => {
    void readFile(join(root, ".longrun-app-dev/stop.request"), "utf8").then((text) => {
      if (JSON.parse(text).token === token) controller.abort();
    }).catch(() => {
    });
  }, 100);
  return { signal: controller.signal, close: () => clearInterval(timer) };
}
async function recoverRunLock(projectRoot) {
  const root = await realpath(projectRoot);
  const directory = join(root, ".longrun-app-dev");
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("Harness directory must not redirect");
  const mutex = join(directory, "lock-recovery");
  await mkdir(mutex);
  try {
    const path = join(directory, "run.lock");
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Run lock must not redirect");
    const owner = JSON.parse(await readFile(path, "utf8"));
    if (owner.hostname !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !/^[a-f0-9-]{36}$/u.test(owner.token)) throw new Error("Run lock cannot be safely recovered");
    try {
      process.kill(owner.pid, 0);
      throw new Error("Owner PID is still alive; refusing recovery");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    const archive = join(directory, `recovered-lock-${randomUUID()}.json`);
    await rename(path, archive);
    return archive;
  } finally {
    await rmdir(mutex);
  }
}
async function acquireRunLock(projectRoot) {
  const project = await realpath(projectRoot);
  const directory = join(project, ".longrun-app-dev");
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== resolve(directory)) {
    throw new Error("Harness directory must not redirect outside the project");
  }
  const path = join(directory, "run.lock");
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, "wx", 384);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Run lock exists: another Run is active or recovery is required");
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ schemaVersion: 1, token, pid: process.pid, hostname: hostname(), startedAt: (/* @__PURE__ */ new Date()).toISOString() }));
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(path);
    throw error;
  }
  await handle.close();
  let released = false;
  return { path, token, async release() {
    if (released) return;
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Run lock was replaced");
    const owner = JSON.parse(await readFile(path, "utf8"));
    if (owner.token !== token) throw new Error("Run lock ownership changed; refusing to remove it");
    await unlink(path);
    released = true;
  } };
}

// runtime/src/orchestrator/git-safety.ts
import { execFile } from "node:child_process";
import { realpath as realpath2 } from "node:fs/promises";
import { promisify } from "node:util";
var GitSafety = class {
  constructor(root) {
    this.root = root;
  }
  root;
  baseline;
  async git(...args) {
    return (await promisify(execFile)("git", args, { cwd: this.root, windowsHide: true, timeout: 1e4 })).stdout.trim();
  }
  async begin(expected) {
    const top = await this.git("rev-parse", "--show-toplevel");
    if (await realpath2(top) !== await realpath2(this.root)) throw new Error("Run must start at the Git project root");
    const headSha = await this.git("rev-parse", "--verify", "HEAD");
    const branch = await this.git("branch", "--show-current");
    if (!branch) throw new Error("Run requires a named Git branch");
    if (expected.hadUncommittedChanges || expected.headSha !== headSha || expected.branch !== branch) {
      throw new Error("Git state changed since start; refusing to run");
    }
    if (await this.git("status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude).longrun-app-dev")) {
      throw new Error("Run requires a clean Git working tree");
    }
    this.baseline = { branch, headSha, hadUncommittedChanges: false };
  }
  async verify() {
    if (!this.baseline) throw new Error("Git protection has not been initialized");
    if (await this.git("rev-parse", "--verify", "HEAD") !== this.baseline.headSha || await this.git("branch", "--show-current") !== this.baseline.branch) {
      throw new Error("Git branch or HEAD changed during Run; files retained for inspection");
    }
  }
  async prepareRun(runId, prefix) {
    await this.verify();
    const branch = `${prefix}${runId}`;
    await this.git("check-ref-format", "--branch", branch);
    await this.git("switch", "-c", branch);
    this.baseline = { ...this.baseline, branch };
    return branch;
  }
  async snapshot() {
    await this.verify();
    return { ...this.baseline };
  }
  async checkpoint(round) {
    if (!Number.isSafeInteger(round) || round < 1) throw new Error("Invalid checkpoint round");
    await this.verify();
    const paths = [
      ".",
      ":(exclude).longrun-app-dev",
      ":(exclude,glob)**/node_modules/**",
      ":(exclude,glob)**/.env*",
      ":(exclude,glob)**/*.pem",
      ":(exclude,glob)**/*.key"
    ];
    await this.git("add", "--all", "--", ...paths);
    const staged = (await this.git("diff", "--cached", "--name-only", "-z")).split("\0");
    if (staged.some((file) => /(^|\/)(\.longrun-app-dev|node_modules)(\/|$)|(^|\/)\.env[^/]*$|\.(pem|key)$/iu.test(file))) {
      throw new Error("Checkpoint contains excluded local files; index and files retained for inspection");
    }
    await this.git("-c", "core.hooksPath=", "-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", `Harness Build round ${round}`);
    const headSha = await this.git("rev-parse", "HEAD");
    this.baseline = { ...this.baseline, headSha };
    return headSha;
  }
};

// runtime/src/orchestrator/orchestrator.ts
var RunLimit = class extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
  reason;
};
var ManualStop = class extends Error {
};
var Orchestrator = class {
  constructor(runner, adapter, gitFactory = (root) => new GitSafety(root)) {
    this.runner = runner;
    this.adapter = adapter;
    this.gitFactory = gitFactory;
  }
  runner;
  adapter;
  gitFactory;
  async run(input) {
    return this.withOwnership(input.projectRoot, (signal) => this.runOwned(input, signal));
  }
  async withOwnership(root, operation) {
    const lock = await acquireRunLock(root);
    const stop = watchRunStop(root, lock.token);
    try {
      return await operation(stop.signal);
    } finally {
      stop.close();
      await lock.release();
    }
  }
  async resume(projectRoot, runId, playwright) {
    return this.withOwnership(projectRoot, async (signal) => {
      const layout = await openRunDirectory(projectRoot, runId);
      const store = new ArtifactStore(layout.runRoot);
      const current = await store.readJson("state.json", "state");
      if (current.phase === "COMPLETED") throw new Error("Completed Runs cannot resume");
      const boundary = JSON.parse(await readFile2(join2(layout.runRoot, "resume-boundary.json"), "utf8"));
      await new SchemaValidator().validate("state", boundary.state);
      if (current.runId !== runId || boundary.state.runId !== runId || !["BUILDING", "EVALUATING"].includes(boundary.state.phase)) throw new Error("Invalid resume boundary");
      const config = await store.readJson("config.json", "config");
      await store.readJson("product-spec.json", "product-spec");
      if (boundary.state.phase === "EVALUATING") await store.readJson(`build/round-${boundary.state.buildRound}.json`, "build-report");
      const state = { ...boundary.state, usage: current.usage, consecutiveApiFailures: current.consecutiveApiFailures };
      await store.saveText(`logs/pre-resume-${randomUUID2()}.json`, JSON.stringify(current));
      return this.runOwned({
        projectRoot,
        runId,
        request: await readFile2(join2(layout.runRoot, "request.txt"), "utf8"),
        initialGit: current.initialGit,
        config,
        playwright
      }, signal, { layout, state, git: boundary.git });
    });
  }
  async runOwned(input, signal, recovery) {
    if (!input.request.trim()) throw new TypeError("Application request must not be empty");
    await new SchemaValidator().validate("config", input.config);
    const git = this.gitFactory(input.projectRoot);
    await git.begin(recovery?.git ?? input.initialGit);
    const layout = recovery?.layout ?? await initializeRunDirectory(input.projectRoot, input.runId);
    const store = new ArtifactStore(layout.runRoot);
    const log = new EventLog(layout.eventsPath);
    const started = Date.now() - (recovery?.state.usage.elapsedMs ?? 0);
    const now = () => (/* @__PURE__ */ new Date()).toISOString();
    let state = recovery?.state ?? {
      schemaVersion: 1,
      runId: layout.runId,
      phase: "INITIALIZING",
      qaRound: 0,
      buildRound: 0,
      startedAt: now(),
      updatedAt: now(),
      projectRoot: input.projectRoot,
      initialGit: input.initialGit,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 },
      consecutiveApiFailures: 0,
      latestArtifacts: []
    };
    const save = async () => {
      state = { ...state, updatedAt: now(), usage: { ...state.usage, elapsedMs: Date.now() - started } };
      await store.saveJson("state.json", "state", state);
    };
    const transition = async (event) => {
      state = transitionRunState(state, event);
      await save();
      if (["PLANNING_COMPLETED", "BUILD_COMPLETED", "QA_FAILED"].includes(event.type)) {
        await store.saveText("resume-boundary.json", JSON.stringify({ state, git: await git.snapshot() }));
      }
      await log.append({ runId: state.runId, timestamp: now(), phase: state.phase, agent: "orchestrator", event: event.type, usage: state.usage });
    };
    const track = (kind, path) => {
      state = { ...state, latestArtifacts: [...state.latestArtifacts, { kind, path }] };
    };
    const remaining = () => {
      if (signal.aborted) throw new ManualStop("Manual stop requested");
      const maxDurationMs = input.config.limits.maxDurationMinutes * 6e4 - (Date.now() - started);
      const maxCostUsd = input.config.limits.maxCostUsd - state.usage.estimatedCostUsd;
      if (maxDurationMs <= 0) throw new RunLimit("duration-limit");
      if (maxCostUsd <= 0) throw new RunLimit("cost-limit");
      return { maxDurationMs, maxCostUsd, maxConsecutiveApiFailures: input.config.limits.maxConsecutiveErrors };
    };
    const bounded = { run: async (request) => {
      await git.verify();
      const budget = remaining();
      const result = await this.runner.run({ ...request, signal, limits: { ...request.limits, maxCostUsd: Math.min(budget.maxCostUsd, request.limits.maxCostUsd), maxDurationMs: Math.min(budget.maxDurationMs, request.limits.maxDurationMs), maxConsecutiveApiFailures: budget.maxConsecutiveApiFailures } });
      state = { ...state, usage: { ...state.usage, inputTokens: state.usage.inputTokens + result.usage.inputTokens, outputTokens: state.usage.outputTokens + result.usage.outputTokens, estimatedCostUsd: state.usage.estimatedCostUsd + result.totalCostUsd }, consecutiveApiFailures: result.terminationReason === "api_failure_limit" ? budget.maxConsecutiveApiFailures : 0 };
      await save();
      await git.verify();
      await log.append({ runId: state.runId, timestamp: now(), phase: state.phase, agent: request.agent.role === "planner" ? "planner" : request.agent.role === "generator" ? "generator" : "evaluator", event: "session-ended", payload: { sessionId: result.sessionId, terminationReason: result.terminationReason, durationMs: result.durationMs, costUsd: result.totalCostUsd, compactionCount: result.compactionCount, eventCount: result.eventCount, turns: result.turns } });
      if (result.terminationReason === "cost_limit") throw new RunLimit("cost-limit");
      if (result.terminationReason === "timeout") throw new RunLimit("duration-limit");
      if (result.terminationReason === "api_failure_limit") throw new RunLimit("api-failure-limit");
      remaining();
      return result;
    } };
    let running;
    let lastQa;
    const stop = async () => {
      if (!running) return;
      const current = running;
      running = void 0;
      const result = await this.adapter.stop(current);
      await store.saveText(`logs/stop-${state.qaRound}.json`, JSON.stringify(result));
      if (result.status === "failed") throw new Error("Adapter could not stop the QA application");
    };
    try {
      await save();
      if (!recovery) {
        await store.saveJson("config.json", "config", input.config);
        await store.saveText("request.txt", input.request);
        const workBranch = await git.prepareRun(layout.runId, input.config.git.workBranchPrefix);
        await store.saveText("git-work.json", JSON.stringify({ initial: input.initialGit, workBranch }));
        await transition({ type: "INITIALIZATION_COMPLETED", at: now() });
        const planner = new Planner(bounded, await createPlannerAgent(input.projectRoot, input.config.models.planner), remaining());
        await planner.planAndSave({ request: input.request }, store);
        track("product-spec", "product-spec.json");
        await transition({ type: "PLANNING_COMPLETED", at: now() });
      } else {
        remaining();
        await log.append({ runId: state.runId, timestamp: now(), phase: state.phase, agent: "orchestrator", event: "RESUMED", usage: state.usage });
      }
      while (true) {
        if (state.phase === "BUILDING") {
          const spec = await store.readJson("product-spec.json", "product-spec");
          const previousBuild = state.buildRound > 1 ? await store.readJson(`build/round-${state.buildRound - 1}.json`, "build-report") : void 0;
          const qa = state.buildRound > 1 ? await store.readJson(`qa/round-${state.buildRound - 1}.json`, "qa-result") : void 0;
          const generator = new Generator(bounded, await createGeneratorAgent(input.projectRoot, input.config.models.generator), remaining());
          await generator.buildAndSave({
            runId: state.runId,
            round: state.buildRound,
            spec,
            adapter: { detection: await this.adapter.detect(), config: input.config.adapter },
            ...previousBuild && qa ? { previousBuild, qa } : {}
          }, store);
          track("build-report", `build/round-${state.buildRound}.json`);
          if (input.config.git.commitEachBuildRound) {
            const headSha = await git.checkpoint(state.buildRound);
            const checkpointPath = `build/checkpoint-${state.buildRound}.json`;
            await store.saveText(checkpointPath, JSON.stringify({ round: state.buildRound, headSha }));
            track("git-checkpoint", checkpointPath);
          }
          await transition({ type: "BUILD_COMPLETED", at: now() });
        }
        for (const operation of ["prerequisites", "setup", "build"]) {
          remaining();
          const result = await this.adapter[operation]({ timeoutMs: remaining().maxDurationMs, signal });
          await store.saveText(`logs/adapter-${state.qaRound}-${operation}.json`, JSON.stringify(result));
          remaining();
          if (result.status === "failed") throw new Error(`QA preparation failed: ${operation}`);
        }
        running = await this.adapter.start({ timeoutMs: Math.min(1e4, remaining().maxDurationMs), signal });
        remaining();
        const roundEvidence = join2(layout.evidenceRoot, `round-${state.qaRound}-${randomUUID2()}`);
        await mkdir2(roundEvidence, { recursive: true });
        const evaluator = new Evaluator(bounded, await createEvaluatorAgent(input.projectRoot, { ...input.playwright, evidenceRoot: roundEvidence }, input.config.models.evaluator), remaining());
        await evaluator.evaluateAndSave({
          runId: state.runId,
          round: state.qaRound,
          spec: await store.readJson("product-spec.json", "product-spec"),
          projectRoot: input.projectRoot,
          evidenceRoot: roundEvidence,
          appUrl: running.url,
          thresholds: input.config.quality.thresholds
        }, store, layout.runRoot);
        lastQa = await store.readJson(`qa/round-${state.qaRound}.json`, "qa-result");
        track("qa-result", `qa/round-${state.qaRound}.json`);
        await stop();
        await git.verify();
        remaining();
        if (lastQa.verdict === "pass") {
          await transition({ type: "QA_PASSED", at: now() });
          break;
        }
        if (state.qaRound >= input.config.limits.maxQaRounds) throw new RunLimit("qa-round-limit");
        await transition({ type: "QA_FAILED", at: now() });
      }
    } catch (error) {
      let failure = error;
      try {
        await stop();
      } catch (cleanup) {
        failure = cleanup;
      }
      if (failure instanceof ManualStop || signal.aborted && failure === error) await transition({ type: "STOP_REQUESTED", at: now() });
      else if (failure instanceof RunLimit) await transition({ type: "LIMIT_REACHED", at: now(), reason: failure.reason });
      else await transition({ type: "UNRECOVERABLE_ERROR", at: now(), error: { code: "RUN_FAILED", message: failure instanceof Error ? failure.message : String(failure), retryable: false } });
    }
    const finalReport = {
      runId: state.runId,
      phase: state.phase,
      terminationReason: state.terminationReason,
      usage: state.usage,
      rounds: { build: state.buildRound, qa: state.qaRound },
      requirements: lastQa?.requirementResults ?? [],
      unresolvedIssues: lastQa?.issues ?? [],
      artifacts: state.latestArtifacts,
      ...state.error ? { error: state.error } : {}
    };
    await store.saveText("final-report.json", JSON.stringify(finalReport, null, 2));
    await store.saveText("final-report.md", `# Run ${state.runId}: ${state.phase}

Reason: ${state.terminationReason}

Build rounds: ${state.buildRound}; QA rounds: ${state.qaRound}

Cost: $${state.usage.estimatedCostUsd}; elapsed: ${state.usage.elapsedMs} ms

## Requirements

${lastQa?.requirementResults.map((r) => `- ${r.requirementId}: ${r.status}`).join("\n") ?? "Not evaluated"}

## Unresolved issues

${lastQa?.issues.map((r) => `- ${r.issueId}: ${r.title}`).join("\n") || (state.phase === "COMPLETED" ? "None" : "See failure details and round artifacts")}

${state.error?.message ?? ""}`);
    return { state, layout };
  }
};

// runtime/src/orchestrator/clean.ts
import { lstat as lstat2, realpath as realpath3, rm } from "node:fs/promises";
import { join as join3, resolve as resolve2 } from "node:path";
async function cleanRun(projectRoot, runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) throw new Error("Invalid Run ID");
  const root = await realpath3(projectRoot);
  const lock = await acquireRunLock(root);
  try {
    const runs = join3(root, ".longrun-app-dev", "runs");
    const directory = join3(runs, runId);
    for (const target of [runs, directory]) {
      if ((await lstat2(target)).isSymbolicLink() || await realpath3(target) !== resolve2(target)) throw new Error("Clean target must not redirect");
    }
    const state = await new ArtifactStore(directory).readJson("state.json", "state");
    if (state.runId !== runId || await realpath3(state.projectRoot) !== root) throw new Error("Run does not belong to this project");
    if (!["COMPLETED", "FAILED", "STOPPED"].includes(state.phase)) throw new Error("Only terminal Runs can be cleaned");
    await rm(directory, { recursive: true, force: false });
    return directory;
  } finally {
    await lock.release();
  }
}

export {
  watchRunStop,
  recoverRunLock,
  acquireRunLock,
  GitSafety,
  Orchestrator,
  cleanRun
};
//# sourceMappingURL=chunk-JAQDXIDR.js.map
