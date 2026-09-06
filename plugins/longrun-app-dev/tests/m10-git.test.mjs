import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitSafety } from "../runtime/dist/orchestrator/index.js";
const execute = promisify(execFile);
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "git-protection-"));
  const git = async (...args) => (await execute("git", args, { cwd: root })).stdout.trim();
  await git("init", "--initial-branch=main");
  await git("config", "user.name", "Test");
  await git("config", "user.email", "test@example.invalid");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "initial");
  return { root, git, initial: { branch: "main", headSha: await git("rev-parse", "HEAD"), hadUncommittedChanges: false } };
}
test("Git guard rejects stale snapshots and dirty files without changing them", async () => {
  const f = await fixture();
  const guard = new GitSafety(f.root);
  await assert.rejects(guard.begin({ ...f.initial, headSha: "0".repeat(40) }), /changed since start/);
  await writeFile(path.join(f.root, "user.txt"), "keep me");
  await assert.rejects(guard.begin(f.initial), /clean Git/);
  assert.equal(await readFile(path.join(f.root, "user.txt"), "utf8"), "keep me");
});

test("dedicated branch checkpoints preserve initial HEAD and exclude internal and credential files", async () => {
  const f = await fixture();
  const guard = new GitSafety(f.root); await guard.begin(f.initial);
  assert.equal(await guard.prepareRun("test-run", "codex/"), "codex/test-run");
  await writeFile(path.join(f.root, "app.js"), "export const app = true;");
  await writeFile(path.join(f.root, ".env"), "TOKEN=private");
  const first = await guard.checkpoint(1);
  assert.notEqual(first, f.initial.headSha);
  assert.equal(await f.git("rev-parse", "main"), f.initial.headSha);
  assert.equal(await f.git("ls-tree", "--name-only", "HEAD"), "app.js");
  assert.equal(await readFile(path.join(f.root, ".env"), "utf8"), "TOKEN=private");
  await guard.verify();
  const second = await guard.checkpoint(2);
  assert.notEqual(second, first);
  assert.equal(await f.git("rev-parse", "HEAD^"), first);
});
test("Git guard detects history or branch changes and preserves generated work", async () => {
  const f = await fixture();
  const guard = new GitSafety(f.root); await guard.begin(f.initial);
  await writeFile(path.join(f.root, "generated.txt"), "generated");
  await guard.verify();
  await f.git("switch", "-c", "unexpected");
  await assert.rejects(guard.verify(), /branch or HEAD changed/);
  assert.equal(await readFile(path.join(f.root, "generated.txt"), "utf8"), "generated");
});
