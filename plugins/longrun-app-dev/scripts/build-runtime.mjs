import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, readdir, realpath, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { relative, sep } from "node:path";
import { build } from "esbuild";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(pluginRoot, "runtime", "src");

const outputRoot = join(pluginRoot, "runtime", "dist");
const result = await build({
  absWorkingDir: pluginRoot,
  entryPoints: {
    cli: join(sourceRoot, "cli.ts"),
    "adapters/index": join(sourceRoot, "adapters", "index.ts"),
    "artifacts/index": join(sourceRoot, "artifacts", "index.ts"),
    "config/index": join(sourceRoot, "config", "index.ts"),
    "contracts/index": join(sourceRoot, "contracts", "index.ts"),
    "logging/index": join(sourceRoot, "logging", "index.ts"),
    "planner/index": join(sourceRoot, "planner", "index.ts"),
    "generator/index": join(sourceRoot, "generator", "index.ts"),
    "evaluator/index": join(sourceRoot, "evaluator", "index.ts"),
    "orchestrator/index": join(sourceRoot, "orchestrator", "index.ts"),
    "sessions/index": join(sourceRoot, "sessions", "index.ts"),
    "state/index": join(sourceRoot, "state", "index.ts"),
  },
  bundle: true,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  chunkNames: "chunks/[name]-[hash]",
  entryNames: "[dir]/[name]",
  format: "esm",
  legalComments: "eof",
  metafile: true,
  outdir: outputRoot,
  packages: "bundle",
  platform: "node",
  sourcemap: true,
  splitting: true,
  target: "node24",
});

const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules")) continue;
  let directory = dirname(resolve(pluginRoot, input));
  while (dirname(directory) !== directory) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (manifest.name && manifest.version) {
        const id = `${manifest.name}@${manifest.version}`;
        if (!packages.has(id)) {
          const files = (await readdir(directory, { withFileTypes: true })).filter((file) => file.isFile() && /^(license|licence|copying|notice)(?:\.|$)/iu.test(file.name));
          const licenses = await Promise.all(files.map(async (file) => `${file.name}\n${await readFile(join(directory, file.name), "utf8")}`));
          packages.set(id, { id, license: manifest.license ?? "See upstream terms", text: licenses.join("\n\n") || "No top-level license text found; review upstream before distribution." });
        }
        break;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    directory = dirname(directory);
  }
}
const noticePath = join(outputRoot, "THIRD_PARTY_NOTICES.txt");
await writeFile(noticePath, [...packages.values()].sort((a, b) => a.id.localeCompare(b.id)).map((item) => `${item.id}\nLicense: ${item.license}\n\n${item.text}`).join("\n\n--------------------\n\n") + "\n");
const currentOutputs = new Set([...Object.keys(result.metafile.outputs).map((file) => resolve(pluginRoot, file)), noticePath]);
// dist is generated output. Remove only obsolete JS and source maps after a
// successful build; never follow a redirected directory or remove other files.
async function pruneGenerated(directory) {
  if (await realpath(directory) !== directory) throw new Error("Build output must not redirect");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await pruneGenerated(file);
    else if (entry.isFile() && /\.js(?:\.map)?$/u.test(entry.name) && !currentOutputs.has(file)) await unlink(file);
    else if (entry.isSymbolicLink()) throw new Error("Build output must not contain symlinks");
  }
}
await pruneGenerated(outputRoot);
const files = await Promise.all([...currentOutputs].sort().map(async (file) => {
  const content = await readFile(file);
  return { path: relative(outputRoot, file).split(sep).join("/"), bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") };
}));
await writeFile(join(outputRoot, "build-manifest.json"), JSON.stringify({ schemaVersion: 1, files, packages: [...packages.values()].map(({ id, license }) => ({ id, license })) }, null, 2) + "\n");
