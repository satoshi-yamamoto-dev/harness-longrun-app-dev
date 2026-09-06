import { readFile } from "node:fs/promises";
import { defineAgent } from "../sessions/index.js";
import type { AgentDefinition } from "../sessions/index.js";
import { createPlaywrightServer, PLAYWRIGHT_TOOLS } from "./playwright-config.js";
import type { PlaywrightConnection } from "./playwright-config.js";

export async function createEvaluatorAgent(cwd: string, connection: PlaywrightConnection, model = "sonnet"): Promise<AgentDefinition> {
  const prompts = await Promise.all(["prompts/evaluator-system.md", "rubrics/common.md", "rubrics/web-ui.md", "rubrics/few-shot.md"].map((file) => readFile(new URL(`../../../${file}`, import.meta.url), "utf8")));
  return defineAgent({
    role: "qa-functional", cwd, model,
    systemPrompt: prompts.join("\n\n"),
    allowedTools: ["Read", "Glob", "Grep", "Bash", ...PLAYWRIGHT_TOOLS],
    disallowedTools: ["Edit", "Write", "NotebookEdit", "Agent", "Task", "mcp__playwright__browser_install"],
    permissionMode: "default",
    mcpServers: { playwright: createPlaywrightServer(connection) },
    strictMcpConfig: true,
  });
}
