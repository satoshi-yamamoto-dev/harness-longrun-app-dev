import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  requirementIds
} from "./chunk-FJRNEWY2.js";
import {
  validateProductSpecReferences
} from "./chunk-3FFAZEYU.js";
import {
  defineAgent
} from "./chunk-ZISWBL5N.js";
import {
  SchemaValidator,
  atomicWriteFile
} from "./chunk-ESBLYH7U.js";
import {
  redactArtifact
} from "./chunk-5CGYLQMM.js";

// runtime/src/evaluator/evaluator-agent.ts
import { readFile as readFile2 } from "node:fs/promises";

// runtime/src/evaluator/playwright-config.ts
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
var PLAYWRIGHT_MCP_VERSION = "0.0.80";
var PLAYWRIGHT_TOOLS = [
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_press_key",
  "browser_select_option",
  "browser_wait_for",
  "browser_take_screenshot",
  "browser_evaluate",
  "browser_network_requests",
  "browser_console_messages",
  "browser_resize",
  "browser_close"
].map((tool) => `mcp__playwright__${tool}`);
function createPlaywrightServer(input) {
  if (!isAbsolute(input.cliPath) || !isAbsolute(input.evidenceRoot)) throw new TypeError("MCP CLI and evidence paths must be absolute");
  if (!["msedge", "chrome", "chromium", "firefox", "webkit"].includes(input.browser)) throw new TypeError("Unsupported Playwright browser");
  return {
    type: "stdio",
    command: process.execPath,
    args: [input.cliPath, "--headless", "--isolated", "--browser", input.browser, "--output-dir", input.evidenceRoot]
  };
}
async function findPlaywrightCli(projectRoot) {
  const dependencyRoot = process.env.LONGRUN_PLAYWRIGHT_ROOT || projectRoot;
  const require2 = createRequire(join(resolve(dependencyRoot), "package.json"));
  let manifestPath;
  try {
    manifestPath = require2.resolve("@playwright/mcp/package.json");
  } catch {
    throw new Error(`Playwright MCP is not installed in ${dependencyRoot}. Required version: ${PLAYWRIGHT_MCP_VERSION}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== PLAYWRIGHT_MCP_VERSION) throw new Error(`Expected Playwright MCP ${PLAYWRIGHT_MCP_VERSION}, found ${manifest.version}`);
  const cliPath = join(dirname(manifestPath), "cli.js");
  await access(cliPath);
  return cliPath;
}

// runtime/src/evaluator/evaluator-agent.ts
async function createEvaluatorAgent(cwd, connection, model = "sonnet") {
  const prompts = await Promise.all(["prompts/evaluator-system.md", "rubrics/common.md", "rubrics/web-ui.md", "rubrics/few-shot.md"].map((file) => readFile2(new URL(`../../../${file}`, import.meta.url), "utf8")));
  return defineAgent({
    role: "qa-functional",
    cwd,
    model,
    systemPrompt: prompts.join("\n\n"),
    allowedTools: ["Read", "Glob", "Grep", "Bash", ...PLAYWRIGHT_TOOLS],
    disallowedTools: ["Edit", "Write", "NotebookEdit", "Agent", "Task", "mcp__playwright__browser_install"],
    permissionMode: "default",
    mcpServers: { playwright: createPlaywrightServer(connection) },
    strictMcpConfig: true
  });
}

// runtime/src/evaluator/evaluator-session.ts
import { resolve as resolve2 } from "node:path";
import { readFile as readFile3 } from "node:fs/promises";

// runtime/src/evaluator/scoring.ts
var QUALITY_DIMENSIONS = ["productDepth", "functionality", "visualDesign", "codeQuality"];
var UI_DIMENSIONS = ["designQuality", "originality", "craft", "functionality"];
function validateThresholds(thresholds) {
  for (const key of QUALITY_DIMENSIONS) if (!Number.isFinite(thresholds[key]) || thresholds[key] < 0 || thresholds[key] > 10) throw new TypeError(`Invalid threshold ${key}`);
}
function applyWebThresholds(result, thresholds) {
  validateThresholds(thresholds);
  if (!result.uiScores) throw new TypeError("Web QA requires all four uiScores");
  const normalize = (score, threshold) => ({ ...score, threshold });
  const scores = { ...result.scores };
  const uiScores = { ...result.uiScores };
  for (const key of QUALITY_DIMENSIONS) scores[key] = normalize(scores[key], thresholds[key]);
  for (const key of UI_DIMENSIONS) uiScores[key] = normalize(uiScores[key], key === "functionality" ? thresholds.functionality : thresholds.visualDesign);
  const passed = (score) => score.applicable && score.score !== null && Number.isFinite(score.score) && score.score >= score.threshold && score.score <= 10;
  const verdict = [...Object.values(scores), ...Object.values(uiScores)].every(passed) && result.requirementResults.length > 0 && result.requirementResults.every((item) => item.status === "passed") && result.issues.length === 0 ? "pass" : "fail";
  return { ...result, scores, uiScores, verdict };
}

// runtime/src/evaluator/evaluator-session.ts
var EvaluatorSession = class {
  constructor(runner, agent, limits) {
    this.runner = runner;
    this.agent = agent;
    this.limits = limits;
    if (agent.role !== "qa-functional" && agent.role !== "qa-visual") throw new TypeError("Evaluator requires an independent QA agent");
    if (!agent.mcpServers?.playwright || agent.strictMcpConfig !== true) throw new TypeError("Evaluator requires explicit Playwright MCP configuration");
  }
  runner;
  agent;
  limits;
  async run(input) {
    if (!input.runId.trim() || !Number.isSafeInteger(input.round) || input.round < 1) throw new TypeError("Invalid evaluation run/round");
    const appUrl = new URL(input.appUrl);
    if (!["http:", "https:"].includes(appUrl.protocol) || appUrl.username || appUrl.password) throw new TypeError("Evaluation URL must be HTTP(S) without credentials");
    if (resolve2(input.projectRoot) !== resolve2(this.agent.cwd)) throw new TypeError("Evaluation project root must match agent cwd");
    const serverArgs = this.agent.mcpServers.playwright.args;
    const outputIndex = serverArgs.indexOf("--output-dir");
    if (outputIndex < 0 || serverArgs[outputIndex + 1] !== resolve2(input.evidenceRoot)) throw new TypeError("Evidence root must match MCP output directory");
    await new SchemaValidator().validate("product-spec", input.spec);
    const errors = validateProductSpecReferences(input.spec);
    if (errors.length) throw new TypeError(errors.join("\n"));
    const thresholds = input.thresholds ?? { productDepth: 8, functionality: 8, visualDesign: 8, codeQuality: 8 };
    validateThresholds(thresholds);
    const context = {
      runId: input.runId,
      round: input.round,
      spec: input.spec,
      appUrl: appUrl.href,
      projectRoot: resolve2(input.projectRoot),
      evidenceRoot: resolve2(input.evidenceRoot),
      runRoot: resolve2(input.runRoot ?? resolve2(input.evidenceRoot, "../..")),
      thresholds
    };
    const schema = await readFile3(new URL("../../../schemas/qa-result.schema.json", import.meta.url), "utf8");
    return this.runner.run({
      agent: this.agent,
      limits: this.limits,
      prompt: `Independently evaluate the running Web application. Use only the following evaluation context; gather your own evidence.
${JSON.stringify(context, null, 2)}

Return exactly one <qa-result-json> JSON object </qa-result-json> envelope. Include all four uiScores. Include one requirementResults entry for EVERY feature, nonFunctionalRequirement and acceptanceCriterion ID. Save screenshots using ABSOLUTE filenames inside evidenceRoot (scale: css); save snapshot and interaction transcripts there too, using browser_snapshot filename and browser_evaluate filename or Bash. Report evidence paths relative to ${context.runRoot} (the Run root). Include evidence kinds screenshot, snapshot and interaction. Do not reference source files as evidence artifacts; save source-review observations into evidenceRoot. Use the live MCP tool schema (click/type use target).

Schema:
${schema}`
    });
  }
};

// runtime/src/evaluator/evidence.ts
import { mkdir, realpath, stat } from "node:fs/promises";
import { isAbsolute as isAbsolute2, relative, resolve as resolve3, sep } from "node:path";
function toolText(result) {
  if (result.isError) throw new Error(`Browser tool failed: ${JSON.stringify(result.content)}`);
  return (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
}
var PlaywrightEvidence = class {
  constructor(tools, runRoot, evidenceRoot) {
    this.tools = tools;
    this.runRoot = runRoot;
    this.evidenceRoot = evidenceRoot;
    const relation = relative(resolve3(runRoot), resolve3(evidenceRoot));
    if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute2(relation)) throw new TypeError("Evidence directory must be inside Run root");
  }
  tools;
  runRoot;
  evidenceRoot;
  async location(filename) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(filename) || filename === "." || filename === "..") throw new TypeError("Evidence filename must be a simple basename");
    await mkdir(this.evidenceRoot, { recursive: true });
    const root = await realpath(this.runRoot);
    const directory = await realpath(this.evidenceRoot);
    const relation = relative(root, directory);
    if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute2(relation)) throw new TypeError("Evidence directory resolves outside Run root");
    const result = resolve3(directory, filename);
    try {
      if (await realpath(result) !== result) throw new TypeError("Evidence target must not be a symlink");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return result;
  }
  reference(kind, absolute) {
    return { kind, path: relative(resolve3(this.runRoot), absolute).split(sep).join("/") };
  }
  async saveText(kind, filename, text) {
    const target = await this.location(filename);
    await atomicWriteFile(target, redactArtifact(text));
    return this.reference(kind, target);
  }
  async navigate(url, filename) {
    return this.saveText("navigation", filename, toolText(await this.tools.call("browser_navigate", { url })));
  }
  async snapshot(filename) {
    const text = toolText(await this.tools.call("browser_snapshot", {}));
    return { text, evidence: await this.saveText("snapshot", filename, text) };
  }
  async click(target, filename) {
    return this.saveText("interaction", filename, toolText(await this.tools.call("browser_click", { target })));
  }
  async type(target, text, filename) {
    return this.saveText("interaction", filename, toolText(await this.tools.call("browser_type", { target, text })));
  }
  async screenshot(filename) {
    if (!filename.endsWith(".png")) throw new TypeError("Screenshot must be PNG");
    const target = await this.location(filename);
    toolText(await this.tools.call("browser_take_screenshot", { type: "png", filename: target, scale: "css", fullPage: true }));
    const info = await stat(target);
    if (!info.isFile() || info.size === 0 || await realpath(target) !== target) throw new Error("Screenshot was not saved as a regular evidence file");
    return this.reference("screenshot", target);
  }
  async readApi(appUrl, apiPath, filename) {
    const base = new URL(appUrl);
    const url = new URL(apiPath, base);
    if (!["http:", "https:"].includes(base.protocol) || url.origin !== base.origin || url.username || url.password) throw new TypeError("API observation must use the application origin");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(1e4) });
    const body = await response.text();
    const evidence = await this.saveText("api", filename, JSON.stringify({ url: url.href, status: response.status, body }, null, 2));
    return { status: response.status, body, evidence };
  }
  async readLocalStorage(appUrl, keys, filename) {
    const origin = new URL(appUrl).origin;
    const expression = `() => { if (location.origin !== ${JSON.stringify(origin)}) throw new Error('Wrong application origin'); return Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, localStorage.getItem(key)])); }`;
    return this.saveText("storage", filename, toolText(await this.tools.call("browser_evaluate", { function: expression })));
  }
};

// runtime/src/evaluator/evaluator.ts
import { createHash } from "node:crypto";
import { readFile as readFile4, realpath as realpath2, stat as stat2 } from "node:fs/promises";
import { isAbsolute as isAbsolute3, relative as relative2, resolve as resolve4, sep as sep2, win32 } from "node:path";
var EvaluationError = class extends Error {
  constructor(message, session) {
    super(message);
    this.session = session;
    this.name = "EvaluationError";
  }
  session;
};
function validateQaReferences(report, spec) {
  const errors = [];
  const required = requirementIds(spec);
  const actual = report.requirementResults.map((r) => r.requirementId);
  if (new Set(required).size !== required.length || new Set(actual).size !== actual.length) errors.push("Duplicate requirement IDs");
  for (const id of required) if (!actual.includes(id)) errors.push(`Missing requirement ${id}`);
  for (const id of actual) if (!required.includes(id)) errors.push(`Unknown requirement ${id}`);
  const ids = /* @__PURE__ */ new Set([spec.specId, ...required, ...spec.scenarios.map((r) => r.id), ...spec.data.map((r) => r.id), ...spec.aiAssessment.tasks.map((r) => r.id), ...spec.externalIntegrations.map((r) => r.id)]);
  if (new Set(report.issues.map((i) => i.issueId)).size !== report.issues.length) errors.push("Duplicate QA issue IDs");
  for (const issue of report.issues) for (const id of issue.specificationIds) if (!ids.has(id)) errors.push(`Unknown specification ID ${id}`);
  for (const item of report.requirementResults) {
    if (item.status !== "not-tested" && item.evidence.length === 0) errors.push(`${item.requirementId} has no evidence`);
    if (item.status === "not-tested" && !item.notes?.trim()) errors.push(`${item.requirementId} needs not-tested reason`);
    if (item.status === "failed" && !report.issues.some((issue) => issue.specificationIds.includes(item.requirementId))) errors.push(`${item.requirementId} needs a reproducible QA issue`);
  }
  if (Date.parse(report.completedAt) < Date.parse(report.startedAt)) errors.push("QA completion precedes start");
  return errors;
}
async function validateEvidence(report, runRoot, evidenceRoot) {
  const root = await realpath2(runRoot);
  const directory = await realpath2(evidenceRoot);
  const within = (base, file) => {
    const rel = relative2(base, file);
    return rel !== ".." && !rel.startsWith(`..${sep2}`) && !isAbsolute3(rel);
  };
  if (directory === root || !within(root, directory)) throw new Error("Invalid evidence directory");
  const artifacts = [...report.evidence, ...report.issues.flatMap((r) => r.evidence), ...report.requirementResults.flatMap((r) => r.evidence)];
  for (const kind of ["screenshot", "snapshot", "interaction"]) if (!artifacts.some((item) => item.kind === kind)) throw new Error(`Missing ${kind} evidence`);
  for (const item of artifacts) {
    if (!item.path || isAbsolute3(item.path) || win32.isAbsolute(item.path) || item.path.includes(":") || item.path.split(/[\\/]/u).includes("..")) throw new Error(`Unsafe evidence path ${item.path}`);
    const file = await realpath2(resolve4(root, item.path));
    if (!within(directory, file) || !(await stat2(file)).isFile()) throw new Error(`Evidence must be a file inside evidence directory: ${item.path}`);
    const bytes = await readFile4(file);
    if (!bytes.length) throw new Error(`Empty evidence ${item.path}`);
    if (item.sha256 && createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error(`Evidence checksum mismatch ${item.path}`);
  }
}
function renderQaMarkdown(report) {
  const row = (key, score) => `- **${key}**: ${score.score ?? "unverified"}/10 (threshold ${score.threshold}). ${score.rationale}`;
  return `# QA round ${report.round}: ${report.verdict.toUpperCase()}

${report.summary}

## Scores

${Object.entries(report.scores).map(([k, s]) => row(k, s)).join("\n")}

## UI detail

${Object.entries(report.uiScores ?? {}).map(([k, s]) => row(k, s)).join("\n")}

## Requirements

${report.requirementResults.map((r) => `- ${r.requirementId}: ${r.status}. ${r.notes ?? ""}`).join("\n")}

## Issues

${report.issues.map((i) => `### ${i.issueId}: ${i.title} [${i.severity}]

Spec: ${i.specificationIds.join(", ")}

${i.reproductionSteps.map((s, n) => `${n + 1}. ${s}`).join("\n")}

Expected: ${i.expectedResult}

Actual: ${i.actualResult}

Evidence: ${i.evidence.map((e) => e.path).join(", ")}`).join("\n\n") || "No issues"}

## Evidence

${report.evidence.map((e) => `- ${e.kind}: ${e.path}`).join("\n")}
`;
}
var Evaluator = class {
  session;
  constructor(runner, agent, limits) {
    this.session = new EvaluatorSession(runner, agent, limits);
  }
  async evaluate(input, runRoot) {
    const evidenceRelative = relative2(resolve4(runRoot, "qa/evidence"), resolve4(input.evidenceRoot));
    if (isAbsolute3(evidenceRelative) || evidenceRelative === ".." || evidenceRelative.startsWith(`..${sep2}`)) throw new TypeError("Evaluator evidenceRoot must be inside Run root/qa/evidence");
    const session = await this.session.run({ ...input, runRoot: resolve4(runRoot) });
    if (session.status !== "completed") throw new EvaluationError(`Evaluator ended with ${session.terminationReason}: ${session.errorMessages.join("; ")}`, session);
    try {
      if (!session.sessionId) throw new Error("Evaluator did not return a session ID");
      const envelopes = [...session.output.matchAll(/<qa-result-json>\s*([\s\S]*?)\s*<\/qa-result-json>/gu)];
      const envelope = envelopes.length === 1 ? envelopes[0]?.[1] : void 0;
      if (!envelope) throw new Error("Expected exactly one qa-result-json envelope");
      const report = await new SchemaValidator().validate("qa-result", JSON.parse(envelope));
      if (report.runId !== input.runId || report.specId !== input.spec.specId || report.round !== input.round) throw new Error("QA run/spec/round mismatch");
      const errors = validateQaReferences(report, input.spec);
      if (errors.length) throw new Error(errors.join("; "));
      await validateEvidence(report, runRoot, input.evidenceRoot);
      const normalized = applyWebThresholds(report, input.thresholds ?? { productDepth: 8, functionality: 8, visualDesign: 8, codeQuality: 8 });
      return { report: normalized, session, markdown: renderQaMarkdown(normalized) };
    } catch (error) {
      throw new EvaluationError(error instanceof Error ? error.message : String(error), session);
    }
  }
  async evaluateAndSave(input, store, runRoot) {
    const result = await this.evaluate(input, runRoot);
    await store.saveJson(`qa/round-${input.round}.json`, "qa-result", result.report);
    await store.saveText(`qa/round-${input.round}.md`, result.markdown);
    return result;
  }
};

export {
  PLAYWRIGHT_MCP_VERSION,
  PLAYWRIGHT_TOOLS,
  createPlaywrightServer,
  findPlaywrightCli,
  createEvaluatorAgent,
  QUALITY_DIMENSIONS,
  UI_DIMENSIONS,
  validateThresholds,
  applyWebThresholds,
  EvaluatorSession,
  toolText,
  PlaywrightEvidence,
  EvaluationError,
  validateQaReferences,
  validateEvidence,
  renderQaMarkdown,
  Evaluator
};
//# sourceMappingURL=chunk-22HC24YG.js.map
