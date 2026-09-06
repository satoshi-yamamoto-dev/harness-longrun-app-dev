import { readFile } from "node:fs/promises";

import { defineAgent } from "../sessions/index.js";
import type { AgentDefinition } from "../sessions/index.js";

export async function createPlannerAgent(cwd: string, model = "sonnet"): Promise<AgentDefinition> {
  const promptUrl = new URL("../../../prompts/planner-system.md", import.meta.url);
  const systemPrompt = await readFile(promptUrl, "utf8");
  return defineAgent({ role: "planner", cwd, model, systemPrompt });
}
