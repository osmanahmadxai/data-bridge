/**
 * Live adapter cache. Opening a database connection is expensive, so one
 * adapter instance per saved connection is kept alive across requests and
 * evicted after a period of inactivity.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createAdapter } from '@relay/core/adapters';
import type { ConnectionConfig, DatabaseAdapter } from '@relay/core';
import { runtimeConfig } from '../common/runtime-config';
import { ConnectionStoreService } from './connection-store.service';

interface PoolEntry {
  adapter: DatabaseAdapter;
  revision: string;
  lastUsedAt: number;
}

@Injectable()
export class AdapterPoolService implements OnModuleDestroy {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(private readonly store: ConnectionStoreService) {
    this.sweepTimer = setInterval(
      () => this.sweep(),
      Math.max(runtimeConfig.poolIdleMs / 2, 30_000),
    );
    this.sweepTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.sweepTimer);
    await Promise.all(
      [...this.entries.values()].map((e) => e.adapter.close().catch(() => {})),
    );
    this.entries.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.lastUsedAt > runtimeConfig.poolIdleMs) {
        void entry.adapter.close().catch(() => {});
        this.entries.delete(id);
      }
    }
  }

  /**
   * Acquire an adapter for a connection, optionally bound to a specific
   * database. Engines like PostgreSQL bind a connection to a single database,
   * so switching databases means a distinct adapter — we therefore cache one
   * adapter per `(connection, database)` pair.
   */
  private async acquire(
    id: string,
    database?: string,
  ): Promise<DatabaseAdapter> {
    const config = await this.store.resolve(id);
    const effectiveDb = database || config.database;
    const key = `${id}::${effectiveDb ?? ''}`;
    const existing = this.entries.get(key);

    if (existing && existing.revision === config.updatedAt) {
      existing.lastUsedAt = Date.now();
      return existing.adapter;
    }
    if (existing) {
      await existing.adapter.close().catch(() => {});
      this.entries.delete(key);
    }

    const adapter = createAdapter({ ...config, database: effectiveDb });
    await adapter.connect();
    this.entries.set(key, {
      adapter,
      revision: config.updatedAt,
      lastUsedAt: Date.now(),
    });
    return adapter;
  }

  /**
   * Run an operation against the live adapter for a connection, optionally
   * targeting a specific database.
   */
  async withAdapter<T>(
    id: string,
    database: string | undefined,
    fn: (adapter: DatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    return fn(await this.acquire(id, database));
  }

  /** Build a one-off adapter from a raw config (used by "test connection"). */
  async test(config: ConnectionConfig): Promise<void> {
    const adapter = createAdapter(config);
    try {
      await adapter.connect();
      await adapter.ping();
    } finally {
      await adapter.close().catch(() => {});
    }
  }

  /**
   * Evict (and close) every adapter for a connection — across all databases —
   * after the connection is edited or deleted.
   */
  async evict(id: string): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (key === id || key.startsWith(`${id}::`)) {
        await entry.adapter.close().catch(() => {});
        this.entries.delete(key);
      }
    }
  }
}
