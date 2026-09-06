import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  require__,
  require_dist
} from "./chunk-2TRA5NZA.js";
import {
  redactArtifact,
  redactValue
} from "./chunk-5CGYLQMM.js";
import {
  __toESM
} from "./chunk-6PDSFK2S.js";

// runtime/src/artifacts/artifact-store.ts
import { readdir, readFile as readFile2 } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

// runtime/src/artifacts/atomic-write.ts
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
async function atomicWriteFile(path, content) {
  const directory = dirname(path);
  const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    const handle = await open(temporaryPath, "wx", 384);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => void 0);
    throw error;
  }
}

// runtime/src/artifacts/schema-validator.ts
var Ajv2020Module = __toESM(require__(), 1);
var addFormatsModule = __toESM(require_dist(), 1);
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
var ArtifactValidationError = class extends Error {
  constructor(schemaName, errors) {
    super(`Artifact does not match ${schemaName} schema`);
    this.schemaName = schemaName;
    this.errors = errors;
    this.name = "ArtifactValidationError";
  }
  schemaName;
  errors;
};
var SchemaValidator = class {
  #ajv;
  #validators = /* @__PURE__ */ new Map();
  #schemaRoot;
  constructor(schemaRoot = new URL("../../../schemas/", import.meta.url)) {
    this.#schemaRoot = schemaRoot;
    this.#ajv = new Ajv2020Module.Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
    const addFormats = addFormatsModule.default;
    addFormats(this.#ajv);
  }
  async validate(schemaName, value) {
    const validator = await this.#getValidator(schemaName);
    if (!validator(value)) {
      throw new ArtifactValidationError(
        schemaName,
        validator.errors === null || validator.errors === void 0 ? [] : [...validator.errors]
      );
    }
    return value;
  }
  async #getValidator(schemaName) {
    const existing = this.#validators.get(schemaName);
    if (existing !== void 0) {
      return existing;
    }
    const path = fileURLToPath(new URL(`${schemaName}.schema.json`, this.#schemaRoot));
    const schema = JSON.parse(await readFile(path, "utf8"));
    const validator = this.#ajv.compile(schema);
    this.#validators.set(schemaName, validator);
    return validator;
  }
};

// runtime/src/artifacts/artifact-store.ts
var ArtifactStore = class {
  constructor(runRoot, validator = new SchemaValidator()) {
    this.validator = validator;
    this.#runRoot = resolve(runRoot);
  }
  validator;
  #runRoot;
  async saveJson(relativePath, schemaName, value) {
    await this.validator.validate(schemaName, value);
    const redacted = redactValue(value);
    await this.validator.validate(schemaName, redacted);
    const path = this.#resolveArtifactPath(relativePath);
    await atomicWriteFile(path, `${JSON.stringify(redacted, null, 2)}
`);
  }
  async saveText(relativePath, value) {
    value = redactArtifact(value);
    const path = this.#resolveArtifactPath(relativePath);
    await atomicWriteFile(path, value.endsWith("\n") ? value : `${value}
`);
  }
  async readJson(relativePath, schemaName) {
    const path = this.#resolveArtifactPath(relativePath);
    const value = JSON.parse(await readFile2(path, "utf8"));
    return this.validator.validate(schemaName, value);
  }
  async list(relativeDirectory = ".") {
    const directory = this.#resolveArtifactPath(relativeDirectory);
    const results = [];
    await this.#walk(directory, results);
    return results.sort((left, right) => left.localeCompare(right));
  }
  async #walk(directory, results) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await this.#walk(path, results);
      } else if (entry.isFile()) {
        results.push(relative(this.#runRoot, path).split(sep).join("/"));
      }
    }
  }
  #resolveArtifactPath(relativePath) {
    if (relativePath.length === 0 || isAbsolute(relativePath)) {
      throw new TypeError(`Artifact path must be relative: ${relativePath}`);
    }
    const path = resolve(this.#runRoot, relativePath);
    const relation = relative(this.#runRoot, path);
    if (relation === ".." || relation.startsWith(`..${sep}`)) {
      throw new TypeError(`Artifact path escapes Run root: ${relativePath}`);
    }
    return path;
  }
};

// runtime/src/artifacts/run-layout.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { mkdir as mkdir2, realpath, lstat } from "node:fs/promises";
import { join as join2, resolve as resolve2 } from "node:path";
function generateRunId(now = /* @__PURE__ */ new Date(), uuid = randomUUID2()) {
  const timestamp = now.toISOString().replaceAll(/[-:]/gu, "").replace(".000", "");
  return `${timestamp}-${uuid}`;
}
async function initializeRunDirectory(projectRoot, runId = generateRunId()) {
  assertSafeRunId(runId);
  const resolvedProjectRoot = resolve2(projectRoot);
  const harnessRoot = join2(resolvedProjectRoot, ".longrun-app-dev");
  const runsRoot = join2(harnessRoot, "runs");
  const runRoot = join2(runsRoot, runId);
  const buildRoot = join2(runRoot, "build");
  const qaRoot = join2(runRoot, "qa");
  const evidenceRoot = join2(qaRoot, "evidence");
  const logsRoot = join2(runRoot, "logs");
  await mkdir2(runsRoot, { recursive: true });
  await mkdir2(runRoot, { recursive: false });
  await Promise.all([
    mkdir2(buildRoot),
    mkdir2(evidenceRoot, { recursive: true }),
    mkdir2(logsRoot)
  ]);
  return {
    runId,
    harnessRoot,
    runsRoot,
    runRoot,
    buildRoot,
    qaRoot,
    evidenceRoot,
    logsRoot,
    eventsPath: join2(logsRoot, "events.jsonl")
  };
}
function assertSafeRunId(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId) || runId === "." || runId === "..") {
    throw new TypeError(`Invalid Run ID: ${runId}`);
  }
}
async function openRunDirectory(projectRoot, runId) {
  assertSafeRunId(runId);
  const root = await realpath(projectRoot);
  const harnessRoot = join2(root, ".longrun-app-dev"), runsRoot = join2(harnessRoot, "runs"), runRoot = join2(runsRoot, runId);
  for (const directory of [harnessRoot, runsRoot, runRoot]) {
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== resolve2(directory)) throw new Error("Run directory must not redirect");
  }
  return {
    runId,
    harnessRoot,
    runsRoot,
    runRoot,
    buildRoot: join2(runRoot, "build"),
    qaRoot: join2(runRoot, "qa"),
    evidenceRoot: join2(runRoot, "qa/evidence"),
    logsRoot: join2(runRoot, "logs"),
    eventsPath: join2(runRoot, "logs/events.jsonl")
  };
}

export {
  atomicWriteFile,
  ArtifactValidationError,
  SchemaValidator,
  ArtifactStore,
  generateRunId,
  initializeRunDirectory,
  openRunDirectory
};
//# sourceMappingURL=chunk-ESBLYH7U.js.map
