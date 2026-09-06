import { randomUUID } from "node:crypto";
import { mkdir, realpath, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface RunLayout {
  readonly runId: string;
  readonly harnessRoot: string;
  readonly runsRoot: string;
  readonly runRoot: string;
  readonly buildRoot: string;
  readonly qaRoot: string;
  readonly evidenceRoot: string;
  readonly logsRoot: string;
  readonly eventsPath: string;
}

export function generateRunId(now: Date = new Date(), uuid: string = randomUUID()): string {
  const timestamp = now.toISOString().replaceAll(/[-:]/gu, "").replace(".000", "");
  return `${timestamp}-${uuid}`;
}

export async function initializeRunDirectory(projectRoot: string, runId: string = generateRunId()): Promise<RunLayout> {
  assertSafeRunId(runId);
  const resolvedProjectRoot = resolve(projectRoot);
  const harnessRoot = join(resolvedProjectRoot, ".longrun-app-dev");
  const runsRoot = join(harnessRoot, "runs");
  const runRoot = join(runsRoot, runId);
  const buildRoot = join(runRoot, "build");
  const qaRoot = join(runRoot, "qa");
  const evidenceRoot = join(qaRoot, "evidence");
  const logsRoot = join(runRoot, "logs");

  await mkdir(runsRoot, { recursive: true });
  await mkdir(runRoot, { recursive: false });
  await Promise.all([
    mkdir(buildRoot),
    mkdir(evidenceRoot, { recursive: true }),
    mkdir(logsRoot),
  ]);

  return {
    runId,
    harnessRoot,
    runsRoot,
    runRoot,
    buildRoot,
    qaRoot,
    evidenceRoot,
    logsRoot,
    eventsPath: join(logsRoot, "events.jsonl"),
  };
}

function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId) || runId === "." || runId === "..") {
    throw new TypeError(`Invalid Run ID: ${runId}`);
  }
}

export async function openRunDirectory(projectRoot: string, runId: string): Promise<RunLayout> {
  assertSafeRunId(runId);
  const root = await realpath(projectRoot);
  const harnessRoot = join(root, ".longrun-app-dev"), runsRoot = join(harnessRoot, "runs"), runRoot = join(runsRoot, runId);
  for (const directory of [harnessRoot, runsRoot, runRoot]) {
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== resolve(directory)) throw new Error("Run directory must not redirect");
  }
  return { runId, harnessRoot, runsRoot, runRoot, buildRoot: join(runRoot, "build"), qaRoot: join(runRoot, "qa"),
    evidenceRoot: join(runRoot, "qa/evidence"), logsRoot: join(runRoot, "logs"), eventsPath: join(runRoot, "logs/events.jsonl") };
}
