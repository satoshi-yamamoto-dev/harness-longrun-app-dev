import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { StdioMcpServer } from "../sessions/index.js";

export const PLAYWRIGHT_MCP_VERSION = "0.0.80";
export const PLAYWRIGHT_TOOLS = [
  "browser_navigate", "browser_snapshot", "browser_click", "browser_type",
  "browser_fill_form", "browser_press_key", "browser_select_option", "browser_wait_for",
  "browser_take_screenshot", "browser_evaluate", "browser_network_requests",
  "browser_console_messages", "browser_resize", "browser_close",
].map((tool) => `mcp__playwright__${tool}`);

export interface PlaywrightConnection {
  readonly cliPath: string;
  readonly evidenceRoot: string;
  readonly browser: "msedge" | "chrome" | "chromium" | "firefox" | "webkit";
}

export function createPlaywrightServer(input: PlaywrightConnection): StdioMcpServer {
  if (!isAbsolute(input.cliPath) || !isAbsolute(input.evidenceRoot)) throw new TypeError("MCP CLI and evidence paths must be absolute");
  if (!["msedge", "chrome", "chromium", "firefox", "webkit"].includes(input.browser)) throw new TypeError("Unsupported Playwright browser");
  return {
    type: "stdio", command: process.execPath,
    args: [input.cliPath, "--headless", "--isolated", "--browser", input.browser, "--output-dir", input.evidenceRoot],
  };
}

// Resolve an already-installed package. This never invokes npx or downloads a browser.
export async function findPlaywrightCli(projectRoot: string): Promise<string> {
  const dependencyRoot = process.env.LONGRUN_PLAYWRIGHT_ROOT || projectRoot;
  const require = createRequire(join(resolve(dependencyRoot), "package.json"));
  let manifestPath: string;
  try { manifestPath = require.resolve("@playwright/mcp/package.json"); }
  catch { throw new Error(`Playwright MCP is not installed in ${dependencyRoot}. Required version: ${PLAYWRIGHT_MCP_VERSION}`); }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: string };
  if (manifest.version !== PLAYWRIGHT_MCP_VERSION) throw new Error(`Expected Playwright MCP ${PLAYWRIGHT_MCP_VERSION}, found ${manifest.version}`);
  const cliPath = join(dirname(manifestPath), "cli.js");
  await access(cliPath);
  return cliPath;
}
