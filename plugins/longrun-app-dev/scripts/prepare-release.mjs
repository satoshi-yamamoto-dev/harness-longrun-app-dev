import { fileURLToPath } from "node:url";
import { prepareRelease } from "./lib/release-package.mjs";
import { safeConsole } from "./lib/safe-output.mjs";
try {
  if (process.argv.length !== 3) throw new Error("Usage: node prepare-release.mjs <new-local-directory>");
  const result = await prepareRelease(fileURLToPath(new URL("../", import.meta.url)), process.argv[2]);
  safeConsole.log({ status: result.status, version: result.version, files: result.files.length, published: result.published });
} catch (error) { safeConsole.error(error.message); process.exitCode = 1; }
