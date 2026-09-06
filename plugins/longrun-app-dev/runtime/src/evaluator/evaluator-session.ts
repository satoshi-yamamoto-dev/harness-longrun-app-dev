import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { SchemaValidator } from "../artifacts/index.js";
import type { ProductSpec, QualityThresholds } from "../contracts/index.js";
import { validateThresholds } from "./scoring.js";
import { validateProductSpecReferences } from "../planner/product-spec-format.js";
import type { AgentDefinition, SessionLimits, SessionRunner, SessionRunResult } from "../sessions/index.js";

export interface EvaluationSessionRequest {
  readonly runId: string;
  readonly round: number;
  readonly spec: ProductSpec;
  readonly appUrl: string;
  readonly projectRoot: string;
  readonly evidenceRoot: string;
  readonly thresholds?: QualityThresholds;
  readonly runRoot?: string;
}

// M7 session boundary only. Report parsing, scoring and persistence are separate.
export class EvaluatorSession {
  constructor(private readonly runner: SessionRunner, private readonly agent: AgentDefinition, private readonly limits: SessionLimits) {
    if (agent.role !== "qa-functional" && agent.role !== "qa-visual") throw new TypeError("Evaluator requires an independent QA agent");
    if (!agent.mcpServers?.playwright || agent.strictMcpConfig !== true) throw new TypeError("Evaluator requires explicit Playwright MCP configuration");
  }

  async run(input: EvaluationSessionRequest): Promise<SessionRunResult> {
    if (!input.runId.trim() || !Number.isSafeInteger(input.round) || input.round < 1) throw new TypeError("Invalid evaluation run/round");
    const appUrl = new URL(input.appUrl);
    if (!["http:", "https:"].includes(appUrl.protocol) || appUrl.username || appUrl.password) throw new TypeError("Evaluation URL must be HTTP(S) without credentials");
    if (resolve(input.projectRoot) !== resolve(this.agent.cwd)) throw new TypeError("Evaluation project root must match agent cwd");
    const serverArgs = this.agent.mcpServers!.playwright!.args;
    const outputIndex = serverArgs.indexOf("--output-dir");
    if (outputIndex < 0 || serverArgs[outputIndex + 1] !== resolve(input.evidenceRoot)) throw new TypeError("Evidence root must match MCP output directory");
    await new SchemaValidator().validate("product-spec", input.spec);
    const errors = validateProductSpecReferences(input.spec);
    if (errors.length) throw new TypeError(errors.join("\n"));
    // Explicit projection prevents accidental forwarding of extra runtime properties
    // such as resumeSessionId, Generator output, or conversation history.
    const thresholds = input.thresholds ?? { productDepth: 8, functionality: 8, visualDesign: 8, codeQuality: 8 };
    validateThresholds(thresholds);
    const context = { runId: input.runId, round: input.round, spec: input.spec, appUrl: appUrl.href,
      projectRoot: resolve(input.projectRoot), evidenceRoot: resolve(input.evidenceRoot), runRoot: resolve(input.runRoot ?? resolve(input.evidenceRoot, "../..")), thresholds };
    const schema = await readFile(new URL("../../../schemas/qa-result.schema.json", import.meta.url), "utf8");
    return this.runner.run({ agent: this.agent, limits: this.limits,
      prompt: `Independently evaluate the running Web application. Use only the following evaluation context; gather your own evidence.\n${JSON.stringify(context, null, 2)}\n\nReturn exactly one <qa-result-json> JSON object </qa-result-json> envelope. Include all four uiScores. Include one requirementResults entry for EVERY feature, nonFunctionalRequirement and acceptanceCriterion ID. Save screenshots using ABSOLUTE filenames inside evidenceRoot (scale: css); save snapshot and interaction transcripts there too, using browser_snapshot filename and browser_evaluate filename or Bash. Report evidence paths relative to ${context.runRoot} (the Run root). Include evidence kinds screenshot, snapshot and interaction. Do not reference source files as evidence artifacts; save source-review observations into evidenceRoot. Use the live MCP tool schema (click/type use target).\n\nSchema:\n${schema}` });
  }
}
