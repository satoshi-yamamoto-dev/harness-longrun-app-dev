import { execFileSync } from "node:child_process";
import { createToolSafetyHook } from "./tool-safety.js";

import type { AgentSdkClient, SdkEvent, SdkQuery, SdkQueryRequest } from "./types.js";

export class ClaudeAgentSdkClient implements AgentSdkClient {
  constructor(private readonly executablePath?: string) {}

  query(request: SdkQueryRequest): SdkQuery {
    let active: { close(): void; interrupt(): Promise<unknown>; [Symbol.asyncIterator](): AsyncIterator<unknown> } | undefined;
    const load = async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
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
        ...(request.options.mcpServers === undefined ? {} : {
          mcpServers: Object.fromEntries(Object.entries(request.options.mcpServers).map(([name, server]) => [name, {
            type: server.type,
            command: server.command,
            args: [...server.args],
            ...(server.env === undefined ? {} : { env: { ...server.env } }),
          }])),
        }),
        ...(request.options.strictMcpConfig === undefined ? {} : { strictMcpConfig: request.options.strictMcpConfig }),
        ...(pathToClaudeCodeExecutable === undefined ? {} : { pathToClaudeCodeExecutable }),
        ...(request.options.maxTurns === undefined ? {} : { maxTurns: request.options.maxTurns }),
        ...(request.options.resume === undefined ? {} : { resume: request.options.resume }),
      };
      const sdkQuery = query({ prompt: request.prompt, options });
      active = sdkQuery;
      return sdkQuery;
    };
    return {
      async interrupt() { if (active) await active.interrupt(); },
      close() { active?.close(); },
      async *[Symbol.asyncIterator]() {
        const query = await load();
        for await (const event of query) yield event as SdkEvent;
      },
    };
  }
}

function discoverClaudeExecutable(): string | undefined {
  if (process.env.CLAUDE_CODE_EXECUTABLE) return process.env.CLAUDE_CODE_EXECUTABLE;
  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    return execFileSync(locator, ["claude"], { encoding: "utf8", windowsHide: true })
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}
