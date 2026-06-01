// Prints a clear startup banner with the Web + API URLs, so they're always
// visible in the console (the concurrent dev/prod output can otherwise bury
// the framework's own "ready" line).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function envValue(file, key, fallback) {
  try {
    const text = readFileSync(resolve(root, file), 'utf8');
    const line = text
      .split('\n')
      .find((l) => l.trim().replace(/\s/g, '').startsWith(`${key}=`));
    if (!line) return fallback;
    return line.split('=')[1].trim().replace(/^["']|["']$/g, '') || fallback;
  } catch {
    return fallback;
  }
}

const mode = process.argv[2] === 'prod' ? 'production' : 'development';
const apiPort = envValue('apps/api/.env', 'PORT', '4002');
const webPort = envValue('apps/web/.env.local', 'WEB_PORT', '3002');

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log(`
  ${bold('relay')} ${dim(`· ${mode}`)}

    ${bold('Web')}  ${cyan(`http://localhost:${webPort}`)}   ${dim('← open this')}
    ${bold('API')}  ${cyan(`http://localhost:${apiPort}/api`)}
`);
