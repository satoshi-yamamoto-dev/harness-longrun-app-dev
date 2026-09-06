import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { SchemaValidator, type SchemaName } from "./schema-validator.js";
import { redactValue, redactArtifact } from "../logging/redaction.js";

export class ArtifactStore {
  readonly #runRoot: string;

  public constructor(
    runRoot: string,
    private readonly validator: SchemaValidator = new SchemaValidator(),
  ) {
    this.#runRoot = resolve(runRoot);
  }

  public async saveJson<T>(relativePath: string, schemaName: SchemaName, value: T): Promise<void> {
    await this.validator.validate<T>(schemaName, value);
    const redacted = redactValue(value);
    await this.validator.validate(schemaName, redacted);
    const path = this.#resolveArtifactPath(relativePath);
    await atomicWriteFile(path, `${JSON.stringify(redacted, null, 2)}\n`);
  }

  public async saveText(relativePath: string, value: string): Promise<void> {
    value = redactArtifact(value);
    const path = this.#resolveArtifactPath(relativePath);
    await atomicWriteFile(path, value.endsWith("\n") ? value : `${value}\n`);
  }

  public async readJson<T>(relativePath: string, schemaName: SchemaName): Promise<T> {
    const path = this.#resolveArtifactPath(relativePath);
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return this.validator.validate<T>(schemaName, value);
  }

  public async list(relativeDirectory = "."): Promise<readonly string[]> {
    const directory = this.#resolveArtifactPath(relativeDirectory);
    const results: string[] = [];
    await this.#walk(directory, results);
    return results.sort((left, right) => left.localeCompare(right));
  }

  async #walk(directory: string, results: string[]): Promise<void> {
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

  #resolveArtifactPath(relativePath: string): string {
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
}
