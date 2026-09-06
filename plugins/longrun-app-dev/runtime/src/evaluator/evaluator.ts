import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { ArtifactStore, SchemaValidator } from "../artifacts/index.js";
import type { ArtifactReference, QaResult, ProductSpec } from "../contracts/index.js";
import type { AgentDefinition, SessionLimits, SessionRunner, SessionRunResult } from "../sessions/index.js";
import { requirementIds } from "../generator/build-report-format.js";
import { EvaluatorSession } from "./evaluator-session.js";
import type { EvaluationSessionRequest } from "./evaluator-session.js";
import { applyWebThresholds } from "./scoring.js";

export interface EvaluationOutput { readonly report: QaResult; readonly session: SessionRunResult; readonly markdown: string; }
export class EvaluationError extends Error {
  constructor(message: string, readonly session?: SessionRunResult) { super(message); this.name = "EvaluationError"; }
}
export function validateQaReferences(report: QaResult, spec: ProductSpec): string[] {
  const errors: string[] = [];
  const required = requirementIds(spec);
  const actual = report.requirementResults.map((r) => r.requirementId);
  if (new Set(required).size !== required.length || new Set(actual).size !== actual.length) errors.push("Duplicate requirement IDs");
  for (const id of required) if (!actual.includes(id)) errors.push(`Missing requirement ${id}`);
  for (const id of actual) if (!required.includes(id)) errors.push(`Unknown requirement ${id}`);
  const ids = new Set([spec.specId, ...required, ...spec.scenarios.map((r) => r.id), ...spec.data.map((r) => r.id), ...spec.aiAssessment.tasks.map((r) => r.id), ...spec.externalIntegrations.map((r) => r.id)]);
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
export async function validateEvidence(report: QaResult, runRoot: string, evidenceRoot: string): Promise<void> {
  const root = await realpath(runRoot);
  const directory = await realpath(evidenceRoot);
  const within = (base: string, file: string) => { const rel = relative(base, file); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
  if (directory === root || !within(root, directory)) throw new Error("Invalid evidence directory");
  const artifacts: ArtifactReference[] = [...report.evidence, ...report.issues.flatMap((r) => r.evidence), ...report.requirementResults.flatMap((r) => r.evidence)];
  for (const kind of ["screenshot", "snapshot", "interaction"]) if (!artifacts.some((item) => item.kind === kind)) throw new Error(`Missing ${kind} evidence`);
  for (const item of artifacts) {
    if (!item.path || isAbsolute(item.path) || win32.isAbsolute(item.path) || item.path.includes(":") || item.path.split(/[\\/]/u).includes("..")) throw new Error(`Unsafe evidence path ${item.path}`);
    const file = await realpath(resolve(root, item.path));
    if (!within(directory, file) || !(await stat(file)).isFile()) throw new Error(`Evidence must be a file inside evidence directory: ${item.path}`);
    const bytes = await readFile(file);
    if (!bytes.length) throw new Error(`Empty evidence ${item.path}`);
    if (item.sha256 && createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error(`Evidence checksum mismatch ${item.path}`);
  }
}
export function renderQaMarkdown(report: QaResult): string {
  const row = (key: string, score: { score: number | null; threshold: number; rationale: string }) => `- **${key}**: ${score.score ?? "unverified"}/10 (threshold ${score.threshold}). ${score.rationale}`;
  return `# QA round ${report.round}: ${report.verdict.toUpperCase()}\n\n${report.summary}\n\n## Scores\n\n${Object.entries(report.scores).map(([k, s]) => row(k, s)).join("\n")}\n\n## UI detail\n\n${Object.entries(report.uiScores ?? {}).map(([k, s]) => row(k, s)).join("\n")}\n\n## Requirements\n\n${report.requirementResults.map((r) => `- ${r.requirementId}: ${r.status}. ${r.notes ?? ""}`).join("\n")}\n\n## Issues\n\n${report.issues.map((i) => `### ${i.issueId}: ${i.title} [${i.severity}]\n\nSpec: ${i.specificationIds.join(", ")}\n\n${i.reproductionSteps.map((s, n) => `${n + 1}. ${s}`).join("\n")}\n\nExpected: ${i.expectedResult}\n\nActual: ${i.actualResult}\n\nEvidence: ${i.evidence.map((e) => e.path).join(", ")}`).join("\n\n") || "No issues"}\n\n## Evidence\n\n${report.evidence.map((e) => `- ${e.kind}: ${e.path}`).join("\n")}\n`;
}
export class Evaluator {
  private readonly session: EvaluatorSession;
  constructor(runner: SessionRunner, agent: AgentDefinition, limits: SessionLimits) { this.session = new EvaluatorSession(runner, agent, limits); }
  async evaluate(input: EvaluationSessionRequest, runRoot: string): Promise<EvaluationOutput> {
    const evidenceRelative = relative(resolve(runRoot, "qa/evidence"), resolve(input.evidenceRoot));
    if (isAbsolute(evidenceRelative) || evidenceRelative === ".." || evidenceRelative.startsWith(`..${sep}`)) throw new TypeError("Evaluator evidenceRoot must be inside Run root/qa/evidence");
    const session = await this.session.run({ ...input, runRoot: resolve(runRoot) });
    if (session.status !== "completed") throw new EvaluationError(`Evaluator ended with ${session.terminationReason}: ${session.errorMessages.join("; ")}`, session);
    try {
      if (!session.sessionId) throw new Error("Evaluator did not return a session ID");
      const envelopes = [...session.output.matchAll(/<qa-result-json>\s*([\s\S]*?)\s*<\/qa-result-json>/gu)];
      const envelope = envelopes.length === 1 ? envelopes[0]?.[1] : undefined;
      if (!envelope) throw new Error("Expected exactly one qa-result-json envelope");
      const report = await new SchemaValidator().validate<QaResult>("qa-result", JSON.parse(envelope));
      if (report.runId !== input.runId || report.specId !== input.spec.specId || report.round !== input.round) throw new Error("QA run/spec/round mismatch");
      const errors = validateQaReferences(report, input.spec);
      if (errors.length) throw new Error(errors.join("; "));
      await validateEvidence(report, runRoot, input.evidenceRoot);
      const normalized = applyWebThresholds(report, input.thresholds ?? { productDepth: 8, functionality: 8, visualDesign: 8, codeQuality: 8 });
      return { report: normalized, session, markdown: renderQaMarkdown(normalized) };
    } catch (error) { throw new EvaluationError(error instanceof Error ? error.message : String(error), session); }
  }
  async evaluateAndSave(input: EvaluationSessionRequest, store: ArtifactStore, runRoot: string): Promise<EvaluationOutput> {
    const result = await this.evaluate(input, runRoot);
    await store.saveJson(`qa/round-${input.round}.json`, "qa-result", result.report);
    await store.saveText(`qa/round-${input.round}.md`, result.markdown);
    return result;
  }
}
