import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(pluginRoot, "schemas");
const schemaNames = (await readdir(schemaDirectory)).filter((name) => name.endsWith(".schema.json")).sort();
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
addFormats(ajv);

for (const schemaName of schemaNames) {
  const schema = JSON.parse(await readFile(join(schemaDirectory, schemaName), "utf8"));
  ajv.compile(schema);
}

process.stdout.write(`Compiled ${schemaNames.length} JSON Schema(s).\n`);
