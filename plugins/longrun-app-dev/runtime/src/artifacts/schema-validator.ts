import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as Ajv2020Module from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import * as addFormatsModule from "ajv-formats";

export type SchemaName = "config" | "state" | "product-spec" | "build-report" | "qa-result";

export class ArtifactValidationError extends Error {
  public constructor(
    public readonly schemaName: SchemaName,
    public readonly errors: readonly ErrorObject[],
  ) {
    super(`Artifact does not match ${schemaName} schema`);
    this.name = "ArtifactValidationError";
  }
}

export class SchemaValidator {
  readonly #ajv: Ajv2020Module.Ajv2020;
  readonly #validators = new Map<SchemaName, ValidateFunction>();
  readonly #schemaRoot: URL;

  public constructor(schemaRoot: URL = new URL("../../../schemas/", import.meta.url)) {
    this.#schemaRoot = schemaRoot;
    this.#ajv = new Ajv2020Module.Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
    const addFormats = addFormatsModule.default as unknown as (instance: Ajv2020Module.Ajv2020) => void;
    addFormats(this.#ajv);
  }

  public async validate<T>(schemaName: SchemaName, value: unknown): Promise<T> {
    const validator = await this.#getValidator(schemaName);
    if (!validator(value)) {
      throw new ArtifactValidationError(
        schemaName,
        validator.errors === null || validator.errors === undefined ? [] : [...validator.errors],
      );
    }
    return value as T;
  }

  async #getValidator(schemaName: SchemaName): Promise<ValidateFunction> {
    const existing = this.#validators.get(schemaName);
    if (existing !== undefined) {
      return existing;
    }

    const path = fileURLToPath(new URL(`${schemaName}.schema.json`, this.#schemaRoot));
    const schema = JSON.parse(await readFile(path, "utf8")) as AnySchema;
    const validator = this.#ajv.compile(schema);
    this.#validators.set(schemaName, validator);
    return validator;
  }
}
