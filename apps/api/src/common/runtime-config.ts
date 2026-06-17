/** server runtime config, resolved once from the environment */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function resolveDataDir(): string {
  const dir = process.env.DATABRIDGE_DATA_DIR
    ? resolve(process.env.DATABRIDGE_DATA_DIR)
    : resolve(process.cwd(), '.data-bridge');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const dataDir = resolveDataDir();

export const runtimeConfig = {
  dataDir,
  storeFile: resolve(dataDir, 'data-bridge.db'),
  keyFile: resolve(dataDir, 'master.key'),
  masterKey: process.env.DATABRIDGE_MASTER_KEY ?? null,
  maxQueryRows: Number(process.env.DATABRIDGE_MAX_QUERY_ROWS ?? 5000),
  poolIdleMs: Number(process.env.DATABRIDGE_POOL_IDLE_MS ?? 300_000),
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? true,
  /** Redis URL backing the BullMQ hook-run queue */
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** worker concurrency: how many hook runs may run in parallel */
  hookConcurrency: Number(process.env.DATABRIDGE_HOOK_CONCURRENCY ?? 5),
} as const;

/**
 * parse {@link runtimeConfig.redisUrl} into ioredis connection options for
 * BullMQ. `maxRetriesPerRequest: null` is required by BullMQ's blocking
 * connections. ioredis still reconnects in the background, so a missing Redis
 * never crashes bootstrap, only enqueuing a run fails (with a clear message)
 */
export function redisConnectionOptions(): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
} {
  const u = new URL(runtimeConfig.redisUrl);
  const db = u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname || 'localhost',
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    maxRetriesPerRequest: null,
  };
}
