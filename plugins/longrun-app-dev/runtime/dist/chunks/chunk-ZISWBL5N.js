import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// runtime/src/sessions/agent-definitions.ts
import path from "node:path";
var roleDefaults = {
  planner: { tools: ["Read", "Glob", "Grep"], permissionMode: "plan" },
  generator: { tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"], permissionMode: "acceptEdits" },
  "qa-functional": { tools: ["Read", "Glob", "Grep", "Bash"], permissionMode: "default" },
  "qa-visual": { tools: ["Read", "Glob", "Grep", "Bash"], permissionMode: "default" }
};
function defineAgent(input) {
  const defaults = roleDefaults[input.role];
  const cwd = path.resolve(input.cwd);
  if (!input.model.trim()) throw new Error("Agent model must not be empty");
  if (!input.systemPrompt.trim()) throw new Error("Agent system prompt must not be empty");
  return {
    id: input.role,
    role: input.role,
    model: input.model,
    systemPrompt: input.systemPrompt,
    allowedTools: [...input.allowedTools ?? defaults.tools],
    ...input.disallowedTools ? { disallowedTools: [...input.disallowedTools] } : {},
    cwd,
    permissionMode: input.permissionMode ?? defaults.permissionMode,
    ...input.mcpServers === void 0 ? {} : { mcpServers: input.mcpServers },
    ...input.strictMcpConfig === void 0 ? {} : { strictMcpConfig: input.strictMcpConfig }
  };
}

// runtime/src/sessions/tool-safety.ts
import { realpathSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname, sep } from "node:path";
function deniedToolReason(tool, input, cwd, tools) {
  if (!tools.includes(tool)) return "Tool is outside this agent's declared tool set";
  if (tool === "Bash") {
    if (typeof input.command !== "string") return "Missing shell command";
    const command = input.command;
    if (/\b(push|deploy|publish|sendmail|smtp|scp|sftp|ssh|curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/iu.test(command)) return "External publication or transfer is disabled";
    if (/\b(drop|truncate)\s+(database|table|schema)\b|\bdelete\s+from\b|\b(migrate\s+reset|db\s+reset)\b/iu.test(command)) return "Destructive database commands are disabled";
  }
  if (["Read", "Write", "Edit", "Glob", "Grep"].includes(tool)) {
    const file = input.file_path ?? input.path ?? cwd;
    if (typeof file !== "string") return "Invalid file path";
    const target = resolve(cwd, file);
    const outside = (root, candidate) => {
      const part = relative(root, candidate);
      return part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part);
    };
    if (outside(resolve(cwd), target)) return "File access outside the project is disabled";
    let ancestor = target;
    while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
    try {
      if (outside(realpathSync(cwd), realpathSync(ancestor))) return "File path redirects outside the project";
    } catch {
      return "Cannot verify file location";
    }
    if (/(?:^|[\\/])(?:\.env(?:\.[^\\/]+)?|\.git|\.ssh|\.aws|\.claude|\.longrun-app-dev)(?:[\\/]|$)/iu.test(relative(resolve(cwd), target))) return "Credential and harness control paths are protected";
  }
  if (tool === "mcp__playwright__browser_navigate") {
    try {
      const url = new URL(String(input.url));
      if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) return "Browser navigation is restricted to local applications";
    } catch {
      return "Invalid browser URL";
    }
  }
  return void 0;
}
function createToolSafetyHook(cwd, tools) {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const reason = deniedToolReason(input.tool_name, input.tool_input, cwd, tools);
    return reason ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } } : {};
  };
}

// runtime/src/sessions/build-round-session.ts
var BuildRoundSession = class {
  constructor(runner, agent, limits) {
    this.runner = runner;
    this.agent = agent;
    this.limits = limits;
    if (agent.role !== "generator") throw new Error("BuildRoundSession requires a generator agent");
  }
  runner;
  agent;
  limits;
  sessionId;
  results = [];
  get currentSessionId() {
    return this.sessionId ?? null;
  }
  get history() {
    return this.results;
  }
  async run(prompt) {
    const result = await this.runner.run({
      agent: this.agent,
      prompt,
      limits: this.limits,
      ...this.sessionId === void 0 ? {} : { resumeSessionId: this.sessionId }
    });
    if (result.sessionId !== null) this.sessionId = result.sessionId;
    this.results.push(result);
    return result;
  }
};

// runtime/src/sessions/claude-agent-sdk-client.ts
import { execFileSync } from "node:child_process";
var ClaudeAgentSdkClient = class {
  constructor(executablePath) {
    this.executablePath = executablePath;
  }
  executablePath;
  query(request) {
    let active;
    const load = async () => {
      const { query } = await import("./sdk-ND4M3F2B.js");
      const pathToClaudeCodeExecutable = this.executablePath ?? discoverClaudeExecutable();
      const options = {
        settingSources: [],
        hooks: { PreToolUse: [{ hooks: [createToolSafetyHook(request.options.cwd, request.options.allowedTools)] }] },
        model: request.options.model,
        systemPrompt: request.options.systemPrompt,
        allowedTools: [...request.options.allowedTools],
        disallowedTools: [...request.options.disallowedTools],
        cwd: request.options.cwd,
        permissionMode: request.options.permissionMode,
        maxBudgetUsd: request.options.maxBudgetUsd,
        ...request.options.mcpServers === void 0 ? {} : {
          mcpServers: Object.fromEntries(Object.entries(request.options.mcpServers).map(([name, server]) => [name, {
            type: server.type,
            command: server.command,
            args: [...server.args],
            ...server.env === void 0 ? {} : { env: { ...server.env } }
          }]))
        },
        ...request.options.strictMcpConfig === void 0 ? {} : { strictMcpConfig: request.options.strictMcpConfig },
        ...pathToClaudeCodeExecutable === void 0 ? {} : { pathToClaudeCodeExecutable },
        ...request.options.maxTurns === void 0 ? {} : { maxTurns: request.options.maxTurns },
        ...request.options.resume === void 0 ? {} : { resume: request.options.resume }
      };
      const sdkQuery = query({ prompt: request.prompt, options });
      active = sdkQuery;
      return sdkQuery;
    };
    return {
      async interrupt() {
        if (active) await active.interrupt();
      },
      close() {
        active?.close();
      },
      async *[Symbol.asyncIterator]() {
        const query = await load();
        for await (const event of query) yield event;
      }
    };
  }
};
function discoverClaudeExecutable() {
  if (process.env.CLAUDE_CODE_EXECUTABLE) return process.env.CLAUDE_CODE_EXECUTABLE;
  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    return execFileSync(locator, ["claude"], { encoding: "utf8", windowsHide: true }).split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  } catch {
    return void 0;
  }
}

// runtime/src/sessions/session-runner.ts
var emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });
var numberField = (value) => typeof value === "number" && Number.isFinite(value) ? value : 0;
var stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
function resultUsage(event) {
  if (typeof event.modelUsage === "object" && event.modelUsage !== null) {
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadInputTokens = 0;
    let cacheCreationInputTokens = 0;
    for (const entry of Object.values(event.modelUsage)) {
      if (typeof entry !== "object" || entry === null) continue;
      const model = entry;
      inputTokens += numberField(model.inputTokens);
      outputTokens += numberField(model.outputTokens);
      cacheReadInputTokens += numberField(model.cacheReadInputTokens);
      cacheCreationInputTokens += numberField(model.cacheCreationInputTokens);
    }
    return { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens };
  }
  const value = typeof event.usage === "object" && event.usage !== null ? event.usage : {};
  return {
    inputTokens: numberField(value.input_tokens),
    outputTokens: numberField(value.output_tokens),
    cacheReadInputTokens: numberField(value.cache_read_input_tokens),
    cacheCreationInputTokens: numberField(value.cache_creation_input_tokens)
  };
}
async function nextWithTimeout(iterator, timeoutMs, signal) {
  let timer;
  let onAbort;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise((resolve2) => {
        timer = setTimeout(() => resolve2("timeout"), timeoutMs);
      }),
      new Promise((resolve2) => {
        onAbort = () => resolve2("aborted");
        if (signal?.aborted) resolve2("aborted");
        else signal?.addEventListener("abort", onAbort, { once: true });
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}
async function stopQuery(query) {
  let timer;
  try {
    await Promise.race([query.interrupt?.(), new Promise((resolve2) => {
      timer = setTimeout(resolve2, 1e3);
    })]);
  } catch {
  } finally {
    if (timer) clearTimeout(timer);
    query.close?.();
  }
}
var DefaultSessionRunner = class {
  constructor(sdk) {
    this.sdk = sdk;
  }
  sdk;
  async run(request) {
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
        ...request.agent.mcpServers === void 0 ? {} : { mcpServers: request.agent.mcpServers },
        ...request.agent.strictMcpConfig === void 0 ? {} : { strictMcpConfig: request.agent.strictMcpConfig },
        ...request.limits.maxTurns === void 0 ? {} : { maxTurns: request.limits.maxTurns },
        ...request.resumeSessionId === void 0 ? {} : { resume: request.resumeSessionId }
      }
    });
    const iterator = query[Symbol.asyncIterator]();
    let sessionId = request.resumeSessionId ?? null;
    let output = "";
    let usage = emptyUsage();
    let totalCostUsd = 0;
    let sdkDurationMs = null;
    let turns = 0;
    let compactionCount = 0;
    let eventCount = 0;
    let consecutiveApiFailures = 0;
    const errors = [];
    let terminationReason = "stream_ended_without_result";
    let status = "failed";
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
          terminationReason = "manual_stop";
          status = "stopped";
          await stopQuery(query);
          break;
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
      errorMessages: errors
    };
  }
};

export {
  defineAgent,
  deniedToolReason,
  createToolSafetyHook,
  BuildRoundSession,
  ClaudeAgentSdkClient,
  DefaultSessionRunner
};
//# sourceMappingURL=chunk-ZISWBL5N.js.map
