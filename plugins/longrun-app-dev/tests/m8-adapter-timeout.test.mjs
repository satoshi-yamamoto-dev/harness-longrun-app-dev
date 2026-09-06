import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebProjectAdapter } from "../runtime/dist/adapters/index.js";

for (const cancellation of ["deadline", "manual"]) test(`adapter ${cancellation} terminates the running script process`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "adapter-deadline-"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "node hang.cjs" } }));
  await writeFile(path.join(root, "hang.cjs"), 'require("node:fs").writeFileSync("pid.txt", String(process.pid)); setInterval(() => {}, 1000);');
  const controller = new AbortController();
  // Allow cold npm/Volta startup in CI before testing descendant collection.
  const timer = cancellation === "manual" ? setTimeout(() => controller.abort(), 15000) : undefined;
  let result;
  try { result = await new WebProjectAdapter(root).build({ timeoutMs: cancellation === "manual" ? 30000 : 15000, signal: controller.signal }); }
  finally { clearTimeout(timer); }
  assert.equal(result.status, "failed");
  assert.match(result.stderr, cancellation === "manual" ? /stopped/ : /timed out/);
  const pid = Number(await readFile(path.join(root, "pid.txt"), "utf8"));
  // taskkill may finish collecting descendants just after the shell exits.
  const deadline = Date.now() + 3000;
  let alive = true;
  while (alive && Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; else throw error; }
    if (alive) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(alive, false, "timed-out build must not leave its process running");
});
