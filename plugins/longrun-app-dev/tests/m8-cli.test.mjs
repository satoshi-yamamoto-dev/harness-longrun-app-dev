import { seedProjectMcp } from "./helpers/project-mcp.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import test from "node:test";
const cli = fileURLToPath(new URL("../runtime/dist/cli.js", import.meta.url));
const execute = promisify(execFile);
test("CLI init creates a config once and preserves user settings", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "harness-init-"));
  await seedProjectMcp(cwd);
  const first = await execute(process.execPath, [cli, "init"], { cwd });
  assert.equal(JSON.parse(first.stdout).status, "initialized");
  const config = path.join(cwd, ".longrun-app-dev/config.yaml");
  assert.match(await readFile(config, "utf8"), /<model-id>/);
  await writeFile(config, "user changes\n");
  assert.equal(JSON.parse((await execute(process.execPath, [cli, "init"], { cwd })).stdout).status, "already-initialized");
  assert.equal(await readFile(config, "utf8"), "user changes\n");
});

test("CLI refuses dirty and detached Git state without modifying user files", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "harness-git-"));
  const git = (...args) => execute("git", args, { cwd });
  await git("init", "--initial-branch=main");
  await writeFile(path.join(cwd, ".gitignore"), ".longrun-app-dev/\n");
  await git("add", ".gitignore");
  await git("-c", "user.name=Harness Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture");
  await seedProjectMcp(cwd);
  await execute(process.execPath, [cli, "init"], { cwd });
  const config = path.join(cwd, ".longrun-app-dev/config.yaml");
  await writeFile(config, (await readFile(config, "utf8")).replaceAll("<model-id>", "mock"));
  await writeFile(path.join(cwd, "user.txt"), "preserve me");
  await assert.rejects(execute(process.execPath, [cli, "start", "build"], { cwd }), (e) => /clean Git working tree/.test(e.stderr));
  assert.equal(await readFile(path.join(cwd, "user.txt"), "utf8"), "preserve me");
  await git("add", "user.txt");
  await git("-c", "user.name=Harness Test", "-c", "user.email=test@example.invalid", "commit", "-m", "user fixture");
  await git("checkout", "--detach", "HEAD");
  await assert.rejects(execute(process.execPath, [cli, "start", "build"], { cwd }), (e) => /named Git branch/.test(e.stderr));
});
test("CLI rejects empty requests and unresolved model placeholders before model calls", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "harness-start-"));
  await seedProjectMcp(cwd);
  await execute(process.execPath, [cli, "init"], { cwd });
  await assert.rejects(execute(process.execPath, [cli, "start"], { cwd }), (e) => /requires an application request/.test(e.stderr));
  await assert.rejects(execute(process.execPath, [cli, "start", "Build a task list"], { cwd }), (e) => /model placeholders/.test(e.stderr));
});

test("CLI status is read-only and doctor reports incomplete configuration", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "harness-inspect-"));
  assert.deepEqual(JSON.parse((await execute(process.execPath, [cli, "status"], { cwd })).stdout), { runs: [] });
  await assert.rejects(execute(process.execPath, [cli, "status", "../outside"], { cwd }), (e) => /Invalid Run ID/.test(e.stderr));
  await assert.rejects(execute(process.execPath, [cli, "doctor"], { cwd }), (e) => {
    const result = JSON.parse(e.stdout);
    assert.equal(e.code, 2);
    assert.equal(result.checks.config.status, "missing-or-invalid");
    assert.equal(result.checks.authentication, "not-tested");
    assert.equal(result.checks.browserLaunch, "not-tested");
    return true;
  });
});
