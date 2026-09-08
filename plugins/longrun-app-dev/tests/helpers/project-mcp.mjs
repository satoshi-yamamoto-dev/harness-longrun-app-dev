import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function seedProjectMcp(root, version = '0.0.80') {
  const directory = join(root, '.longrun-app-dev/deps/node_modules/@playwright/mcp');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@playwright/mcp', version }));
  await writeFile(join(directory, 'cli.js'), '// Test fixture; never launches a browser.\n');
  return join(directory, 'cli.js');
}
