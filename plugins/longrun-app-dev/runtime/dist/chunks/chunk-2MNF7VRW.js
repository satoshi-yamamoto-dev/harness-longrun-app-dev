import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  redactValue
} from "./chunk-5CGYLQMM.js";

// runtime/src/logging/event-log.ts
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
var EventLog = class {
  constructor(path) {
    this.path = path;
  }
  path;
  async append(entry) {
    const completeEntry = redactValue({
      ...entry,
      schemaVersion: 1,
      eventId: entry.eventId ?? randomUUID()
    });
    validateEntry(completeEntry);
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, "a", 384);
    try {
      await handle.writeFile(`${JSON.stringify(completeEntry)}
`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return completeEntry;
  }
  async readAll() {
    let source;
    try {
      source = await readFile(this.path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }
    return source.split(/\r?\n/gu).filter((line) => line.length > 0).map((line, index) => {
      const value = JSON.parse(line);
      try {
        validateEntry(value);
      } catch (error) {
        throw new SyntaxError(`Invalid event at JSONL line ${index + 1}`, { cause: error });
      }
      return value;
    });
  }
};
function validateEntry(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError("Event must be an object with schemaVersion 1");
  }
  for (const field of ["eventId", "timestamp", "runId", "phase", "agent", "event"]) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      throw new TypeError(`Event field must be a non-empty string: ${field}`);
    }
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMissingFileError(error) {
  return isRecord(error) && error.code === "ENOENT";
}

export {
  EventLog
};
//# sourceMappingURL=chunk-2MNF7VRW.js.map
