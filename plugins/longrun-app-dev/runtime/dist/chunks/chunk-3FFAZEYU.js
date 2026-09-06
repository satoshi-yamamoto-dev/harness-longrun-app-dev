import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// runtime/src/planner/product-spec-format.ts
function list(values) {
  return values.length === 0 ? "- None" : values.map((value) => `- ${value}`).join("\n");
}
function renderProductSpecMarkdown(spec) {
  const users = spec.targetUsers.map((user) => `### ${user.id}

${user.description}

Needs:
${list(user.needs)}`).join("\n\n");
  const scenarios = spec.scenarios.map((scenario) => `### ${scenario.id}: ${scenario.goal}

Actor: \`${scenario.actorId}\`

${scenario.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Outcome: ${scenario.expectedOutcome}`).join("\n\n");
  const features = spec.features.map((feature) => `- **${feature.id}** [${feature.priority}]: ${feature.description} (verifies: ${feature.acceptanceCriterionIds.join(", ")})`).join("\n");
  const criteria = spec.acceptanceCriteria.map((criterion) => `- **${criterion.id}** ${criterion.description}
  - Verification: ${criterion.verification}`).join("\n");
  const aiTasks = spec.aiAssessment.tasks.map((task) => `- **${task.id}** ${task.instruction}
  - Tools: ${task.tools.join(", ") || "None"}
  - State changes: ${task.expectedStateChanges.join("; ") || "None"}
  - Verifies: ${task.acceptanceCriterionIds.join(", ") || "None"}`).join("\n");
  return `# ${spec.title}

**Spec ID:** \`${spec.specId}\`

${spec.summary}

## Background

${spec.background}

## Target users

${users}

## Problems

${list(spec.problems)}

## User scenarios

${scenarios}

## Features

${features}

## Non-functional requirements

${spec.nonFunctionalRequirements.map((item) => `- **${item.id}** ${item.description}`).join("\n") || "- None"}

## Data

${spec.data.map((item) => `- **${item.id}** ${item.entity}: ${item.description}`).join("\n") || "- None"}

## External integrations

${spec.externalIntegrations.map((item) => `- **${item.id}** ${item.name}: ${item.purpose} (${item.required ? "required" : "optional"})`).join("\n") || "- None"}

## UX principles

${list(spec.uxPrinciples)}

## Constraints

${list(spec.constraints)}

## Acceptance criteria

${criteria}

## AI assessment

Adopted: **${spec.aiAssessment.adopted ? "yes" : "no"}**

${spec.aiAssessment.rationale}

${aiTasks || "- No AI tasks"}
`;
}
function extractProductSpecJson(output) {
  const match = /<product-spec-json>\s*([\s\S]*?)\s*<\/product-spec-json>/u.exec(output);
  if (!match?.[1]) throw new Error("Response did not contain a product-spec-json envelope");
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Product spec JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function validateProductSpecReferences(spec) {
  const errors = [];
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

export {
  renderProductSpecMarkdown,
  extractProductSpecJson,
  validateProductSpecReferences
};
//# sourceMappingURL=chunk-3FFAZEYU.js.map
