import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireRunLock, recoverRunLock } from "../runtime/dist/orchestrator/index.js";
import { spawn } from "node:child_process";

test("concurrent lock acquisition grants exactly one owner and allows reuse after release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "run-lock-"));
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => acquireRunLock(root)));
  const owners = results.filter((r) => r.status === "fulfilled");
  assert.equal(owners.length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 5);
  await owners[0].value.release();
  await owners[0].value.release();
  const next = await acquireRunLock(root); await next.release();
});

test("stale or changed owner is never silently removed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "run-lock-owner-"));
  const lock = await acquireRunLock(root);
  const other = { token: "other", pid: 0, hostname: "other-host" };
  await writeFile(lock.path, JSON.stringify(other));
  await assert.rejects(lock.release(), /ownership changed/);
  await assert.rejects(acquireRunLock(root), /Run lock exists/);
  assert.deepEqual(JSON.parse(await readFile(lock.path, "utf8")), other);
});

test("explicit recovery refuses a live owner and archives a confirmed dead owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "run-recover-"));
  const lock = await acquireRunLock(root);
  await assert.rejects(recoverRunLock(root), /still alive/);
  const child = spawn(process.execPath, ["-e", ""], { windowsHide: true });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  const owner = JSON.parse(await readFile(lock.path, "utf8"));
  owner.pid = child.pid;
  await writeFile(lock.path, JSON.stringify(owner));
  const archive = await recoverRunLock(root);
  assert.deepEqual(JSON.parse(await readFile(archive, "utf8")), owner);
  const next = await acquireRunLock(root); await next.release();
});
