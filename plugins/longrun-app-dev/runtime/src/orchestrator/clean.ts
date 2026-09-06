import { lstat, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ArtifactStore } from "../artifacts/index.js";
import type { RunState } from "../contracts/index.js";
import { acquireRunLock } from "./run-lock.js";

export async function cleanRun(projectRoot: string, runId: string): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) throw new Error("Invalid Run ID");
  const root = await realpath(projectRoot);
  const lock = await acquireRunLock(root);
  try {
    const runs = join(root, ".longrun-app-dev", "runs");
    const directory = join(runs, runId);
    for (const target of [runs, directory]) {
      if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== resolve(target)) throw new Error("Clean target must not redirect");
    }
    const state = await new ArtifactStore(directory).readJson<RunState>("state.json", "state");
    if (state.runId !== runId || await realpath(state.projectRoot) !== root) throw new Error("Run does not belong to this project");
    if (!["COMPLETED", "FAILED", "STOPPED"].includes(state.phase)) throw new Error("Only terminal Runs can be cleaned");
    // Both ancestors and the exact target were resolved above. rm does not follow child symlinks.
    await rm(directory, { recursive: true, force: false });
    return directory;
  } finally { await lock.release(); }
}
