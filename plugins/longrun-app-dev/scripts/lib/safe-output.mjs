import { writeFile as writeRaw } from "node:fs/promises";
import { redactArtifact, redactValue } from "../../runtime/dist/logging/index.js";

export async function writeFile(file, text, options) {
  if (typeof text !== "string") throw new TypeError("Evaluation output must be text");
  return writeRaw(file, redactArtifact(text), options);
}
export const safeConsole = {
  log: (...values) => console.log(...values.map((value) => redactValue(value))),
  error: (...values) => console.error(...values.map((value) => redactValue(value))),
};
