import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createServer } from "node:http";
import { PlaywrightEvidence } from "../runtime/dist/evaluator/index.js";

test("browser actions and screenshots are saved with Run-relative evidence paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qa-evidence-"));
  const calls = [];
  const tools = { async call(name, args) {
    calls.push({ name, args });
    if (name === "browser_take_screenshot") await writeFile(args.filename, "mock screenshot");
    return { content: [{ type: "text", text: 'button "Add" [ref=e2]' }] };
  } };
  const evidence = new PlaywrightEvidence(tools, root, path.join(root, "qa/evidence"));
  await evidence.navigate("http://localhost:3000", "navigate.txt");
  const snap = await evidence.snapshot("snapshot.txt");
  await evidence.type("e1", "task", "type.txt");
  await evidence.click("e2", "click.txt");
  const image = await evidence.screenshot("page.png");
  assert.equal(image.path, "qa/evidence/page.png");
  assert.match(await readFile(path.join(root, snap.evidence.path), "utf8"), /Add/);
  assert.equal(calls[3].args.target, "e2");
  assert.ok(path.isAbsolute(calls[4].args.filename));
});

test("API observations retain real status/body and storage inspection targets declared keys", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qa-layers-"));
  const server = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"items":["task"]}'); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let expression;
  const tools = { async call(name, args) { assert.equal(name, "browser_evaluate"); expression = args.function; return { content: [{ type: "text", text: '{"tasks":"[]"}' }] }; } };
  try {
    const evidence = new PlaywrightEvidence(tools, root, path.join(root, "qa/evidence"));
    const api = await evidence.readApi(url, "/api/items", "api.json");
    assert.equal(api.status, 200);
    assert.deepEqual(JSON.parse(api.body), { items: ["task"] });
    await assert.rejects(evidence.readApi(url, "https://example.invalid", "invalid.json"), /origin/);
    await evidence.readLocalStorage(url, ["tasks"], "storage.txt");
    assert.match(expression, /localStorage.getItem/);
    assert.match(expression, /Wrong application origin/);
    assert.doesNotMatch(expression, /setItem/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("evidence rejects escaping paths, MCP errors and screenshots that were not saved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qa-evidence-invalid-"));
  assert.throws(() => new PlaywrightEvidence({}, root, path.dirname(root)), /inside/);
  const evidence = new PlaywrightEvidence({ async call() { return { content: [] }; } }, root, path.join(root, "qa/evidence"));
  await assert.rejects(evidence.saveText("snapshot", "../escape.txt", "x"), /basename/);
  await assert.rejects(evidence.screenshot("missing.png"), /ENOENT/);
  const broken = new PlaywrightEvidence({ async call() { return { isError: true, content: [{ type: "text", text: "browser unavailable" }] }; } }, root, path.join(root, "qa/evidence"));
  await assert.rejects(broken.snapshot("failed.txt"), /browser unavailable/);
});
