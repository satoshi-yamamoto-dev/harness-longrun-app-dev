import { ArtifactStore, initializeRunDirectory, openRunDirectory, SchemaValidator } from "../artifacts/index.js";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RunLayout } from "../artifacts/index.js";
import type { ProjectAdapter, RunningProject } from "../adapters/types.js";
import type { BuildReport, HarnessConfig, InitialGitState, ProductSpec, QaResult, RunState } from "../contracts/index.js";
import { createPlannerAgent, Planner } from "../planner/index.js";
import { createGeneratorAgent, Generator } from "../generator/index.js";
import { createEvaluatorAgent, Evaluator } from "../evaluator/index.js";
import type { PlaywrightConnection } from "../evaluator/index.js";
import { EventLog } from "../logging/event-log.js";
import { transitionRunState } from "../state/index.js";
import type { LimitTerminationReason, RunEvent } from "../state/index.js";
import type { SessionLimits, SessionRunner } from "../sessions/index.js";
import { acquireRunLock, watchRunStop } from "./run-lock.js";
import { GitSafety, type GitProtection } from "./git-safety.js";

export interface OrchestratorRequest {
  readonly request: string;
  readonly projectRoot: string;
  readonly config: HarnessConfig;
  readonly initialGit: InitialGitState;
  readonly playwright: Pick<PlaywrightConnection, "cliPath" | "browser">;
  readonly runId?: string;
}
export interface OrchestratorOutput { readonly state: RunState; readonly layout: RunLayout; }
interface Recovery { readonly layout: RunLayout; readonly state: RunState; readonly git: InitialGitState; }
class RunLimit extends Error { constructor(readonly reason: LimitTerminationReason) { super(reason); } }
class ManualStop extends Error {}

export class Orchestrator {
  constructor(private readonly runner: SessionRunner, private readonly adapter: ProjectAdapter,
    private readonly gitFactory: (root: string) => GitProtection = (root) => new GitSafety(root)) {}

  async run(input: OrchestratorRequest): Promise<OrchestratorOutput> {
    return this.withOwnership(input.projectRoot, (signal) => this.runOwned(input, signal));
  }

  private async withOwnership<T>(root: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const lock = await acquireRunLock(root);
    const stop = watchRunStop(root, lock.token);
    try { return await operation(stop.signal); }
    finally { stop.close(); await lock.release(); }
  }

  async resume(projectRoot: string, runId: string, playwright: OrchestratorRequest["playwright"]): Promise<OrchestratorOutput> {
    return this.withOwnership(projectRoot, async (signal) => {
      const layout = await openRunDirectory(projectRoot, runId);
      const store = new ArtifactStore(layout.runRoot);
      const current = await store.readJson<RunState>("state.json", "state");
      if (current.phase === "COMPLETED") throw new Error("Completed Runs cannot resume");
      const boundary = JSON.parse(await readFile(join(layout.runRoot, "resume-boundary.json"), "utf8")) as Recovery;
      await new SchemaValidator().validate("state", boundary.state);
      if (current.runId !== runId || boundary.state.runId !== runId || !["BUILDING", "EVALUATING"].includes(boundary.state.phase)) throw new Error("Invalid resume boundary");
      const config = await store.readJson<HarnessConfig>("config.json", "config");
      await store.readJson("product-spec.json", "product-spec");
      if (boundary.state.phase === "EVALUATING") await store.readJson(`build/round-${boundary.state.buildRound}.json`, "build-report");
      const state = { ...boundary.state, usage: current.usage, consecutiveApiFailures: current.consecutiveApiFailures };
      await store.saveText(`logs/pre-resume-${randomUUID()}.json`, JSON.stringify(current));
      return this.runOwned({ projectRoot, runId, request: await readFile(join(layout.runRoot, "request.txt"), "utf8"),
        initialGit: current.initialGit, config, playwright }, signal, { layout, state, git: boundary.git });
    });
  }

  private async runOwned(input: OrchestratorRequest, signal: AbortSignal, recovery?: Recovery): Promise<OrchestratorOutput> {
    if (!input.request.trim()) throw new TypeError("Application request must not be empty");
    await new SchemaValidator().validate("config", input.config);
    const git = this.gitFactory(input.projectRoot);
    await git.begin(recovery?.git ?? input.initialGit);
    const layout = recovery?.layout ?? await initializeRunDirectory(input.projectRoot, input.runId);
    const store = new ArtifactStore(layout.runRoot);
    const log = new EventLog(layout.eventsPath);
    const started = Date.now() - (recovery?.state.usage.elapsedMs ?? 0);
    const now = () => new Date().toISOString();
    let state: RunState = recovery?.state ?? { schemaVersion: 1, runId: layout.runId, phase: "INITIALIZING", qaRound: 0, buildRound: 0,
      startedAt: now(), updatedAt: now(), projectRoot: input.projectRoot, initialGit: input.initialGit,
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: 0 }, consecutiveApiFailures: 0, latestArtifacts: [] };
    const save = async () => {
      state = { ...state, updatedAt: now(), usage: { ...state.usage, elapsedMs: Date.now() - started } };
      await store.saveJson("state.json", "state", state);
    };
    const transition = async (event: RunEvent) => {
      state = transitionRunState(state, event); await save();
      if (["PLANNING_COMPLETED", "BUILD_COMPLETED", "QA_FAILED"].includes(event.type)) {
        await store.saveText("resume-boundary.json", JSON.stringify({ state, git: await git.snapshot() }));
      }
      await log.append({ runId: state.runId, timestamp: now(), phase: state.phase, agent: "orchestrator", event: event.type, usage: state.usage });
    };
    const track = (kind: string, path: string) => { state = { ...state, latestArtifacts: [...state.latestArtifacts, { kind, path }] }; };
    const remaining = (): SessionLimits => {
      if (signal.aborted) throw new ManualStop("Manual stop requested");
      const maxDurationMs = input.config.limits.maxDurationMinutes * 60000 - (Date.now() - started);
      const maxCostUsd = input.config.limits.maxCostUsd - state.usage.estimatedCostUsd;
      if (maxDurationMs <= 0) throw new RunLimit("duration-limit");
      if (maxCostUsd <= 0) throw new RunLimit("cost-limit");
      return { maxDurationMs, maxCostUsd, maxConsecutiveApiFailures: input.config.limits.maxConsecutiveErrors };
    };
    const bounded: SessionRunner = { run: async (request) => {
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
    let running: RunningProject | undefined;
    let lastQa: QaResult | undefined;
    const stop = async () => {
      if (!running) return;
      const current = running; running = undefined;
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
        const spec = await store.readJson<ProductSpec>("product-spec.json", "product-spec");
        const previousBuild = state.buildRound > 1 ? await store.readJson<BuildReport>(`build/round-${state.buildRound - 1}.json`, "build-report") : undefined;
        const qa = state.buildRound > 1 ? await store.readJson<QaResult>(`qa/round-${state.buildRound - 1}.json`, "qa-result") : undefined;
        const generator = new Generator(bounded, await createGeneratorAgent(input.projectRoot, input.config.models.generator), remaining());
        await generator.buildAndSave({ runId: state.runId, round: state.buildRound, spec,
          adapter: { detection: await this.adapter.detect(), config: input.config.adapter },
          ...(previousBuild && qa ? { previousBuild, qa } : {}) }, store);
        track("build-report", `build/round-${state.buildRound}.json`);
        if (input.config.git.commitEachBuildRound) {
          const headSha = await git.checkpoint(state.buildRound);
          const checkpointPath = `build/checkpoint-${state.buildRound}.json`;
          await store.saveText(checkpointPath, JSON.stringify({ round: state.buildRound, headSha }));
          track("git-checkpoint", checkpointPath);
        }
        await transition({ type: "BUILD_COMPLETED", at: now() });
        }
        for (const operation of ["prerequisites", "setup", "build"] as const) {
          remaining();
          const result = await this.adapter[operation]({ timeoutMs: remaining().maxDurationMs, signal });
          await store.saveText(`logs/adapter-${state.qaRound}-${operation}.json`, JSON.stringify(result));
          remaining();
          if (result.status === "failed") throw new Error(`QA preparation failed: ${operation}`);
        }
        running = await this.adapter.start({ timeoutMs: Math.min(10000, remaining().maxDurationMs), signal });
        remaining();
        const roundEvidence = join(layout.evidenceRoot, `round-${state.qaRound}-${randomUUID()}`);
        await mkdir(roundEvidence, { recursive: true });
        const evaluator = new Evaluator(bounded, await createEvaluatorAgent(input.projectRoot, { ...input.playwright, evidenceRoot: roundEvidence }, input.config.models.evaluator), remaining());
        // Reload the canonical spec at the QA boundary; never pass Generator chat.
        await evaluator.evaluateAndSave({ runId: state.runId, round: state.qaRound, spec: await store.readJson<ProductSpec>("product-spec.json", "product-spec"), projectRoot: input.projectRoot,
          evidenceRoot: roundEvidence, appUrl: running.url, thresholds: input.config.quality.thresholds }, store, layout.runRoot);
        lastQa = await store.readJson<QaResult>(`qa/round-${state.qaRound}.json`, "qa-result");
        track("qa-result", `qa/round-${state.qaRound}.json`);
        await stop();
        await git.verify();
        remaining();
        if (lastQa.verdict === "pass") { await transition({ type: "QA_PASSED", at: now() }); break; }
        if (state.qaRound >= input.config.limits.maxQaRounds) throw new RunLimit("qa-round-limit");
        await transition({ type: "QA_FAILED", at: now() });
      }
    } catch (error) {
      let failure = error;
      try { await stop(); } catch (cleanup) { failure = cleanup; }
      if (failure instanceof ManualStop || signal.aborted && failure === error) await transition({ type: "STOP_REQUESTED", at: now() });
      else if (failure instanceof RunLimit) await transition({ type: "LIMIT_REACHED", at: now(), reason: failure.reason });
      else await transition({ type: "UNRECOVERABLE_ERROR", at: now(), error: { code: "RUN_FAILED", message: failure instanceof Error ? failure.message : String(failure), retryable: false } });
    }
    const finalReport = { runId: state.runId, phase: state.phase, terminationReason: state.terminationReason, usage: state.usage, rounds: { build: state.buildRound, qa: state.qaRound },
      requirements: lastQa?.requirementResults ?? [], unresolvedIssues: lastQa?.issues ?? [], artifacts: state.latestArtifacts, ...(state.error ? { error: state.error } : {}) };
    await store.saveText("final-report.json", JSON.stringify(finalReport, null, 2));
    await store.saveText("final-report.md", `# Run ${state.runId}: ${state.phase}\n\nReason: ${state.terminationReason}\n\nBuild rounds: ${state.buildRound}; QA rounds: ${state.qaRound}\n\nCost: $${state.usage.estimatedCostUsd}; elapsed: ${state.usage.elapsedMs} ms\n\n## Requirements\n\n${lastQa?.requirementResults.map((r) => `- ${r.requirementId}: ${r.status}`).join("\n") ?? "Not evaluated"}\n\n## Unresolved issues\n\n${lastQa?.issues.map((r) => `- ${r.issueId}: ${r.title}`).join("\n") || (state.phase === "COMPLETED" ? "None" : "See failure details and round artifacts")}\n\n${state.error?.message ?? ""}`);
    return { state, layout };
  }
}




