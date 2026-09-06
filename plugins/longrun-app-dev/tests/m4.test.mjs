import assert from "node:assert/strict";
import test from "node:test";

import { BuildRoundSession, DefaultSessionRunner, defineAgent } from "../runtime/dist/sessions/index.js";
import { MockAgentSdkClient, initEvent, successEvent } from "./helpers/mock-agent-sdk.mjs";

const agent = defineAgent({
  role: "generator",
  cwd: process.cwd(),
  model: "claude-sonnet-test",
  systemPrompt: "Build and verify the requested application.",
});
const limits = { maxCostUsd: 1, maxDurationMs: 1_000, maxConsecutiveApiFailures: 3, maxTurns: 20 };

test("manual cancellation interrupts and closes a stalled SDK stream", async () => {
  let closed = false, interrupted = false;
  const sdk = { query() { return { async interrupt() { interrupted = true; }, close() { closed = true; }, async *[Symbol.asyncIterator]() { await new Promise(() => {}); } }; } };
  const controller = new AbortController();
  const pending = new DefaultSessionRunner(sdk).run({ agent, prompt: "test", limits, signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.terminationReason, "manual_stop");
  assert.equal(result.status, "stopped");
  assert.equal(closed, true); assert.equal(interrupted, true);
});

test("a stuck interrupt cannot prevent timeout cleanup", async () => {
  let closed = false;
  const sdk = { query() { return { interrupt: () => new Promise(() => {}), close() { closed = true; }, async *[Symbol.asyncIterator]() { await new Promise(() => {}); } }; } };
  const started = Date.now();
  const result = await new DefaultSessionRunner(sdk).run({ agent, prompt: "test", limits: { ...limits, maxDurationMs: 10 } });
  assert.equal(result.terminationReason, "timeout"); assert.equal(closed, true); assert.ok(Date.now() - started < 5000);
});

test("forwards the agent definition and records streamed result metrics", async () => {
  const sdk = new MockAgentSdkClient([{ events: [
    initEvent(),
    { type: "assistant", session_id: "session-1" },
    successEvent(),
  ] }]);
  const result = await new DefaultSessionRunner(sdk).run({ agent, prompt: "build", limits });

  assert.equal(result.status, "completed");
  assert.equal(result.terminationReason, "completed");
  assert.equal(result.sessionId, "session-1");
  assert.equal(result.output, "done");
  assert.deepEqual(result.usage, { inputTokens: 110, outputTokens: 33, cacheReadInputTokens: 22, cacheCreationInputTokens: 6 });
  assert.equal(result.totalCostUsd, 0.04);
  assert.equal(result.sdkDurationMs, 120);
  assert.equal(result.turns, 2);
  assert.deepEqual(sdk.requests[0].options, {
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    allowedTools: agent.allowedTools,
    disallowedTools: [],
    cwd: agent.cwd,
    permissionMode: "acceptEdits",
    maxBudgetUsd: 1,
    maxTurns: 20,
  });
});

test("classifies SDK errors", async () => {
  const sdk = new MockAgentSdkClient([{ events: [initEvent(), successEvent({ subtype: "error_during_execution", is_error: true, errors: ["boom"] })] }]);
  const result = await new DefaultSessionRunner(sdk).run({ agent, prompt: "build", limits });
  assert.equal(result.status, "failed");
  assert.equal(result.terminationReason, "sdk_error");
  assert.deepEqual(result.errorMessages, ["boom"]);
});

test("enforces SDK cost-limit results", async () => {
  const sdk = new MockAgentSdkClient([{ events: [initEvent(), successEvent({ subtype: "error_max_budget_usd", is_error: true, total_cost_usd: 1 })] }]);
  const result = await new DefaultSessionRunner(sdk).run({ agent, prompt: "build", limits });
  assert.equal(result.status, "stopped");
  assert.equal(result.terminationReason, "cost_limit");
});

test("interrupts and closes a query at the duration limit", async () => {
  const sdk = new MockAgentSdkClient([{ events: [initEvent()], hang: true }]);
  const result = await new DefaultSessionRunner(sdk).run({ agent, prompt: "build", limits: { ...limits, maxDurationMs: 20 } });
  assert.equal(result.terminationReason, "timeout");
  assert.equal(sdk.queries[0].interrupted, true);
  assert.equal(sdk.queries[0].closed, true);
});

test("stops after consecutive API failures", async () => {
  const sdk = new MockAgentSdkClient([{ events: [
    initEvent(),
    { type: "system", subtype: "api_retry", error: "503 one", session_id: "session-1" },
    { type: "system", subtype: "api_retry", error: "503 two", session_id: "session-1" },
  ] }]);
  const result = await new DefaultSessionRunner(sdk).run({
    agent,
    prompt: "build",
    limits: { ...limits, maxConsecutiveApiFailures: 2 },
  });
  assert.equal(result.terminationReason, "api_failure_limit");
  assert.deepEqual(result.errorMessages, ["503 one", "503 two"]);
  assert.equal(sdk.queries[0].closed, true);
});

test("keeps one Generator session throughout a Build round", async () => {
  const sdk = new MockAgentSdkClient([
    { events: [initEvent("build-session"), successEvent({ session_id: "build-session" })] },
    { events: [initEvent("build-session"), successEvent({ session_id: "build-session", result: "fixed" })] },
  ]);
  const round = new BuildRoundSession(new DefaultSessionRunner(sdk), agent, limits);
  await round.run("initial build");
  await round.run("apply QA fixes");
  assert.equal(round.currentSessionId, "build-session");
  assert.equal(round.history.length, 2);
  assert.equal(sdk.requests[0].options.resume, undefined);
  assert.equal(sdk.requests[1].options.resume, "build-session");
});

test("continues after automatic compaction while retaining session state", async () => {
  const sdk = new MockAgentSdkClient([{ events: [
    initEvent("compact-session"),
    { type: "system", subtype: "compact_boundary", session_id: "compact-session", compact_metadata: { trigger: "auto" } },
    { type: "assistant", session_id: "compact-session" },
    successEvent({ session_id: "compact-session", result: "continued" }),
  ] }]);
  const round = new BuildRoundSession(new DefaultSessionRunner(sdk), agent, limits);
  const result = await round.run("large build");
  assert.equal(result.status, "completed");
  assert.equal(result.compactionCount, 1);
  assert.equal(result.output, "continued");
  assert.equal(round.currentSessionId, "compact-session");
});
