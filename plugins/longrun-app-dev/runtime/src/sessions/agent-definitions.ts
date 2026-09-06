import path from "node:path";

import type { AgentDefinition, AgentPermissionMode, AgentRole, StdioMcpServer } from "./types.js";

export interface AgentDefinitionInput {
  readonly role: AgentRole;
  readonly cwd: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly allowedTools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly permissionMode?: AgentPermissionMode;
  readonly mcpServers?: Readonly<Record<string, StdioMcpServer>>;
  readonly strictMcpConfig?: boolean;
}

const roleDefaults: Record<AgentRole, { tools: readonly string[]; permissionMode: AgentPermissionMode }> = {
  planner: { tools: ["Read", "Glob", "Grep"], permissionMode: "plan" },
  generator: { tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"], permissionMode: "acceptEdits" },
  "qa-functional": { tools: ["Read", "Glob", "Grep", "Bash"], permissionMode: "default" },
  "qa-visual": { tools: ["Read", "Glob", "Grep", "Bash"], permissionMode: "default" },
};

export function defineAgent(input: AgentDefinitionInput): AgentDefinition {
  const defaults = roleDefaults[input.role];
  const cwd = path.resolve(input.cwd);
  if (!input.model.trim()) throw new Error("Agent model must not be empty");
  if (!input.systemPrompt.trim()) throw new Error("Agent system prompt must not be empty");
  return {
    id: input.role,
    role: input.role,
    model: input.model,
    systemPrompt: input.systemPrompt,
    allowedTools: [...(input.allowedTools ?? defaults.tools)],
    ...(input.disallowedTools ? { disallowedTools: [...input.disallowedTools] } : {}),
    cwd,
    permissionMode: input.permissionMode ?? defaults.permissionMode,
    ...(input.mcpServers === undefined ? {} : { mcpServers: input.mcpServers }),
    ...(input.strictMcpConfig === undefined ? {} : { strictMcpConfig: input.strictMcpConfig }),
  };
}
