// Launches Next.js on the port defined in the env file (WEB_PORT), so the
// frontend port lives in configuration rather than being hard-coded in
// package.json. Falls back to 3002.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function readPort() {
  if (process.env.WEB_PORT) return process.env.WEB_PORT;
  for (const file of ['.env.local', '.env', '.env.example']) {
    const p = resolve(appDir, file);
    if (!existsSync(p)) continue;
    const match = readFileSync(p, 'utf8').match(
      /^\s*WEB_PORT\s*=\s*["']?(\d+)/m,
    );
    if (match) return match[1];
  }
  return '3002';
}

const command = process.argv[2] === 'start' ? 'start' : 'dev';
const port = readPort();
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, command, '-p', port], {
  stdio: 'inherit',
  cwd: appDir,
});
child.on('exit', (code) => process.exit(code ?? 0));
