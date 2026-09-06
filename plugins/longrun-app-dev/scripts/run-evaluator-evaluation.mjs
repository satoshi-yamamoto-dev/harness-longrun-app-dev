import { writeFile, safeConsole } from "./lib/safe-output.mjs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ArtifactStore } from "../runtime/dist/artifacts/index.js";
import { Evaluator, createEvaluatorAgent, findPlaywrightCli } from "../runtime/dist/evaluator/index.js";
import { ClaudeAgentSdkClient, DefaultSessionRunner } from "../runtime/dist/sessions/index.js";
import { startQaFixture } from "../tests/fixtures/qa-web-app/server.mjs";
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const checks = path.resolve(pluginRoot, "../../.longrun-app-dev/evaluator-evaluations");
await mkdir(checks, { recursive: true });
const root = await mkdtemp(path.join(checks, "m7-"));
const evidenceRoot = path.join(root, "qa/evidence"); await mkdir(evidenceRoot, { recursive: true });
const spec = JSON.parse(await readFile(new URL("../tests/fixtures/qa-web-app/product-spec.json", import.meta.url), "utf8"));
const app = await startQaFixture(true);
const summary = { runRoot: root, status: "started" };
try {
  const agent = await createEvaluatorAgent(path.join(pluginRoot, "tests/fixtures/qa-web-app"), { cliPath: await findPlaywrightCli(pluginRoot), evidenceRoot, browser: "msedge" });
  const evaluator = new Evaluator(new DefaultSessionRunner(new ClaudeAgentSdkClient()), agent, { maxCostUsd: 1, maxDurationMs: 180000, maxConsecutiveApiFailures: 3, maxTurns: 64 });
  safeConsole.log(`Evaluating controlled QA fixture: ${root}; max $1 / 180s`);
  const result = await evaluator.evaluateAndSave({ runId: path.basename(root), round: 1, spec, appUrl: app.url, evidenceRoot, projectRoot: agent.cwd }, new ArtifactStore(root), root);
  summary.status = "completed"; summary.verdict = result.report.verdict; summary.session = result.session;
  summary.detectedRequirements = result.report.issues.flatMap((issue) => issue.specificationIds);
} catch (error) { summary.status = "failed"; summary.error = error.message; summary.session = error.session; process.exitCode = 1; }
finally { await app.close(); await writeFile(path.join(root, "evaluation.json"), JSON.stringify(summary, null, 2)); safeConsole.log(JSON.stringify({ root, status: summary.status, verdict: summary.verdict, error: summary.error })); }
