import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketplacePath = join(repositoryRoot, ".claude-plugin", "marketplace.json");
const marketplace = await readJson(marketplacePath);

assertKebabCase(marketplace.name, "marketplace.name");
assertNonEmpty(marketplace.owner?.name, "marketplace.owner.name");
assert(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0, "marketplace.plugins must not be empty");

const pluginNames = new Set();
for (const entry of marketplace.plugins) {
  assertKebabCase(entry.name, "plugin.name");
  assert(!pluginNames.has(entry.name), `duplicate plugin name: ${entry.name}`);
  pluginNames.add(entry.name);
  assert(typeof entry.source === "string" && entry.source.startsWith("./"), `${entry.name}.source must be a relative ./ path`);
  assert(!entry.source.split(/[\\/]/u).includes(".."), `${entry.name}.source must not contain ..`);

  const pluginRoot = resolve(repositoryRoot, entry.source);
  assert(isWithin(repositoryRoot, pluginRoot), `${entry.name}.source escapes the repository`);
  await assertDirectory(pluginRoot);

  const manifest = await readJson(join(pluginRoot, ".claude-plugin", "plugin.json"));
  assert(manifest.name === entry.name, `${entry.name}: manifest name mismatch`);
  assert(manifest.version === entry.version, `${entry.name}: manifest version mismatch`);
  assert(manifest.repository === entry.repository, `${entry.name}: repository mismatch`);
  assert(manifest.license === entry.license, `${entry.name}: license mismatch`);

  for (const directory of ["agents", "bin", "prompts", "rubrics", "runtime", "schemas", "skills"]) {
    await assertDirectory(join(pluginRoot, directory));
  }

  await assertFile(join(pluginRoot, "bin", "longrun-app-dev"));
  await assertFile(join(pluginRoot, "runtime", "dist", "cli.js"));
  await validateSkill(join(pluginRoot, "skills", "init", "SKILL.md"), "init");
  await validateSkill(join(pluginRoot, "skills", "start", "SKILL.md"), "start");
}

process.stdout.write(`Validated ${marketplace.plugins.length} plugin(s) in ${marketplace.name}.\n`);

async function validateSkill(path, expectedName) {
  const content = await readFile(path, "utf8");
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
  assert(frontmatter !== undefined, `${path}: missing YAML frontmatter`);
  assert(new RegExp(`^name:\\s*${expectedName}$`, "mu").test(frontmatter), `${path}: invalid name`);
  assert(/^description:\s*\S.+$/mu.test(frontmatter), `${path}: missing description`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function assertDirectory(path) {
  assert((await stat(path)).isDirectory(), `missing directory: ${path}`);
}

async function assertFile(path) {
  assert((await stat(path)).isFile(), `missing file: ${path}`);
}

function assertKebabCase(value, field) {
  assert(typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value), `${field} must be kebab-case`);
}

function assertNonEmpty(value, field) {
  assert(typeof value === "string" && value.trim().length > 0, `${field} must not be empty`);
}

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
