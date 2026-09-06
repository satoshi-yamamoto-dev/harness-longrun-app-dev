import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { createPlannerAgent, Planner, PlannerExecutionError } from "../runtime/dist/planner/index.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validSpec = JSON.parse(await readFile(path.join(pluginRoot, "tests", "fixtures", "planner-valid-spec.json"), "utf8"));
const envelope = (value) => `<product-spec-json>\n${JSON.stringify(value)}\n</product-spec-json>`;
const limits = { maxCostUsd: 1, maxDurationMs: 1_000, maxConsecutiveApiFailures: 3 };

class MockRunner {
  constructor(outputs) { this.outputs = [...outputs]; this.requests = []; }
  async run(request) {
    this.requests.push(request);
    const output = this.outputs.shift();
    if (output === undefined) throw new Error("No planner output remains");
    return {
      status: "completed", terminationReason: "completed", sessionId: "planner-session", output,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      totalCostUsd: 0.01, durationMs: 1, sdkDurationMs: 1, turns: 1, compactionCount: 0, eventCount: 1, errorMessages: [],
    };
  }
}

test("Planner agent loads the comprehensive, high-level planning policy", async () => {
  const agent = await createPlannerAgent(process.cwd(), "test-model");
  assert.equal(agent.role, "planner");
  assert.equal(agent.permissionMode, "plan");
  assert.deepEqual(agent.allowedTools, ["Read", "Glob", "Grep"]);
  for (const phrase of ["one to four sentences", "high-level system-design", "AI materially improves", "complete user outcome", "observable result"]) {
    assert.match(agent.systemPrompt, new RegExp(phrase, "i"));
  }
});

test("emits validated JSON and Markdown and saves both atomically", async () => {
  const runner = new MockRunner([envelope(validSpec)]);
  const agent = await createPlannerAgent(process.cwd(), "test-model");
  const planner = new Planner(runner, agent, limits);
  const runRoot = await mkdtemp(path.join(os.tmpdir(), "planner-output-"));
  const output = await planner.planAndSave({ request: "Create a study planner." }, new ArtifactStore(runRoot));
  assert.equal(output.attempts, 1);
  assert.equal(output.spec.specId, "study-flow");
  assert.match(output.markdown, /^# Study Flow/m);
  assert.match(output.markdown, /Verification: Create two topics/);
  assert.deepEqual(JSON.parse(await readFile(path.join(runRoot, "product-spec.json"), "utf8")), validSpec);
  assert.equal(await readFile(path.join(runRoot, "product-spec.md"), "utf8"), output.markdown);
});

test("repairs schema-invalid output in the same session", async () => {
  const runner = new MockRunner([envelope({ schemaVersion: 1 }), envelope(validSpec)]);
  const agent = await createPlannerAgent(process.cwd(), "test-model");
  const output = await new Planner(runner, agent, limits).plan({ request: "Create a study planner.", repairAttempts: 1 });
  assert.equal(output.attempts, 2);
  assert.equal(runner.requests[1].resumeSessionId, "planner-session");
  assert.match(runner.requests[1].prompt, /Validation errors/);
  assert.match(runner.requests[1].prompt, /required property/);
});

test("repairs broken cross references", async () => {
  const invalid = structuredClone(validSpec);
  invalid.scenarios[0].actorId = "missing-user";
  const runner = new MockRunner([envelope(invalid), envelope(validSpec)]);
  const agent = await createPlannerAgent(process.cwd(), "test-model");
  const output = await new Planner(runner, agent, limits).plan({ request: "Create a study planner.", repairAttempts: 1 });
  assert.equal(output.attempts, 2);
  assert.match(runner.requests[1].prompt, /missing target user/);
});

test("fails clearly when repair attempts are exhausted", async () => {
  const runner = new MockRunner(["not JSON", "still not JSON"]);
  const agent = await createPlannerAgent(process.cwd(), "test-model");
  await assert.rejects(
    new Planner(runner, agent, limits).plan({ request: "Create a study planner.", repairAttempts: 1 }),
    (error) => error instanceof PlannerExecutionError && error.attempts === 2 && /envelope/.test(error.message),
  );
});

test("fixed evaluation prompts are short and cover diverse planning risks", async () => {
  const fixtures = JSON.parse(await readFile(path.join(pluginRoot, "tests", "fixtures", "planner-prompts.json"), "utf8"));
  assert.equal(fixtures.length, 4);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
  for (const fixture of fixtures) {
    const sentences = fixture.request.split(/[.!?]+/u).filter((part) => part.trim()).length;
    assert.ok(sentences >= 1 && sentences <= 4, fixture.id);
    assert.ok(fixture.expectedSignals.length >= 5, fixture.id);
  }
});
