import type {
  AgentSdkClient,
  SdkEvent,
  SdkQuery,
  SessionRunRequest,
  SessionRunResult,
  SessionRunner,
  SessionTerminationReason,
  SessionUsage,
} from "./types.js";

const emptyUsage = (): SessionUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });
const numberField = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function resultUsage(event: SdkEvent): SessionUsage {
  if (typeof event.modelUsage === "object" && event.modelUsage !== null) {
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadInputTokens = 0;
    let cacheCreationInputTokens = 0;
    for (const entry of Object.values(event.modelUsage as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) continue;
      const model = entry as Record<string, unknown>;
      inputTokens += numberField(model.inputTokens);
      outputTokens += numberField(model.outputTokens);
      cacheReadInputTokens += numberField(model.cacheReadInputTokens);
      cacheCreationInputTokens += numberField(model.cacheCreationInputTokens);
    }
    return { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens };
  }
  const value = typeof event.usage === "object" && event.usage !== null ? event.usage as Record<string, unknown> : {};
  return {
    inputTokens: numberField(value.input_tokens),
    outputTokens: numberField(value.output_tokens),
    cacheReadInputTokens: numberField(value.cache_read_input_tokens),
    cacheCreationInputTokens: numberField(value.cache_creation_input_tokens),
  };
}

async function nextWithTimeout<T>(iterator: AsyncIterator<T>, timeoutMs: number, signal?: AbortSignal): Promise<IteratorResult<T> | "timeout" | "aborted"> {
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); }),
      new Promise<"aborted">((resolve) => {
        onAbort = () => resolve("aborted");
        if (signal?.aborted) resolve("aborted");
        else signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

async function stopQuery(query: SdkQuery): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try { await Promise.race([query.interrupt?.(), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000); })]); }
  catch { /* closing below is authoritative */ }
  finally { if (timer) clearTimeout(timer); query.close?.(); }
}

export class DefaultSessionRunner implements SessionRunner {
  constructor(private readonly sdk: AgentSdkClient) {}

  async run(request: SessionRunRequest): Promise<SessionRunResult> {
    const started = Date.now();
    const query = this.sdk.query({
      prompt: request.prompt,
      options: {
        model: request.agent.model,
        systemPrompt: request.agent.systemPrompt,
        allowedTools: request.agent.allowedTools,
        disallowedTools: request.agent.disallowedTools ?? [],
        cwd: request.agent.cwd,
        permissionMode: request.agent.permissionMode,
        maxBudgetUsd: request.limits.maxCostUsd,
        ...(request.agent.mcpServers === undefined ? {} : { mcpServers: request.agent.mcpServers }),
        ...(request.agent.strictMcpConfig === undefined ? {} : { strictMcpConfig: request.agent.strictMcpConfig }),
        ...(request.limits.maxTurns === undefined ? {} : { maxTurns: request.limits.maxTurns }),
        ...(request.resumeSessionId === undefined ? {} : { resume: request.resumeSessionId }),
      },
    });
    const iterator = query[Symbol.asyncIterator]();
    let sessionId: string | null = request.resumeSessionId ?? null;
    let output = "";
    let usage = emptyUsage();
    let totalCostUsd = 0;
    let sdkDurationMs: number | null = null;
    let turns = 0;
    let compactionCount = 0;
    let eventCount = 0;
    let consecutiveApiFailures = 0;
    const errors: string[] = [];
    let terminationReason: SessionTerminationReason = "stream_ended_without_result";
    let status: SessionRunResult["status"] = "failed";

    try {
      while (true) {
        const remaining = request.limits.maxDurationMs - (Date.now() - started);
        if (remaining <= 0) {
          terminationReason = "timeout";
          status = "stopped";
          await stopQuery(query);
          break;
        }
        const next = await nextWithTimeout(iterator, remaining, request.signal);
        if (next === "aborted") {
          terminationReason = "manual_stop"; status = "stopped";
          await stopQuery(query); break;
        }
        if (next === "timeout") {
          terminationReason = "timeout";
          status = "stopped";
          await stopQuery(query);
          break;
        }
        if (next.done) break;
        const event = next.value;
        eventCount += 1;
        if (typeof event.session_id === "string") sessionId = event.session_id;
        if (event.type === "system" && event.subtype === "compact_boundary") compactionCount += 1;
        if (event.type === "system" && event.subtype === "api_retry") {
          consecutiveApiFailures += 1;
          const error = typeof event.error === "string" ? event.error : "API request failed";
          errors.push(error);
          if (consecutiveApiFailures >= request.limits.maxConsecutiveApiFailures) {
            terminationReason = "api_failure_limit";
            status = "stopped";
            await stopQuery(query);
            break;
          }
          continue;
        }
        if (event.type === "assistant") consecutiveApiFailures = 0;
        if (event.type !== "result") continue;

        output = typeof event.result === "string" ? event.result : "";
        usage = resultUsage(event);
        totalCostUsd = numberField(event.total_cost_usd);
        sdkDurationMs = numberField(event.duration_ms);
        turns = numberField(event.num_turns);
        errors.push(...stringArray(event.errors));
        const subtype = typeof event.subtype === "string" ? event.subtype : "";
        const isError = event.is_error === true || subtype !== "success";
        terminationReason = subtype === "error_max_budget_usd" || totalCostUsd > request.limits.maxCostUsd ? "cost_limit" : isError ? "sdk_error" : "completed";
        status = terminationReason === "completed" ? "completed" : terminationReason === "cost_limit" ? "stopped" : "failed";
        break;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      terminationReason = "sdk_error";
      status = "failed";
      await stopQuery(query);
    } finally {
      if (status !== "stopped" && typeof iterator.return === "function") await iterator.return();
    }

    return {
      status,
      terminationReason,
      sessionId,
      output,
      usage,
      totalCostUsd,
      durationMs: Date.now() - started,
      sdkDurationMs,
      turns,
      compactionCount,
      eventCount,
      errorMessages: errors,
    };
  }
}
