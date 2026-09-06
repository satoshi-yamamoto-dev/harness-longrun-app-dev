import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { Planner, createPlannerAgent } from "../runtime/dist/planner/index.js";
import { ClaudeAgentSdkClient, DefaultSessionRunner } from "../runtime/dist/sessions/index.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(pluginRoot, "..", "..");
const fixtures = JSON.parse(await readFile(path.join(pluginRoot, "tests", "fixtures", "planner-prompts.json"), "utf8"));
const fixture = fixtures.find((item) => item.id === "ai-study-coach");
if (!fixture) throw new Error("ai-study-coach fixture is missing");

const outputRoot = path.join(repositoryRoot, "docs", "reviews", "m5-planner");
await mkdir(outputRoot, { recursive: true });
const agent = await createPlannerAgent(repositoryRoot, "sonnet");
const planner = new Planner(
  new DefaultSessionRunner(new ClaudeAgentSdkClient()),
  agent,
  { maxCostUsd: 0.5, maxDurationMs: 180_000, maxConsecutiveApiFailures: 3, maxTurns: 8 },
);
const result = await planner.planAndSave({ request: fixture.request, repairAttempts: 2 }, new ArtifactStore(outputRoot));
process.stdout.write(JSON.stringify({ specId: result.spec.specId, attempts: result.attempts, outputRoot }, null, 2) + "\n");
