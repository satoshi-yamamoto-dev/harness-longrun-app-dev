import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";
import { prepareRelease } from "../scripts/lib/release-package.mjs";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-check-"));
  const source = join(root, "plugin");
  await mkdir(join(source, "runtime/dist"), { recursive: true });
  const bytes = "export const version = 1;\n";
  await writeFile(join(source, "package.json"), JSON.stringify({ name: "fixture", version: "1", files: ["runtime/dist/"] }));
  await writeFile(join(source, "runtime/dist/cli.js"), bytes);
  await writeFile(join(source, "runtime/dist/build-manifest.json"), JSON.stringify({ schemaVersion: 1, files: [{ path: "cli.js", bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") }] }));
  return { source, destination: join(root, "candidate") };
}
test("release excludes stale build files and matches recorded bytes", async () => {
  const { source, destination } = await fixture();
  await writeFile(join(source, "runtime/dist/obsolete.js"), "stale");
  const report = await prepareRelease(source, destination);
  assert.ok(!report.files.some((file) => file.path.includes("obsolete")));
  assert.equal(report.status, "local-candidate");
  assert.ok(await readFile(join(destination, "release-manifest.json"), "utf8"));
});
test("release rejects modified output before creating a candidate", async () => {
  const { source, destination } = await fixture();
  await writeFile(join(source, "runtime/dist/cli.js"), "changed");
  await assert.rejects(prepareRelease(source, destination), /changed/);
});
test("release rejects credential files and paths outside the source", async () => {
  const { source, destination } = await fixture();
  await writeFile(join(source, ".env"), "PASSWORD=fixture");
  await writeFile(join(source, "package.json"), JSON.stringify({ files: [".env", "runtime/dist/"] }));
  await assert.rejects(prepareRelease(source, destination), /Credential/);
  await writeFile(join(source, "package.json"), JSON.stringify({ files: ["../outside"] }));
  await assert.rejects(prepareRelease(source, destination), /escapes/);
});
