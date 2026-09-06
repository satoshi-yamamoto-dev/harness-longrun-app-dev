import { writeFile, safeConsole } from "./lib/safe-output.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlaywrightServer, findPlaywrightCli, PlaywrightEvidence } from "../runtime/dist/evaluator/index.js";
import { McpClient } from "./lib/mcp-client.mjs";
import { startQaFixture } from "../tests/fixtures/qa-web-app/server.mjs";
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const checks = path.resolve(pluginRoot, "../../.longrun-app-dev/qa-fixture-checks");
await mkdir(checks, { recursive: true });
for (const broken of [false, true]) {
  const root = await mkdtemp(path.join(checks, broken ? "broken-" : "working-"));
  const evidenceRoot = path.join(root, "qa/evidence");
  await mkdir(evidenceRoot, { recursive: true });
  const app = await startQaFixture(broken);
  const client = new McpClient(createPlaywrightServer({ cliPath: await findPlaywrightCli(pluginRoot), evidenceRoot, browser: "msedge" }));
  const evidence = new PlaywrightEvidence(client, root, evidenceRoot);
  const summary = { root, broken, status: "started" };
  try {
    await client.initialize();
    await evidence.navigate(app.url, "navigate.txt");
    let snap = await evidence.snapshot("initial.txt");
    const input = /textbox[^\n]*\[ref=([^\]]+)\]/u.exec(snap.text)?.[1]; assert.ok(input);
    await evidence.type(input, "Review notes", "type.txt");
    snap = await evidence.snapshot("typed.txt");
    const add = /button "Add task" \[ref=([^\]]+)\]/u.exec(snap.text)?.[1]; assert.ok(add);
    await evidence.click(add, "add.txt");
    snap = await evidence.snapshot("added.txt"); assert.match(snap.text, /Review notes/);
    const complete = /button "Complete" \[ref=([^\]]+)\]/u.exec(snap.text)?.[1]; assert.ok(complete);
    await evidence.click(complete, "complete.txt");
    snap = await evidence.snapshot("completion.txt");
    assert.equal(snap.text.includes('button "Completed"'), !broken);
    await evidence.screenshot("desktop.png");
    await evidence.readLocalStorage(app.url, ["task-desk"], "storage.txt");
    assert.equal((await evidence.readApi(app.url, "/api/health", "api.json")).status, 200);
    await evidence.navigate(app.url, "reload.txt");
    snap = await evidence.snapshot("reloaded.txt");
    assert.equal(snap.text.includes("Review notes"), !broken);
    summary.status = "passed";
  } catch (error) { summary.status = "failed"; summary.error = error.message; process.exitCode = 1; }
  finally { await client.close(); await app.close(); await writeFile(path.join(root, "check.json"), JSON.stringify(summary, null, 2)); safeConsole.log(JSON.stringify(summary)); }
}
