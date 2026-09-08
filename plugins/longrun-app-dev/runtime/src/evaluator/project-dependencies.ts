import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runCommand } from "../adapters/web/process.js";
import { PLAYWRIGHT_MCP_VERSION } from "./playwright-config.js";

export function projectDependencyRoot(projectRoot: string): string {
  return resolve(projectRoot, ".longrun-app-dev/deps");
}

// Use only this project's installation, never an ancestor package or environment override.
export async function findProjectPlaywrightCli(projectRoot: string): Promise<string> {
  const root = projectDependencyRoot(projectRoot);
  const packageRoot = join(root, "node_modules/@playwright/mcp");
  try {
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { version?: string };
    if (manifest.version !== PLAYWRIGHT_MCP_VERSION) throw new Error(`Expected Playwright MCP ${PLAYWRIGHT_MCP_VERSION}, found ${manifest.version}`);
    const cli = join(packageRoot, "cli.js");
    if (!(await stat(cli)).isFile()) throw new Error("Playwright MCP CLI is not a file");
    return cli;
  } catch (error) {
    throw new Error(`Playwright MCP is not installed correctly in ${root}. Run init to prepare dependencies. ${error instanceof Error ? error.message : String(error)}`);
  }
}

type Installer = (directory: string) => Promise<void>;
async function install(directory: string): Promise<void> {
  // Fixed arguments, with the directory passed as cwd rather than shell text.
  const result = await runCommand("setup", "npm", ["install", "--prefix", ".", "--save-exact", "--no-audit", "--no-fund", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`], directory);
  if (result.status !== "passed") throw new Error(`Dependency installation failed. Check npm and network access, then run init again. ${result.stderr}`);
}

export async function ensureProjectDependencies(projectRoot: string, installer: Installer = install): Promise<{ status: "installed" | "available"; root: string }> {
  const project = await realpath(projectRoot);
  const root = projectDependencyRoot(project);
  for (const directory of [join(project, ".longrun-app-dev"), root]) {
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error("Dependency directory must not redirect");
  }
  try {
    await findProjectPlaywrightCli(project);
    return { status: "available", root };
  } catch { /* Missing, outdated or incomplete installations are repaired by init. */ }
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "longrun-project-dependencies", private: true }, null, 2) + "\n", { flag: "wx" });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  await installer(root);
  await findProjectPlaywrightCli(project);
  return { status: "installed", root };
}
