import { readFile } from "node:fs/promises";

import { ArtifactStore, ArtifactValidationError, SchemaValidator } from "../artifacts/index.js";
import type { ProductSpec } from "../contracts/index.js";
import type { AgentDefinition, SessionLimits, SessionRunner } from "../sessions/index.js";
import { extractProductSpecJson, renderProductSpecMarkdown, validateProductSpecReferences } from "./product-spec-format.js";

export interface PlannerRequest {
  readonly request: string;
  readonly repairAttempts?: number;
}

export interface PlannerOutput {
  readonly spec: ProductSpec;
  readonly json: string;
  readonly markdown: string;
  readonly sessionId: string;
  readonly attempts: number;
}

export class PlannerExecutionError extends Error {
  constructor(message: string, readonly attempts: number) {
    super(message);
    this.name = "PlannerExecutionError";
  }
}

export class Planner {
  constructor(
    private readonly runner: SessionRunner,
    private readonly agent: AgentDefinition,
    private readonly limits: SessionLimits,
    private readonly validator = new SchemaValidator(),
  ) {
    if (agent.role !== "planner") throw new Error("Planner requires a planner agent");
  }

  async plan(input: PlannerRequest): Promise<PlannerOutput> {
    if (!input.request.trim()) throw new TypeError("Planner request must not be empty");
    const schema = await readFile(new URL("../../../schemas/product-spec.schema.json", import.meta.url), "utf8");
    const maxAttempts = 1 + (input.repairAttempts ?? 2);
    let prompt = `Create the complete ProductSpec for this request:\n\n${input.request.trim()}\n\nProductSpec JSON Schema:\n${schema}`;
    let sessionId: string | undefined;
    let lastError = "Planner did not return a valid specification";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.runner.run({
        agent: this.agent,
        prompt,
        limits: this.limits,
        ...(sessionId === undefined ? {} : { resumeSessionId: sessionId }),
      });
      if (result.sessionId !== null) sessionId = result.sessionId;
      if (result.status !== "completed") {
        const details = result.errorMessages.length > 0 ? `: ${result.errorMessages.join("; ")}` : "";
        throw new PlannerExecutionError(`Planner session ended with ${result.terminationReason}${details}`, attempt);
      }
      try {
        const candidate = extractProductSpecJson(result.output);
        const spec = await this.validator.validate<ProductSpec>("product-spec", candidate);
        const referenceErrors = validateProductSpecReferences(spec);
        if (referenceErrors.length > 0) throw new Error(referenceErrors.join("\n"));
        if (sessionId === undefined) throw new Error("Planner SDK result did not contain a session ID");
        return {
          spec,
          json: `${JSON.stringify(spec, null, 2)}\n`,
          markdown: renderProductSpecMarkdown(spec),
          sessionId,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error instanceof ArtifactValidationError
          ? error.errors.map((item) => `${item.instancePath || "/"} ${item.message ?? "is invalid"}`).join("\n")
          : error instanceof Error ? error.message : String(error);
        prompt = `Your previous ProductSpec was invalid. Return the complete corrected object, preserving valid decisions.\n\nValidation errors:\n${lastError}`;
      }
    }
    throw new PlannerExecutionError(lastError, maxAttempts);
  }

  async planAndSave(input: PlannerRequest, store: ArtifactStore): Promise<PlannerOutput> {
    const output = await this.plan(input);
    await store.saveJson("product-spec.json", "product-spec", output.spec);
    await store.saveText("product-spec.md", output.markdown);
    return output;
  }
}
