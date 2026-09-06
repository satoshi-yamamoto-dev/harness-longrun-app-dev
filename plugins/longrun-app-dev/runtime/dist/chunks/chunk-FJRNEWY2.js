import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// runtime/src/generator/build-report-format.ts
import { posix, win32 } from "node:path";
function requirementIds(spec) {
  return [...spec.features, ...spec.nonFunctionalRequirements, ...spec.acceptanceCriteria].map((item) => item.id);
}
function extractBuildReportJson(output) {
  const match = /^\s*<build-report-json>\s*([\s\S]*?)\s*<\/build-report-json>\s*$/u.exec(output);
  if (!match?.[1]) throw new Error("Response must contain exactly one build-report-json envelope");
  return JSON.parse(match[1]);
}
function relativePath(value) {
  return value.trim().length > 0 && !posix.isAbsolute(value) && !win32.isAbsolute(value) && !value.includes(":") && !value.includes("\0") && !value.split(/[\\/]/u).includes("..");
}
function validateBuildReport(report, spec, runId, round, qa) {
  const errors = [];
  if (report.runId !== runId || report.specId !== spec.specId || report.round !== round) errors.push("Build report runId/specId/round does not match input");
  if (Date.parse(report.completedAt) < Date.parse(report.startedAt)) errors.push("completedAt precedes startedAt");
  const expected = requirementIds(spec);
  const checkIds = (actual, wanted, label) => {
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
function renderBuildReportMarkdown(report) {
  return `# Build round ${report.round}

Run: ${report.runId}
Spec: ${report.specId}

${report.summary}

## Requirements

${report.requirementResults.map((r) => `- **${r.requirementId}**: ${r.status}. ${r.notes ?? ""} Evidence: ${r.evidence.join("; ") || "None"}`).join("\n")}

## QA issue resolutions

${report.qaIssueResults.map((r) => `- **${r.issueId}**: ${r.status}. ${r.notes ?? ""} Evidence: ${r.evidence.join("; ") || "None"}`).join("\n") || "- None"}

## Verification

${report.verification.map((r) => `- ${r.command}: ${r.status} (exit ${r.exitCode ?? "n/a"}, ${r.durationMs} ms). ${r.summary ?? ""}`).join("\n")}

## Changed files

${report.changedFiles.map((r) => `- ${r.path} (${r.change}): ${r.summary}`).join("\n") || "- None"}

## Known issues

${report.knownIssues.map((r) => `- ${r.id} [${r.severity}]: ${r.description}`).join("\n") || "- None"}
`;
}

export {
  requirementIds,
  extractBuildReportJson,
  validateBuildReport,
  renderBuildReportMarkdown
};
//# sourceMappingURL=chunk-FJRNEWY2.js.map
