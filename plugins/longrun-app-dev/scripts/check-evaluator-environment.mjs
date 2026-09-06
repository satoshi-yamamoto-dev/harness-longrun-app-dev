import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPlaywrightCli, PLAYWRIGHT_MCP_VERSION } from "../runtime/dist/evaluator/index.js";

// Inventory only: no package install, browser download, account change, or model call.
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const checks = { playwright: { expectedVersion: PLAYWRIGHT_MCP_VERSION, status: "missing" }, browser: { channel: "msedge", status: "unverified" }, protocolAndLaunch: "not-tested" };
try { checks.playwright.cliPath = await findPlaywrightCli(pluginRoot); checks.playwright.status = "installed"; }
catch (error) { checks.playwright.reason = error instanceof Error ? error.message : String(error); }
const edgeCandidates = process.platform === "win32" ? [
  path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft/Edge/Application/msedge.exe"),
] : [];
for (const executable of edgeCandidates) {
  try { await access(executable); checks.browser = { channel: "msedge", status: "executable-found", executable }; break; }
  catch { /* try next known location */ }
}
console.log(JSON.stringify(checks, null, 2));
if (checks.playwright.status !== "installed" || checks.browser.status !== "executable-found") process.exitCode = 2;
