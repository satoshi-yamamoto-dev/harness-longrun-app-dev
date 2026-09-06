import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ArtifactStore, initializeRunDirectory, SchemaValidator } from "../../runtime/dist/artifacts/index.js";
import { Generator, createGeneratorAgent } from "../../runtime/dist/generator/index.js";
import { Evaluator, createEvaluatorAgent } from "../../runtime/dist/evaluator/index.js";
import { acquireRunLock, watchRunStop } from "../../runtime/dist/orchestrator/index.js";

// Comparison-only execution. There is no QA feedback or second implementation round.
export async function runSoloBenchmark(input, runner, adapter) {
  const lock = await acquireRunLock(input.projectRoot);
  const stop = watchRunStop(input.projectRoot, lock.token);
  try { return await runOwned(input, runner, adapter, stop.signal); }
  finally { stop.close(); await lock.release(); }
}

async function runOwned(input, runner, adapter, signal) {
  await new SchemaValidator().validate("config", input.config);
  await new SchemaValidator().validate("product-spec", input.spec);
  if (!input.request?.trim()) throw new Error("Original request is required");
  for (const key of ["costUsd", "durationMs"]) {
    if (!Number.isFinite(input.sharedPlanner?.[key]) || input.sharedPlanner[key] < 0) throw new Error(`Invalid shared Planner ${key}`);
  }
  const layout = await initializeRunDirectory(input.projectRoot, input.runId);
  const store = new ArtifactStore(layout.runRoot);
  const started = Date.now();
  const sessions = [];
  let spent = input.sharedPlanner.costUsd;
  const remaining = () => {
    if (signal.aborted) throw new Error("manual-stop");
    const maxCostUsd = input.config.limits.maxCostUsd - spent;
    const maxDurationMs = input.config.limits.maxDurationMinutes * 60000 - input.sharedPlanner.durationMs - (Date.now() - started);
    if (maxCostUsd <= 0 || maxDurationMs <= 0) throw new Error(maxCostUsd <= 0 ? "cost-limit" : "duration-limit");
    return { maxCostUsd, maxDurationMs, maxConsecutiveApiFailures: input.config.limits.maxConsecutiveErrors };
  };
  const bounded = { async run(request) {
    const limits = remaining();
    const result = await runner.run({ ...request, signal, limits: { ...request.limits,
      maxCostUsd: Math.min(limits.maxCostUsd, request.limits.maxCostUsd),
      maxDurationMs: Math.min(limits.maxDurationMs, request.limits.maxDurationMs) } });
    spent += result.totalCostUsd;
    // Keep measurement fields only; chat and raw outputs do not enter comparison records.
    sessions.push({ role: request.agent.role, model: request.agent.model, sessionId: result.sessionId,
      status: result.status, terminationReason: result.terminationReason, costUsd: result.totalCostUsd,
      durationMs: result.durationMs, compactionCount: result.compactionCount, turns: result.turns, eventCount: result.eventCount });
    await store.saveText("benchmark-sessions.json", JSON.stringify(sessions, null, 2));
    return result;
  } };
  let running;
  let report;
  let error;
  try {
    await store.saveJson("config.json", "config", input.config);
    await store.saveJson("product-spec.json", "product-spec", input.spec);
    await store.saveText("request.txt", input.request);
    const generator = new Generator(bounded, await createGeneratorAgent(input.projectRoot, input.config.models.generator), remaining());
    await generator.buildAndSave({ runId: layout.runId, round: 1, spec: input.spec,
      projectConventions: `Original application request:\n${input.request}`,
      adapter: { detection: await adapter.detect(), config: input.config.adapter } }, store);
    for (const operation of ["prerequisites", "setup", "build"]) {
      const result = await adapter[operation]({ timeoutMs: remaining().maxDurationMs, signal });
      await store.saveText(`logs/adapter-${operation}.json`, JSON.stringify(result));
      if (result.status === "failed") throw new Error(`Preparation failed: ${operation}`);
    }
    running = await adapter.start({ timeoutMs: Math.min(10000, remaining().maxDurationMs), signal });
    const evidenceRoot = path.join(layout.evidenceRoot, "round-1");
    await mkdir(evidenceRoot);
    const evaluator = new Evaluator(bounded, await createEvaluatorAgent(input.projectRoot, { ...input.playwright, evidenceRoot }, input.config.models.evaluator), remaining());
    report = (await evaluator.evaluateAndSave({ runId: layout.runId, round: 1,
      spec: await store.readJson("product-spec.json", "product-spec"), projectRoot: input.projectRoot,
      appUrl: running.url, evidenceRoot, thresholds: input.config.quality.thresholds }, store, layout.runRoot)).report;
    remaining();
  } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  finally {
    if (running) {
      try {
        const stopped = await adapter.stop(running);
        await store.saveText("logs/stop.json", JSON.stringify(stopped));
        if (stopped.status === "failed") throw new Error("Application cleanup failed");
      } catch (failure) { error = [error, String(failure)].filter(Boolean).join("; "); }
    }
  }
  const summary = { schemaVersion: 1, method: "solo", runId: layout.runId,
    status: error ? "failed" : "completed", verdict: report?.verdict ?? "not-evaluated",
    ...(error ? { error } : {}), sharedPlanner: input.sharedPlanner,
    totalCostUsd: spent, totalDurationMs: input.sharedPlanner.durationMs + Date.now() - started,
    specSha256: createHash("sha256").update(JSON.stringify(input.spec)).digest("hex"),
    sessions, scores: report?.scores, uiScores: report?.uiScores, requirements: report?.requirementResults ?? [] };
  await store.saveText("benchmark-summary.json", JSON.stringify(summary, null, 2));
  return { layout, summary };
}
