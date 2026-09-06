import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { PackageManager, ProjectDetection } from "../types.js";

const lockfiles: ReadonlyArray<readonly [string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function packageManagerHint(value: unknown): PackageManager | null {
  if (typeof value !== "string") return null;
  const name = value.split("@")[0];
  return name === "pnpm" || name === "npm" || name === "yarn" || name === "bun" ? name : null;
}

function scriptEntries(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export async function detectWebProject(projectRoot: string): Promise<ProjectDetection> {
  const resolvedRoot = path.resolve(projectRoot);
  const packageJsonPath = path.join(resolvedRoot, "package.json");
  if (!(await exists(packageJsonPath))) {
    return {
      detected: false,
      projectRoot: resolvedRoot,
      packageJsonPath: null,
      packageManager: null,
      lockfilePath: null,
      scripts: {},
      reason: "package.json was not found",
    };
  }

  let manifest: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("package.json must contain an object");
    }
    manifest = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      detected: false,
      projectRoot: resolvedRoot,
      packageJsonPath,
      packageManager: null,
      lockfilePath: null,
      scripts: {},
      reason: `package.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let packageManager: PackageManager | null = null;
  let lockfilePath: string | null = null;
  for (const [filename, manager] of lockfiles) {
    const candidate = path.join(resolvedRoot, filename);
    if (await exists(candidate)) {
      packageManager = manager;
      lockfilePath = candidate;
      break;
    }
  }
  packageManager ??= packageManagerHint(manifest.packageManager) ?? "npm";

  return {
    detected: true,
    projectRoot: resolvedRoot,
    packageJsonPath,
    packageManager,
    lockfilePath,
    scripts: scriptEntries(manifest.scripts),
  };
}
