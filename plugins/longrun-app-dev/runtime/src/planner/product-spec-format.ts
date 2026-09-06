import type { ProductSpec } from "../contracts/index.js";

function list(values: readonly string[]): string {
  return values.length === 0 ? "- None" : values.map((value) => `- ${value}`).join("\n");
}

export function renderProductSpecMarkdown(spec: ProductSpec): string {
  const users = spec.targetUsers.map((user) => `### ${user.id}\n\n${user.description}\n\nNeeds:\n${list(user.needs)}`).join("\n\n");
  const scenarios = spec.scenarios.map((scenario) => `### ${scenario.id}: ${scenario.goal}\n\nActor: \`${scenario.actorId}\`\n\n${scenario.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nOutcome: ${scenario.expectedOutcome}`).join("\n\n");
  const features = spec.features.map((feature) => `- **${feature.id}** [${feature.priority}]: ${feature.description} (verifies: ${feature.acceptanceCriterionIds.join(", ")})`).join("\n");
  const criteria = spec.acceptanceCriteria.map((criterion) => `- **${criterion.id}** ${criterion.description}\n  - Verification: ${criterion.verification}`).join("\n");
  const aiTasks = spec.aiAssessment.tasks.map((task) => `- **${task.id}** ${task.instruction}\n  - Tools: ${task.tools.join(", ") || "None"}\n  - State changes: ${task.expectedStateChanges.join("; ") || "None"}\n  - Verifies: ${task.acceptanceCriterionIds.join(", ") || "None"}`).join("\n");
  return `# ${spec.title}\n\n**Spec ID:** \`${spec.specId}\`\n\n${spec.summary}\n\n## Background\n\n${spec.background}\n\n## Target users\n\n${users}\n\n## Problems\n\n${list(spec.problems)}\n\n## User scenarios\n\n${scenarios}\n\n## Features\n\n${features}\n\n## Non-functional requirements\n\n${spec.nonFunctionalRequirements.map((item) => `- **${item.id}** ${item.description}`).join("\n") || "- None"}\n\n## Data\n\n${spec.data.map((item) => `- **${item.id}** ${item.entity}: ${item.description}`).join("\n") || "- None"}\n\n## External integrations\n\n${spec.externalIntegrations.map((item) => `- **${item.id}** ${item.name}: ${item.purpose} (${item.required ? "required" : "optional"})`).join("\n") || "- None"}\n\n## UX principles\n\n${list(spec.uxPrinciples)}\n\n## Constraints\n\n${list(spec.constraints)}\n\n## Acceptance criteria\n\n${criteria}\n\n## AI assessment\n\nAdopted: **${spec.aiAssessment.adopted ? "yes" : "no"}**\n\n${spec.aiAssessment.rationale}\n\n${aiTasks || "- No AI tasks"}\n`;
}

export function extractProductSpecJson(output: string): unknown {
  const match = /<product-spec-json>\s*([\s\S]*?)\s*<\/product-spec-json>/u.exec(output);
  if (!match?.[1]) throw new Error("Response did not contain a product-spec-json envelope");
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Product spec JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateProductSpecReferences(spec: ProductSpec): readonly string[] {
  const errors: string[] = [];
  const userIds = new Set(spec.targetUsers.map((item) => item.id));
  const criterionIds = new Set(spec.acceptanceCriteria.map((item) => item.id));
  for (const scenario of spec.scenarios) {
    if (!userIds.has(scenario.actorId)) errors.push(`${scenario.id}.actorId references missing target user '${scenario.actorId}'`);
  }
  for (const feature of spec.features) {
    for (const id of feature.acceptanceCriterionIds) if (!criterionIds.has(id)) errors.push(`${feature.id} references missing acceptance criterion '${id}'`);
  }
  for (const task of spec.aiAssessment.tasks) {
    for (const id of task.acceptanceCriterionIds) if (!criterionIds.has(id)) errors.push(`${task.id} references missing acceptance criterion '${id}'`);
  }
  if (!spec.aiAssessment.adopted && spec.aiAssessment.tasks.length > 0) errors.push("AI tasks must be empty when AI is not adopted");
  if (spec.aiAssessment.adopted && spec.aiAssessment.tasks.length === 0) errors.push("At least one complete AI task is required when AI is adopted");
  return errors;
}
