import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function atomicWriteFile(path: string, content: string | Uint8Array): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });

  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
