import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  extractProductSpecJson,
  renderProductSpecMarkdown,
  validateProductSpecReferences
} from "./chunk-3FFAZEYU.js";
import {
  defineAgent
} from "./chunk-ZISWBL5N.js";
import {
  ArtifactValidationError,
  SchemaValidator
} from "./chunk-ESBLYH7U.js";

// runtime/src/planner/planner-agent.ts
import { readFile } from "node:fs/promises";
async function createPlannerAgent(cwd, model = "sonnet") {
  const promptUrl = new URL("../../../prompts/planner-system.md", import.meta.url);
  const systemPrompt = await readFile(promptUrl, "utf8");
  return defineAgent({ role: "planner", cwd, model, systemPrompt });
}

// runtime/src/planner/planner.ts
import { readFile as readFile2 } from "node:fs/promises";
var PlannerExecutionError = class extends Error {
  constructor(message, attempts) {
    super(message);
    this.attempts = attempts;
    this.name = "PlannerExecutionError";
  }
  attempts;
};
var Planner = class {
  constructor(runner, agent, limits, validator = new SchemaValidator()) {
    this.runner = runner;
    this.agent = agent;
    this.limits = limits;
    this.validator = validator;
    if (agent.role !== "planner") throw new Error("Planner requires a planner agent");
  }
  runner;
  agent;
  limits;
  validator;
  async plan(input) {
    if (!input.request.trim()) throw new TypeError("Planner request must not be empty");
    const schema = await readFile2(new URL("../../../schemas/product-spec.schema.json", import.meta.url), "utf8");
    const maxAttempts = 1 + (input.repairAttempts ?? 2);
    let prompt = `Create the complete ProductSpec for this request:

${input.request.trim()}

ProductSpec JSON Schema:
${schema}`;
    let sessionId;
    let lastError = "Planner did not return a valid specification";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.runner.run({
        agent: this.agent,
        prompt,
        limits: this.limits,
        ...sessionId === void 0 ? {} : { resumeSessionId: sessionId }
      });
      if (result.sessionId !== null) sessionId = result.sessionId;
      if (result.status !== "completed") {
        const details = result.errorMessages.length > 0 ? `: ${result.errorMessages.join("; ")}` : "";
        throw new PlannerExecutionError(`Planner session ended with ${result.terminationReason}${details}`, attempt);
      }
      try {
        const candidate = extractProductSpecJson(result.output);
        const spec = await this.validator.validate("product-spec", candidate);
        const referenceErrors = validateProductSpecReferences(spec);
        if (referenceErrors.length > 0) throw new Error(referenceErrors.join("\n"));
        if (sessionId === void 0) throw new Error("Planner SDK result did not contain a session ID");
        return {
          spec,
          json: `${JSON.stringify(spec, null, 2)}
`,
          markdown: renderProductSpecMarkdown(spec),
          sessionId,
          attempts: attempt
        };
      } catch (error) {
        lastError = error instanceof ArtifactValidationError ? error.errors.map((item) => `${item.instancePath || "/"} ${item.message ?? "is invalid"}`).join("\n") : error instanceof Error ? error.message : String(error);
        prompt = `Your previous ProductSpec was invalid. Return the complete corrected object, preserving valid decisions.

Validation errors:
${lastError}`;
      }
    }
    throw new PlannerExecutionError(lastError, maxAttempts);
  }
  async planAndSave(input, store) {
    const output = await this.plan(input);
    await store.saveJson("product-spec.json", "product-spec", output.spec);
    await store.saveText("product-spec.md", output.markdown);
    return output;
  }
};

export {
  createPlannerAgent,
  PlannerExecutionError,
  Planner
};
//# sourceMappingURL=chunk-CCPLXG66.js.map
