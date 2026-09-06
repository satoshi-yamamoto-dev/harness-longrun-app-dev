import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { lstat, mkdir, open, readFile, realpath, unlink, rename, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface RunLock { readonly path: string; readonly token: string; release(): Promise<void>; }

export function watchRunStop(root: string, token: string): { signal: AbortSignal; close(): void } {
  const controller = new AbortController();
  const timer = setInterval(() => {
    void readFile(join(root, ".longrun-app-dev/stop.request"), "utf8")
      .then((text) => { if (JSON.parse(text).token === token) controller.abort(); }).catch(() => {});
  }, 100);
  return { signal: controller.signal, close: () => clearInterval(timer) };
}

/** Explicit recovery only; refuse foreign hosts, live/reused PIDs and malformed records. */
export async function recoverRunLock(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot);
  const directory = join(root, ".longrun-app-dev");
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("Harness directory must not redirect");
  const mutex = join(directory, "lock-recovery");
  await mkdir(mutex);
  try {
    const path = join(directory, "run.lock");
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Run lock must not redirect");
    const owner = JSON.parse(await readFile(path, "utf8")) as { token: string; pid: number; hostname: string };
    if (owner.hostname !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !/^[a-f0-9-]{36}$/u.test(owner.token)) throw new Error("Run lock cannot be safely recovered");
    try { process.kill(owner.pid, 0); throw new Error("Owner PID is still alive; refusing recovery"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    const archive = join(directory, `recovered-lock-${randomUUID()}.json`);
    await rename(path, archive);
    return archive;
  } finally { await rmdir(mutex); }
}

/** Exclusive per-project ownership. Stale locks require explicit recovery, never PID-based stealing. */
export async function acquireRunLock(projectRoot: string): Promise<RunLock> {
  const project = await realpath(projectRoot);
  const directory = join(project, ".longrun-app-dev");
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== resolve(directory)) {
    throw new Error("Harness directory must not redirect outside the project");
  }
  const path = join(directory, "run.lock");
  const token = randomUUID();
  let handle;
  try { handle = await open(path, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Run lock exists: another Run is active or recovery is required");
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ schemaVersion: 1, token, pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() }));
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(path);
    throw error;
  }
  await handle.close();
  let released = false;
  return { path, token, async release() {
    if (released) return;
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Run lock was replaced");
    const owner = JSON.parse(await readFile(path, "utf8")) as { token?: string };
    if (owner.token !== token) throw new Error("Run lock ownership changed; refusing to remove it");
    await unlink(path);
    released = true;
  } };
}
