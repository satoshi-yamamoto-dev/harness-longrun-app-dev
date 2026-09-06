import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function inside(root, file) {
  const part = relative(root, file);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}
export async function prepareRelease(source, destination) {
  const root = await realpath(source);
  const output = resolve(destination);
  if (inside(root, output)) throw new Error("Release destination must be outside the plugin source");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const build = JSON.parse(await readFile(join(root, "runtime/dist/build-manifest.json"), "utf8"));
  if (build.schemaVersion !== 1 || !Array.isArray(build.files) || !build.files.length) throw new Error("Invalid build manifest");
  const paths = new Set();
  async function add(file) {
    if (!inside(root, file)) throw new Error("Distribution entry escapes plugin source");
    const info = await lstat(file);
    if (info.isSymbolicLink() || !inside(root, await realpath(file))) throw new Error("Distribution must not contain redirected files");
    if (info.isDirectory()) { for (const name of await readdir(file)) await add(join(file, name)); }
    else if (info.isFile()) paths.add(relative(root, file).split(sep).join("/"));
    else throw new Error("Distribution contains a nonregular file");
  }
  for (const entry of [...manifest.files, "package.json"]) {
    if (entry === "runtime/dist/") continue;
    if (typeof entry !== "string" || isAbsolute(entry)) throw new Error("Invalid distribution entry");
    await add(resolve(root, entry));
  }
  for (const file of build.files) {
    if (typeof file.path !== "string" || isAbsolute(file.path)) throw new Error("Invalid build entry");
    const absolute = resolve(root, "runtime/dist", file.path);
    if (!inside(join(root, "runtime/dist"), absolute)) throw new Error("Build entry escapes runtime dist");
    await add(absolute);
    const bytes = await readFile(absolute);
    if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Build output changed; rebuild before packaging");
  }
  await add(join(root, "runtime/dist/build-manifest.json"));
  const inventory = [];
  for (const file of [...paths].sort()) {
    if (/(?:^|\/)(?:\.env(?:\.|$)|\.git\/|\.longrun-app-dev\/|node_modules\/)|\.(?:pem|key|p12)$/iu.test(file)) throw new Error("Credential or development file in distribution");
    const bytes = await readFile(join(root, file));
    const text = bytes.toString("utf8");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]|\b(?:sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/u.test(text)) throw new Error(`Possible secret in distribution file: ${file}`);
    inventory.push({ path: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  // Exclusive directory creation prevents overwriting an existing candidate.
  await mkdir(output);
  for (const file of inventory) {
    const target = join(output, file.path);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(root, file.path), target, { errorOnExist: true, force: false });
    const copied = await readFile(target);
    if (createHash("sha256").update(copied).digest("hex") !== file.sha256) throw new Error("Source changed during packaging; candidate is incomplete");
  }
  const report = { schemaVersion: 1, name: manifest.name, version: manifest.version, status: "local-candidate", published: false, files: inventory };
  await writeFile(join(output, "release-manifest.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return report;
}
