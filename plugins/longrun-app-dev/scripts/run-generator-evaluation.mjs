import { writeFile, safeConsole } from "./lib/safe-output.mjs";
import { writeFile as writeSourceFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebProjectAdapter } from "../runtime/dist/adapters/index.js";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { Generator, createGeneratorAgent } from "../runtime/dist/generator/index.js";
import { ClaudeAgentSdkClient, DefaultSessionRunner } from "../runtime/dist/sessions/index.js";

// Deliberate, bounded live-model smoke test. Only the newly created copy is edited.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const evaluationRoot = path.join(root, ".longrun-app-dev", "generator-evaluations");
await mkdir(evaluationRoot, { recursive: true });
const runRoot = await mkdtemp(path.join(evaluationRoot, "m6-"));
const projectRoot = path.join(runRoot, "project");
await cp(path.join(root, "examples", "web-app"), projectRoot, {
  recursive: true, filter: (source) => !["node_modules", "dist"].includes(path.basename(source)),
});
const store = new ArtifactStore(runRoot);
const adapter = new WebProjectAdapter(projectRoot);
const spec = {
  schemaVersion: 1, specId: "generator-smoke", title: "Generator smoke ready",
  summary: "A local status page with a working health endpoint.",
  background: "Verify a real initial Build and a repair Build on a small existing Web project.",
  targetUsers: [{ id: "developer", description: "A local developer", needs: ["Visible readiness"] }],
  problems: ["The existing page does not identify this smoke-test app"],
  scenarios: [{ id: "inspect", actorId: "developer", goal: "Check readiness", steps: ["Open the home page", "Query the health endpoint"], expectedOutcome: "The page identifies the app and health is ready" }],
  features: [{ id: "status", description: "Display Generator smoke ready in the page title and visible heading, preserving the existing fixture API and behavior.", priority: "must", acceptanceCriterionIds: ["ac-page", "ac-health"] }],
  nonFunctionalRequirements: [], data: [], externalIntegrations: [], uxPrinciples: ["Clear status"],
  constraints: ["Use the existing dependency-free Web fixture; no installs or external services", "Retain existing tests and startup environment options"],
  acceptanceCriteria: [
    { id: "ac-page", description: "The home page title and heading identify Generator smoke ready", verification: "Build and start the app, fetch / and check title and h1 contain Generator smoke ready" },
    { id: "ac-health", description: "Normal startup serves a healthy JSON response", verification: "With default environment, GET /api/health must return 200 with ready equal to true" },
  ], aiAssessment: { adopted: false, rationale: "A deterministic status page needs no AI", tasks: [] },
};
const runId = path.basename(runRoot);
const agent = await createGeneratorAgent(projectRoot, "sonnet");
const generator = new Generator(new DefaultSessionRunner(new ClaudeAgentSdkClient()), agent,
  { maxCostUsd: 0.5, maxDurationMs: 180_000, maxConsecutiveApiFailures: 3, maxTurns: 16 });
await store.saveJson("product-spec.json", "product-spec", spec);
const summary = { runId, runRoot, status: "started", maxCostUsd: 1, rounds: [] };
const snapshot = () => writeFile(path.join(runRoot, "evaluation.json"), JSON.stringify(summary, null, 2) + "\n");
async function verify(round) {
  const commands = [];
  for (const operation of ["build", "test", "lint"]) {
    const result = await adapter[operation]();
    commands.push(result);
    await writeFile(path.join(runRoot, `verification-${round}.json`), JSON.stringify(commands, null, 2));
    assert.equal(result.status, "passed", `${operation}: ${result.stderr}`);
  }
  const running = await adapter.start({ timeoutMs: 10_000 });
  try {
    const html = await (await fetch(running.url)).text();
    assert.match(html, /<title[^>]*>\s*Generator smoke ready\s*<\/title>/iu);
    assert.match(html, /<h1[^>]*>\s*Generator smoke ready\s*<\/h1>/iu);
    const health = await fetch(new URL("/api/health", running.url));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ready, true);
  } finally { await adapter.stop(running); }
}
try {
  await snapshot();
  safeConsole.log(`Live Generator evaluation: ${runRoot}; maximum $1 total, 180 seconds per round.`);
  const request = { runId, round: 1, spec, adapter: { detection: await adapter.detect(), config: { type: "web" } }, projectConventions: "Keep the existing dependency-free layout and package scripts. Do not remove or weaken existing tests." };
  const first = await generator.buildAndSave(request, store);
  summary.rounds.push({ round: 1, sessionId: first.sessionId, sessions: first.sessions });
  await snapshot();
  await verify(1);
  // Inject a deterministic fault only in this disposable copy after verifying round 1.
  const serverPath = path.join(projectRoot, "server.mjs");
  const server = await readFile(serverPath, "utf8");
  const healthy = 'const ready = process.env.FIXTURE_NEVER_READY !== "1";';
  assert.ok(server.includes(healthy), "Expected fixture health expression for controlled fault injection");
  await writeSourceFile(serverPath, server.replace(healthy, "const ready = false;"));
  const running = await adapter.start({ timeoutMs: 10_000 });
  let actual;
  try {
    const response = await fetch(new URL("/api/health", running.url));
    actual = { status: response.status, body: await response.json() };
    assert.equal(actual.status, 503);
    assert.equal(actual.body.ready, false);
  } finally { await adapter.stop(running); }
  const now = new Date().toISOString();
  await store.saveText("qa/evidence/health.json", JSON.stringify(actual));
  const qa = { schemaVersion: 1, runId, specId: spec.specId, round: 1, startedAt: now, completedAt: now,
    verdict: "fail", scores: Object.fromEntries(["productDepth", "functionality", "visualDesign", "codeQuality"].map((key) => [key, { score: key === "functionality" ? 1 : null, threshold: 4, applicable: key === "functionality", rationale: "Scripted smoke-test result; not independent Evaluator scoring" }])),
    issues: [{ issueId: "health-regression", title: "Default startup reports unhealthy", severity: "high", specificationIds: ["ac-health"], reproductionSteps: ["Start with default environment", "GET /api/health"], expectedResult: "200 and ready true", actualResult: "503 and ready false", evidence: [{ kind: "http", path: "qa/evidence/health.json" }] }],
    requirementResults: [{ requirementId: "ac-health", status: "failed", evidence: [{ kind: "http", path: "qa/evidence/health.json" }] }], evidence: [{ kind: "http", path: "qa/evidence/health.json" }], summary: "Injected health regression, confirmed by HTTP request" };
  await store.saveJson("qa/round-1.json", "qa-result", qa);
  const second = await generator.buildAndSave({ ...request, round: 2, previousBuild: first.report, qa }, store);
  summary.rounds.push({ round: 2, sessionId: second.sessionId, sessions: second.sessions });
  await snapshot();
  await verify(2);
  assert.equal(second.report.qaIssueResults[0]?.status, "resolved");
  summary.status = "passed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  if (error?.sessions) summary.failedSessions = error.sessions;
  process.exitCode = 1;
} finally {
  await snapshot();
  safeConsole.log(JSON.stringify({ runRoot, status: summary.status, error: summary.error }));
}
