import { writeFile, safeConsole } from "./lib/safe-output.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlaywrightServer, findPlaywrightCli, PLAYWRIGHT_TOOLS } from "../runtime/dist/evaluator/index.js";
import { McpClient, resultText } from "./lib/mcp-client.mjs";

const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(pluginRoot, "../..");
const checksRoot = path.join(root, ".longrun-app-dev", "playwright-checks");
await mkdir(checksRoot, { recursive: true });
const evidenceRoot = await mkdtemp(path.join(checksRoot, "m7-"));
const app = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><html><title>MCP connection check</title><h1>MCP connection check</h1><button onclick="document.querySelector(\'output\').textContent=\'Count: 1\'">Increment</button><output>Count: 0</output></html>');
});
await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
const appUrl = `http://127.0.0.1:${app.address().port}`;
const summary = { status: "started", evidenceRoot, appUrl, browser: "msedge", node: process.version, platform: process.platform, arch: process.arch };
let client;
try {
  client = new McpClient(createPlaywrightServer({ cliPath: await findPlaywrightCli(pluginRoot), evidenceRoot, browser: "msedge" }));
  summary.server = await client.initialize();
  const tools = await client.request("tools/list");
  await writeFile(path.join(evidenceRoot, "tools.json"), JSON.stringify(tools, null, 2));
  for (const name of PLAYWRIGHT_TOOLS) assert.ok(tools.tools.some((tool) => `mcp__playwright__${tool.name}` === name), `Missing tool ${name}`);
  const nav = await client.call("browser_navigate", { url: appUrl });
  await writeFile(path.join(evidenceRoot, "navigate.txt"), resultText(nav));
  const snapshot = resultText(await client.call("browser_snapshot"));
  await writeFile(path.join(evidenceRoot, "before.txt"), snapshot);
  const ref = /button "Increment" \[ref=([^\]]+)\]/u.exec(snapshot)?.[1];
  assert.ok(ref, "Increment button reference missing from live snapshot");
  await client.call("browser_click", { element: "Increment button", target: ref });
  const after = resultText(await client.call("browser_snapshot"));
  await writeFile(path.join(evidenceRoot, "after.txt"), after);
  assert.match(after, /Count: 1/u);
  const screenshot = await client.call("browser_take_screenshot", { type: "png", filename: path.join(evidenceRoot, "smoke.png"), fullPage: true, scale: "css" });
  await writeFile(path.join(evidenceRoot, "screenshot.txt"), resultText(screenshot));
  assert.ok((await stat(path.join(evidenceRoot, "smoke.png"))).size > 0);
  summary.userAgent = resultText(await client.call("browser_evaluate", { function: "() => navigator.userAgent" }));
  summary.status = "passed";
} catch (error) { summary.status = "failed"; summary.error = error.message; process.exitCode = 1; }
finally {
  if (client) { await client.close(); summary.stderr = client.stderr; }
  await new Promise((resolve) => app.close(resolve));
  await writeFile(path.join(evidenceRoot, "check.json"), JSON.stringify(summary, null, 2) + "\n");
  safeConsole.log(JSON.stringify(summary, null, 2));
}
