import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEvaluatorAgent, createPlaywrightServer, EvaluatorSession, findPlaywrightCli, PLAYWRIGHT_MCP_VERSION, PLAYWRIGHT_TOOLS } from "../runtime/dist/evaluator/index.js";
import { DefaultSessionRunner, defineAgent } from "../runtime/dist/sessions/index.js";
import { MockAgentSdkClient, initEvent, successEvent } from "./helpers/mock-agent-sdk.mjs";

const spec = JSON.parse(await readFile(new URL("fixtures/planner-valid-spec.json", import.meta.url), "utf8"));
const cwd = process.cwd();
const connection = { cliPath: path.join(cwd, "node_modules/@playwright/mcp/cli.js"), evidenceRoot: path.join(cwd, ".longrun-app-dev/qa/evidence"), browser: "msedge" };
const input = { runId: "qa-test", round: 1, spec, appUrl: "http://127.0.0.1:3000", projectRoot: cwd, evidenceRoot: connection.evidenceRoot };
const limits = { maxCostUsd: 0.5, maxDurationMs: 1000, maxConsecutiveApiFailures: 3 };

test("Evaluator uses an isolated browser and explicit MCP tools without authoring tools", async () => {
  const agent = await createEvaluatorAgent(cwd, connection, "test-model");
  assert.equal(agent.role, "qa-functional");
  assert.equal(agent.strictMcpConfig, true);
  assert.deepEqual(Object.keys(agent.mcpServers), ["playwright"]);
  assert.equal(agent.mcpServers.playwright.command, process.execPath);
  assert.ok(agent.mcpServers.playwright.args.includes("--isolated"));
  assert.ok(agent.mcpServers.playwright.args.includes("--headless"));
  assert.ok(PLAYWRIGHT_TOOLS.every((tool) => agent.allowedTools.includes(tool)));
  assert.ok(!agent.allowedTools.includes("Edit"));
  assert.ok(agent.disallowedTools.includes("mcp__playwright__browser_install"));
  assert.ok(!agent.mcpServers.playwright.args.includes("--no-sandbox"));
});

test("fresh QA calls exclude Generator sessions, output and history even as extra JS properties", async () => {
  const sdk = new MockAgentSdkClient([
    { events: [initEvent("qa-1"), successEvent({ session_id: "qa-1" })] },
    { events: [initEvent("qa-2"), successEvent({ session_id: "qa-2" })] },
  ]);
  const session = new EvaluatorSession(new DefaultSessionRunner(sdk), await createEvaluatorAgent(cwd, connection, "test-model"), limits);
  const extra = { ...input, resumeSessionId: "generator-secret", generatorOutput: "author-claim", history: ["private-history"] };
  assert.equal((await session.run(extra)).sessionId, "qa-1");
  assert.equal((await session.run(extra)).sessionId, "qa-2");
  for (const request of sdk.requests) {
    assert.equal(request.options.resume, undefined);
    assert.doesNotMatch(request.prompt, /generator-secret|author-claim|private-history/);
    assert.match(request.prompt, /study-flow/);
    assert.equal(request.options.strictMcpConfig, true);
    assert.deepEqual(request.options.mcpServers.playwright, createPlaywrightServer(connection));
  }
});

test("invalid evaluation context is rejected before SDK execution", async () => {
  const sdk = new MockAgentSdkClient([]);
  const session = new EvaluatorSession(new DefaultSessionRunner(sdk), await createEvaluatorAgent(cwd, connection, "test-model"), limits);
  for (const invalid of [
    { ...input, appUrl: "file:///secrets" }, { ...input, appUrl: "http://name:password@localhost" },
    { ...input, evidenceRoot: path.join(cwd, "different") }, { ...input, projectRoot: path.join(cwd, "different") },
    { ...input, round: 0 }, { ...input, spec: { schemaVersion: 1 } },
  ]) await assert.rejects(session.run(invalid));
  assert.equal(sdk.requests.length, 0);
  assert.throws(() => new EvaluatorSession(new DefaultSessionRunner(sdk), defineAgent({ role: "generator", cwd, model: "test", systemPrompt: "build" }), limits));
});

test("MCP resolver fails on missing/wrong version and resolves installed pinned CLI offline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qa-mcp-resolve-"));
  await assert.rejects(findPlaywrightCli(root), /not installed/);
  const packageRoot = path.join(root, "node_modules/@playwright/mcp");
  await mkdir(packageRoot, { recursive: true });
  const manifest = (version) => JSON.stringify({ name: "@playwright/mcp", version });
  await writeFile(path.join(packageRoot, "package.json"), manifest("0.0.1"));
  await assert.rejects(findPlaywrightCli(root), /Expected Playwright MCP/);
  await writeFile(path.join(packageRoot, "package.json"), manifest(PLAYWRIGHT_MCP_VERSION));
  await writeFile(path.join(packageRoot, "cli.js"), "// synthetic fixture, never executed\n");
  assert.equal(await findPlaywrightCli(root), path.join(packageRoot, "cli.js"));
});

test("MCP connection rejects relative paths and unsupported browser channels", () => {
  assert.throws(() => createPlaywrightServer({ ...connection, cliPath: "cli.js" }), /absolute/);
  assert.throws(() => createPlaywrightServer({ ...connection, browser: "other" }), /Unsupported/);
});
