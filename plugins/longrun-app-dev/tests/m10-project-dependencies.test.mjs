import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureProjectDependencies, findProjectPlaywrightCli, projectDependencyRoot } from '../runtime/dist/evaluator/index.js';
import { seedProjectMcp } from './helpers/project-mcp.mjs';

test('project dependencies install once, repair wrong versions and restore deleted dependencies', async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'project-deps-')));
 let installs = 0;
 const install = async directory => {
  assert.equal(directory, projectDependencyRoot(root));
  installs++;
  await seedProjectMcp(root);
 };
 assert.equal((await ensureProjectDependencies(root, install)).status, 'installed');
 assert.equal((await ensureProjectDependencies(root, install)).status, 'available');
 assert.equal(installs, 1);
 await seedProjectMcp(root, '0.0.1');
 await assert.rejects(findProjectPlaywrightCli(root), /Run init/);
 await ensureProjectDependencies(root, install);
 assert.equal(installs, 2);
 // This is the dependency directory of the fresh temporary test project.
 const directory = projectDependencyRoot(root);
 assert.equal(directory, join(root, '.longrun-app-dev/deps'));
 await rm(directory, {recursive: true});
 await ensureProjectDependencies(root, install);
 assert.equal(installs, 3);
});

test('project lookup ignores legacy environment overrides and does not install on reads', async () => {
 const root = await mkdtemp(join(tmpdir(), 'project-lookup-'));
 const previous = process.env.LONGRUN_PLAYWRIGHT_ROOT;
 try {
  process.env.LONGRUN_PLAYWRIGHT_ROOT = 'unused-legacy-location';
  await assert.rejects(findProjectPlaywrightCli(root), /Run init/);
  const cli = await seedProjectMcp(root);
  assert.equal(await findProjectPlaywrightCli(root), cli);
 } finally {
  if (previous === undefined) delete process.env.LONGRUN_PLAYWRIGHT_ROOT;
  else process.env.LONGRUN_PLAYWRIGHT_ROOT = previous;
 }
});

test('failed or incomplete dependency installation is reported and can be retried', async () => {
 const root = await mkdtemp(join(tmpdir(), 'project-install-failure-'));
 await assert.rejects(ensureProjectDependencies(root, async () => { throw new Error('npm unavailable'); }), /npm unavailable/);
 await assert.rejects(ensureProjectDependencies(root, async () => {}), /Run init/);
 await ensureProjectDependencies(root, async () => { await seedProjectMcp(root); });
 assert.ok(await findProjectPlaywrightCli(root));
});

// Exercise the production npm subprocess path without network or registry access.
test('CLI init invokes npm locally, reuses dependencies and preserves settings after install failure', async () => {
 const { execFile } = await import('node:child_process');
 const { promisify } = await import('node:util');
 const { fileURLToPath } = await import('node:url');
 const { mkdir, readFile, writeFile } = await import('node:fs/promises');
 const root = await realpath(await mkdtemp(join(tmpdir(), 'project-cli-install-')));
 const bin = join(root, 'mock-bin');
 await mkdir(bin);
 const mock = join(bin, 'npm-mock.cjs');
 await writeFile(mock, `const fs = require('node:fs'); const path = require('node:path');
fs.appendFileSync('calls.txt', JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.MOCK_NPM_FAIL === '1') { process.stderr.write('mock install failure'); process.exit(1); }
const p = 'node_modules/@playwright/mcp'; fs.mkdirSync(p, {recursive:true});
fs.writeFileSync(path.join(p, 'package.json'), JSON.stringify({name:'@playwright/mcp',version:'0.0.80'}));
fs.writeFileSync(path.join(p, 'cli.js'), '// mock');`);
 if (process.platform === 'win32') {
  await writeFile(join(bin, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "${mock}" %*\r\n`);
 } else {
  await writeFile(join(bin, 'npm'), `#!/bin/sh\nexec '${process.execPath}' '${mock}' "$@"\n`, {mode:0o755});
 }
 const env = {...process.env};
 for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
 env.PATH = bin;
 const cli = fileURLToPath(new URL('../runtime/dist/cli.js', import.meta.url));
 const run = (extra = {}) => promisify(execFile)(process.execPath, [cli,'init'], {cwd:root,env:{...env,...extra}});
 await assert.rejects(run({MOCK_NPM_FAIL:'1'}), /mock install failure/);
 const config = join(root,'.longrun-app-dev/config.yaml');
 await writeFile(config, 'user settings\n');
 await assert.rejects(readFile(join(root,'.longrun-app-dev/run.lock')), {code:'ENOENT'});
 assert.equal(JSON.parse((await run()).stdout).dependencies.status, 'installed');
 assert.equal(JSON.parse((await run()).stdout).dependencies.status, 'available');
 assert.equal(await readFile(config,'utf8'), 'user settings\n');
 const calls = (await readFile(join(projectDependencyRoot(root),'calls.txt'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0], ['install','--prefix','.','--save-exact','--no-audit','--no-fund','@playwright/mcp@0.0.80']);
});
