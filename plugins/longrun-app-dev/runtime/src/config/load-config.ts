import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as Ajv2020Module from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import * as addFormatsModule from "ajv-formats";
import { parse } from "yaml";
import type { HarnessConfig } from "../contracts/config.js";

const DEFAULTS = {
  evaluation: { mode: "required" },
  limits: {
    maxQaRounds: 3,
    maxDurationMinutes: 240,
    maxCostUsd: 150,
    maxConsecutiveErrors: 3,
  },
  quality: {
    thresholds: {
      productDepth: 8,
      functionality: 8,
      visualDesign: 8,
      codeQuality: 8,
    },
  },
  adapter: { type: "auto" },
  git: {
    workBranchPrefix: "longrun-app-dev/",
    commitEachBuildRound: true,
    allowPush: false,
  },
  logging: {
    saveFullPrompts: false,
    saveFullResponses: false,
  },
} as const;

let validatorPromise: Promise<ValidateFunction<HarnessConfig>> | undefined;

export class ConfigValidationError extends Error {
  public constructor(
    message: string,
    public readonly errors: readonly ErrorObject[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ConfigValidationError";
  }
}

export async function loadConfig(path: string): Promise<HarnessConfig> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigValidationError(`Unable to read config: ${path}`, [], { cause: error });
  }

  let input: unknown;
  try {
    input = parse(source, { uniqueKeys: true });
  } catch (error) {
    throw new ConfigValidationError(`Invalid YAML in config: ${path}`, [], { cause: error });
  }

  const config = applyConfigDefaults(input);
  const validate = await getConfigValidator();
  if (!validate(config)) {
    throw new ConfigValidationError(
      `Config does not match schema: ${path}`,
      validate.errors === null || validate.errors === undefined ? [] : [...validate.errors],
    );
  }

  return config;
}

export function applyConfigDefaults(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  return {
    schemaVersion: input.schemaVersion ?? 1,
    models: input.models,
    evaluation: mergeRecord(DEFAULTS.evaluation, input.evaluation),
    limits: mergeRecord(DEFAULTS.limits, input.limits),
    quality: {
      ...DEFAULTS.quality,
      ...(isRecord(input.quality) ? input.quality : {}),
      thresholds: mergeRecord(
        DEFAULTS.quality.thresholds,
        isRecord(input.quality) ? input.quality.thresholds : undefined,
      ),
    },
    adapter: mergeRecord(DEFAULTS.adapter, input.adapter),
    git: mergeRecord(DEFAULTS.git, input.git),
    logging: mergeRecord(DEFAULTS.logging, input.logging),
  };
}

async function getConfigValidator(): Promise<ValidateFunction<HarnessConfig>> {
  validatorPromise ??= createConfigValidator();
  return validatorPromise;
}

async function createConfigValidator(): Promise<ValidateFunction<HarnessConfig>> {
  const schemaPath = fileURLToPath(new URL("../../../schemas/config.schema.json", import.meta.url));
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as AnySchema;
  const ajv = new Ajv2020Module.Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
  const addFormats = addFormatsModule.default as unknown as (instance: Ajv2020Module.Ajv2020) => void;
  addFormats(ajv);
  return ajv.compile<HarnessConfig>(schema);
}

function mergeRecord(defaults: Readonly<Record<string, unknown>>, value: unknown): Record<string, unknown> {
  return { ...defaults, ...(isRecord(value) ? value : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
