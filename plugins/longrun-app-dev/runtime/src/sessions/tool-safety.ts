import { realpathSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname, sep } from "node:path";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

// Defense in depth for visible tool requests. This is not an OS sandbox:
// executed project scripts and browser JavaScript require isolated test data.
export function deniedToolReason(tool: string, input: Record<string, unknown>, cwd: string, tools: readonly string[]): string | undefined {
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
    const outside = (root: string, candidate: string) => {
      const part = relative(root, candidate);
      return part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part);
    };
    if (outside(resolve(cwd), target)) return "File access outside the project is disabled";
    let ancestor = target;
    while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
    try { if (outside(realpathSync(cwd), realpathSync(ancestor))) return "File path redirects outside the project"; }
    catch { return "Cannot verify file location"; }
    if (/(?:^|[\\/])(?:\.env(?:\.[^\\/]+)?|\.git|\.ssh|\.aws|\.claude|\.longrun-app-dev)(?:[\\/]|$)/iu.test(relative(resolve(cwd), target))) return "Credential and harness control paths are protected";
  }
  if (tool === "mcp__playwright__browser_navigate") {
    try {
      const url = new URL(String(input.url));
      if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) return "Browser navigation is restricted to local applications";
    } catch { return "Invalid browser URL"; }
  }
  return undefined;
}

export function createToolSafetyHook(cwd: string, tools: readonly string[]): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const reason = deniedToolReason(input.tool_name, input.tool_input as Record<string, unknown>, cwd, tools);
    return reason ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } } : {};
  };
}
