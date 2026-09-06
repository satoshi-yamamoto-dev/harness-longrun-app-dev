import { readFile } from "node:fs/promises";
import { defineAgent } from "../sessions/index.js";
import type { AgentDefinition } from "../sessions/index.js";

export async function createGeneratorAgent(cwd: string, model = "sonnet"): Promise<AgentDefinition> {
  return defineAgent({
    role: "generator", cwd, model,
    systemPrompt: await readFile(new URL("../../../prompts/generator-system.md", import.meta.url), "utf8"),
  });
}
