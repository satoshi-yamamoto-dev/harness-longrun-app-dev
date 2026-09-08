import { seedProjectMcp } from "./helpers/project-mcp.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findPlaywrightCli } from "../runtime/dist/evaluator/index.js";
import { prepareRelease } from "../scripts/lib/release-package.mjs";
const execute = promisify(execFile);
test("MCP lookup accepts an explicit dependency root and does not fall back on a broken override", async () => {
  const previous = process.env.LONGRUN_PLAYWRIGHT_ROOT;
  try {
    process.env.LONGRUN_PLAYWRIGHT_ROOT = fileURLToPath(new URL("../", import.meta.url));
    assert.match(await findPlaywrightCli(tmpdir()), /cli\.js$/);
    process.env.LONGRUN_PLAYWRIGHT_ROOT = await mkdtemp(join(tmpdir(), "missing-mcp-"));
    await assert.rejects(findPlaywrightCli(fileURLToPath(new URL("../", import.meta.url))), /not installed/);
  } finally {
    if (previous === undefined) delete process.env.LONGRUN_PLAYWRIGHT_ROOT;
    else process.env.LONGRUN_PLAYWRIGHT_ROOT = previous;
  }
});
test("distributed files start without development dependencies and preserve init settings", async () => {
  const source = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "longrun-package-"));
  const plugin = join(root, "plugin");
  const app = join(root, "app");
  await mkdir(app);
  await seedProjectMcp(app);
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const candidate = await prepareRelease(source, plugin);
  assert.equal(candidate.published, false);
  assert.ok(candidate.files.some((file) => file.path.endsWith("THIRD_PARTY_NOTICES.txt")));
  await assert.rejects(prepareRelease(source, plugin), /EEXIST/);
  const run = (args) => execute(process.execPath, [join(plugin, "runtime/dist/cli.js"), ...args], { cwd: app, windowsHide: true });
  assert.equal((await run(["--version"])).stdout.trim(), manifest.version);
  assert.equal(JSON.parse((await run(["init"])).stdout).status, "initialized");
  const config = await readFile(join(app, ".longrun-app-dev/config.yaml"), "utf8");
  assert.equal(JSON.parse((await run(["init"])).stdout).status, "already-initialized");
  assert.equal(await readFile(join(app, ".longrun-app-dev/config.yaml"), "utf8"), config);
  assert.ok((await run(["status"])).stdout.trim());
  try { await run(["doctor"]); } catch (error) {
    assert.equal(error.code, 2);
    assert.equal(JSON.parse(error.stdout).status, "incomplete");
  }
});
