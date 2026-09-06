import { posix, win32 } from "node:path";
import type { BuildReport, ProductSpec, QaResult } from "../contracts/index.js";

export function requirementIds(spec: ProductSpec): string[] {
  return [...spec.features, ...spec.nonFunctionalRequirements, ...spec.acceptanceCriteria].map((item) => item.id);
}

export function extractBuildReportJson(output: string): unknown {
  const match = /^\s*<build-report-json>\s*([\s\S]*?)\s*<\/build-report-json>\s*$/u.exec(output);
  if (!match?.[1]) throw new Error("Response must contain exactly one build-report-json envelope");
  return JSON.parse(match[1]) as unknown;
}

function relativePath(value: string): boolean {
  return value.trim().length > 0 && !posix.isAbsolute(value) && !win32.isAbsolute(value)
    && !value.includes(":") && !value.includes("\0") && !value.split(/[\\/]/u).includes("..");
}

export function validateBuildReport(
  report: BuildReport, spec: ProductSpec, runId: string, round: number, qa?: QaResult,
): string[] {
  const errors: string[] = [];
  if (report.runId !== runId || report.specId !== spec.specId || report.round !== round) errors.push("Build report runId/specId/round does not match input");
  if (Date.parse(report.completedAt) < Date.parse(report.startedAt)) errors.push("completedAt precedes startedAt");
  const expected = requirementIds(spec);
  const checkIds = (actual: string[], wanted: string[], label: string) => {
    if (new Set(actual).size !== actual.length) errors.push(`${label} contains duplicate IDs`);
    for (const id of actual) if (!wanted.includes(id)) errors.push(`${label} references unknown ID '${id}'`);
    for (const id of wanted) if (!actual.includes(id)) errors.push(`${label} is missing '${id}'`);
  };
  checkIds(report.requirementResults.map((item) => item.requirementId), expected, "requirementResults");
  checkIds(report.qaIssueResults.map((item) => item.issueId), qa?.issues.map((item) => item.issueId) ?? [], "qaIssueResults");
  for (const item of report.requirementResults) {
    if (item.status === "implemented" && item.evidence.length === 0) errors.push(`${item.requirementId} needs implementation evidence`);
    if (item.status !== "implemented" && !item.notes?.trim()) errors.push(`${item.requirementId} needs blocker/partial notes`);
  }
  for (const item of report.qaIssueResults) {
    if (item.status !== "unaddressed" && item.evidence.length === 0) errors.push(`${item.issueId} needs resolution evidence`);
    if (item.status !== "resolved" && !item.notes?.trim()) errors.push(`${item.issueId} needs resolution notes`);
  }
  for (const item of report.knownIssues) {
    for (const id of item.relatedRequirementIds) if (!expected.includes(id)) errors.push(`${item.id} references unknown requirement '${id}'`);
  }
  for (const item of [...report.changedFiles, ...report.artifacts]) {
    if (!relativePath(item.path)) errors.push(`Unsafe project-relative path '${item.path}'`);
  }
  if (report.verification.length === 0) errors.push("verification must record checks or explicit skips");
  for (const item of report.verification) {
    if (item.status === "passed" && item.exitCode !== 0) errors.push(`${item.command}: passed requires exit code 0`);
    if (item.status === "failed" && item.exitCode === 0) errors.push(`${item.command}: failed cannot have exit code 0`);
    if (item.status === "skipped" && (item.exitCode !== null || !item.summary?.trim())) errors.push(`${item.command}: skipped requires null exit code and a reason`);
  }
  return errors;
}

export function renderBuildReportMarkdown(report: BuildReport): string {
  return `# Build round ${report.round}\n\nRun: ${report.runId}\nSpec: ${report.specId}\n\n${report.summary}\n\n## Requirements\n\n${report.requirementResults.map((r) => `- **${r.requirementId}**: ${r.status}. ${r.notes ?? ""} Evidence: ${r.evidence.join("; ") || "None"}`).join("\n")}\n\n## QA issue resolutions\n\n${report.qaIssueResults.map((r) => `- **${r.issueId}**: ${r.status}. ${r.notes ?? ""} Evidence: ${r.evidence.join("; ") || "None"}`).join("\n") || "- None"}\n\n## Verification\n\n${report.verification.map((r) => `- ${r.command}: ${r.status} (exit ${r.exitCode ?? "n/a"}, ${r.durationMs} ms). ${r.summary ?? ""}`).join("\n")}\n\n## Changed files\n\n${report.changedFiles.map((r) => `- ${r.path} (${r.change}): ${r.summary}`).join("\n") || "- None"}\n\n## Known issues\n\n${report.knownIssues.map((r) => `- ${r.id} [${r.severity}]: ${r.description}`).join("\n") || "- None"}\n`;
}
