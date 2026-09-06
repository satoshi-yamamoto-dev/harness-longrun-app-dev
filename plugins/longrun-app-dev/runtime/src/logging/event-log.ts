import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IsoDateTime, JsonValue, RunPhase, RunUsage } from "../contracts/index.js";
import { redactValue } from "./redaction.js";

export type AgentRole = "orchestrator" | "planner" | "generator" | "evaluator";

export interface RunEventLogEntry {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly timestamp: IsoDateTime;
  readonly runId: string;
  readonly phase: RunPhase;
  readonly agent: AgentRole;
  readonly event: string;
  readonly payload?: JsonValue;
  readonly usage?: RunUsage;
}

export type NewRunEventLogEntry = Omit<RunEventLogEntry, "schemaVersion" | "eventId"> & {
  readonly eventId?: string;
};

export class EventLog {
  public constructor(private readonly path: string) {}

  public async append(entry: NewRunEventLogEntry): Promise<RunEventLogEntry> {
    const completeEntry = redactValue({
      ...entry,
      schemaVersion: 1,
      eventId: entry.eventId ?? randomUUID(),
    }) as RunEventLogEntry;
    validateEntry(completeEntry);
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(completeEntry)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return completeEntry;
  }

  public async readAll(): Promise<readonly RunEventLogEntry[]> {
    let source: string;
    try {
      source = await readFile(this.path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }

    return source
      .split(/\r?\n/gu)
      .filter((line) => line.length > 0)
      .map((line, index) => {
        const value: unknown = JSON.parse(line);
        try {
          validateEntry(value);
        } catch (error) {
          throw new SyntaxError(`Invalid event at JSONL line ${index + 1}`, { cause: error });
        }
        return value;
      });
  }
}

function validateEntry(value: unknown): asserts value is RunEventLogEntry {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError("Event must be an object with schemaVersion 1");
  }
  for (const field of ["eventId", "timestamp", "runId", "phase", "agent", "event"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      throw new TypeError(`Event field must be a non-empty string: ${field}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
