/** Server runtime configuration, resolved once from the environment. */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function resolveDataDir(): string {
  const dir = process.env.RELAY_DATA_DIR
    ? resolve(process.env.RELAY_DATA_DIR)
    : resolve(process.cwd(), '.relay');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const dataDir = resolveDataDir();

export const runtimeConfig = {
  dataDir,
  storeFile: resolve(dataDir, 'relay.db'),
  keyFile: resolve(dataDir, 'master.key'),
  masterKey: process.env.RELAY_MASTER_KEY ?? null,
  maxQueryRows: Number(process.env.RELAY_MAX_QUERY_ROWS ?? 5000),
  poolIdleMs: Number(process.env.RELAY_POOL_IDLE_MS ?? 300_000),
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? true,
} as const;
