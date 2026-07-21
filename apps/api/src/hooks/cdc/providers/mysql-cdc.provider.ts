/**
 * MySQL CDC via the binary log (row-based replication), read with
 * `@powersync/mysql-zongji`. Syncle registers as a replication client and
 * decodes Write/Update/Delete row events in real time. durable and resumable:
 * the cursor is the binlog `"file:position"`, so a restart resumes exactly
 * where it left off.
 *
 * prereqs (checked by readiness): `log_bin=ON`, `binlog_format=ROW`,
 * `binlog_row_image=FULL`, and a user with `REPLICATION SLAVE` + `REPLICATION
 * CLIENT`. on managed MySQL these usually need a parameter-group change plus a
 * reboot and an explicit GRANT. readiness spells out what's missing.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ZongJi, type BinLogEvent } from '@powersync/mysql-zongji';
import type {
  CdcOperation,
  CdcReadiness,
  CdcReadinessDTO,
  ConnectionConfig,
  DatabaseEngine,
} from '@syncle/core';
import { AdapterPoolService } from '../../../connections/adapter-pool.service';
import type { ResolvedHook } from '../../hooks.types';
import {
  backoffMs,
  type CdcProvider,
  type CdcStreamContext,
  type CdcStreamHandle,
} from '../cdc-provider';

interface ZongjiConn {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** row events we care about. `rotate`/`tablemap` are needed for bookkeeping */
const ROW_EVENTS = new Set(['writerows', 'updaterows', 'deleterows']);

@Injectable()
export class MysqlCdcProvider implements CdcProvider {
  readonly engine: DatabaseEngine = 'mysql';
  private readonly logger = new Logger('HookCdc:mysql');

  constructor(private readonly pool: AdapterPoolService) {}

  /** compare "file:pos[:row]" cursors: filename, then position, then row index */
  cursorAfter(a: string, b: string | null): boolean {
    if (!b) return true;
    const [fa, pa, ra] = this.splitCursor(a);
    const [fb, pb, rb] = this.splitCursor(b);
    if (fa !== fb) return fa > fb; // zero-padded binlog names compare lexically
    if (pa !== pb) return pa > pb;
    return ra > rb;
  }

  /**
   * parse "file:pos:rowIdx" (or legacy "file:pos" persisted before per-row
   * cursors existed — a missing row index compares as -1, so every row of the
   * next multi-row event still counts as "after" the old watermark)
   */
  private splitCursor(c: string): [string, number, number] {
    const parts = c.split(':');
    if (parts.length >= 3) {
      const row = Number(parts[parts.length - 1]);
      const pos = Number(parts[parts.length - 2]);
      if (Number.isFinite(row) && Number.isFinite(pos)) {
        return [parts.slice(0, -2).join(':'), pos, row];
      }
    }
    const idx = c.lastIndexOf(':');
    if (idx < 0) return [c, 0, -1];
    return [c.slice(0, idx), Number(c.slice(idx + 1)) || 0, -1];
  }

  /* ----- connection details, zongji needs discrete fields ----- */

  private zongjiConn(conn: ConnectionConfig): ZongjiConn {
    if (conn.host) {
      return {
        host: conn.host,
        port: conn.port ?? 3306,
        user: conn.user ?? 'root',
        password: conn.password ?? '',
      };
    }
    if (conn.connectionString) {
      const u = new URL(conn.connectionString);
      return {
        host: u.hostname,
        port: u.port ? Number(u.port) : 3306,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
      };
    }
    throw new Error('MySQL connection is missing host/credentials.');
  }

  /** a stable, non-zero replication server id derived from the hook id */
  private serverId(hookId: string): number {
    let h = 0;
    for (let i = 0; i < hookId.length; i++) h = (h * 31 + hookId.charCodeAt(i)) >>> 0;
    // keep well clear of the common server_id=1 and inside a safe 32-bit range
    return (h % 2_000_000_000) + 1000;
  }

  /* ----- readiness ----- */

  async readiness(dto: CdcReadinessDTO, _conn: ConnectionConfig): Promise<CdcReadiness> {
    const checks: CdcReadiness['checks'] = [];
    const instructions: string[] = [];
    try {
      const vars = await this.pool.withAdapter(dto.connectionId, dto.database, (a) =>
        a.query(
          `SHOW VARIABLES WHERE Variable_name IN ('log_bin','binlog_format','binlog_row_image')`,
        ),
      );
      const map = new Map<string, string>();
      for (const r of vars.rows as { Variable_name?: string; Value?: string }[]) {
        if (r.Variable_name) map.set(r.Variable_name, String(r.Value ?? ''));
      }
      const logBin = (map.get('log_bin') ?? '').toUpperCase() === 'ON';
      const rowFmt = (map.get('binlog_format') ?? '').toUpperCase() === 'ROW';
      const rowImage = (map.get('binlog_row_image') ?? 'FULL').toUpperCase() === 'FULL';

      const grants = await this.pool.withAdapter(dto.connectionId, dto.database, (a) =>
        a.query(`SHOW GRANTS FOR CURRENT_USER()`),
      );
      const grantText = grants.rows
        .map((r) => Object.values(r as Record<string, unknown>).join(' '))
        .join(' ')
        .toUpperCase();
      const canReplicate =
        (grantText.includes('REPLICATION SLAVE') &&
          grantText.includes('REPLICATION CLIENT')) ||
        grantText.includes('ALL PRIVILEGES');

      checks.push({ label: 'log_bin = ON', ok: logBin, detail: map.get('log_bin') });
      checks.push({ label: 'binlog_format = ROW', ok: rowFmt, detail: map.get('binlog_format') });
      checks.push({
        label: 'binlog_row_image = FULL',
        ok: rowImage,
        detail: map.get('binlog_row_image'),
      });
      checks.push({ label: 'user can replicate', ok: canReplicate });

      if (!logBin || !rowFmt || !rowImage) {
        instructions.push(
          'Enable row-based binary logging on the server (my.cnf): `log_bin=ON`, `binlog_format=ROW`, `binlog_row_image=FULL`, and a unique `server_id`. This needs a server restart. On managed MySQL (RDS/Aurora/Cloud SQL) set these in the parameter group and reboot.',
        );
      }
      if (!canReplicate) {
        instructions.push(
          "Grant replication to the connection's user:  GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO CURRENT_USER;",
        );
      }
      const ready = logBin && rowFmt && rowImage && canReplicate;
      return { engine: 'mysql', supported: true, ready, checks, instructions };
    } catch (err) {
      return {
        engine: 'mysql',
        supported: true,
        ready: false,
        checks: [{ label: 'connect to MySQL', ok: false, detail: (err as Error).message }],
        instructions: ['Could not query MySQL to check readiness.'],
      };
    }
  }

  /* ----- provisioning: nothing to do, the binlog already exists ----- */

  async provision(): Promise<void> {
    /* no-op */
  }
  async deprovision(): Promise<void> {
    /* no-op */
  }

  /* ----- the stream ----- */

  async startStream(ctx: CdcStreamContext): Promise<CdcStreamHandle> {
    const { hookId, hook, conn, handlers, fromCursor } = ctx;
    if (hook.source.kind !== 'table' || hook.trigger.kind !== 'cdc') {
      throw new Error('MySQL CDC requires a table source and cdc trigger.');
    }
    const src = hook.source;
    const db = src.database || conn.database;
    if (!db) throw new Error('MySQL CDC needs a database on the source.');
    const ops = new Set<CdcOperation>(hook.trigger.operations);
    const connInfo = this.zongjiConn(conn);
    const serverId = this.serverId(hookId);

    let stopped = false;
    let zongji: ZongJi | null = null;
    let attempt = 0;
    // resume bookkeeping: tracks the last processed binlog position so both the
    // initial start AND every reconnect resume exactly where we left off
    let [binlogName, position] = fromCursor ? this.splitCursor(fromCursor) : ['', 0, -1];

    const onEvent = async (evt: BinLogEvent): Promise<void> => {
      const name = evt.getEventName();
      if (name === 'rotate') {
        // rotate tells us the current binlog filename (incl. the one at startup)
        const next = (evt as { binlogName?: string }).binlogName;
        if (next && next !== binlogName) {
          // a genuinely new file always begins at position 4; the startup
          // rotate (binlogName still empty) must not fabricate a resume point
          if (binlogName) position = 4;
          binlogName = next;
        }
        return;
      }
      if (!ROW_EVENTS.has(name)) return;

      const rowEvt = evt as unknown as {
        tableId: number;
        nextPosition: number;
        tableMap: Record<number, { parentSchema: string; tableName: string }>;
        rows: Record<string, unknown>[] | { before: Record<string, unknown>; after: Record<string, unknown> }[];
      };
      const meta = rowEvt.tableMap[rowEvt.tableId];
      if (!meta || meta.parentSchema !== db || meta.tableName !== src.table) {
        position = rowEvt.nextPosition; // nothing to deliver, safe to skip on reconnect
        return;
      }

      const op: CdcOperation =
        name === 'writerows' ? 'insert' : name === 'deleterows' ? 'delete' : 'update';
      if (!ops.has(op)) {
        position = rowEvt.nextPosition;
        return;
      }

      // backpressure: pause the binlog socket while we deliver this batch
      if (zongji && !stopped) zongji.pause();
      try {
        // per-ROW cursor: every row in a multi-row event needs its own position,
        // otherwise the orchestrator's strict watermark drops rows 2..N
        for (let i = 0; i < rowEvt.rows.length; i++) {
          const r = rowEvt.rows[i]!;
          const row =
            op === 'update'
              ? (r as { after: Record<string, unknown> }).after
              : (r as Record<string, unknown>);
          await handlers.onChange({ op, row, cursor: `${binlogName}:${rowEvt.nextPosition}:${i}` });
        }
        // remember the resume point so a reconnect continues from here instead
        // of silently jumping to the end of the binlog
        position = rowEvt.nextPosition;
      } finally {
        if (zongji && !stopped) zongji.resume();
      }
    };

    const startInstance = (): void => {
      if (stopped) return;
      const instance = new ZongJi({ ...connInfo, dateStrings: true });
      zongji = instance;
      instance.on('binlog', (evt: BinLogEvent) => {
        void onEvent(evt).catch((err) => handlers.onError(err as Error));
      });
      instance.on('error', (err: Error) => {
        handlers.onError(err);
        if (stopped) return;
        try {
          instance.stop();
        } catch {
          /* ignore */
        }
        const wait = backoffMs(attempt++);
        setTimeout(() => {
          if (!stopped) startInstance();
        }, wait);
      });

      const startOpts: Record<string, unknown> = {
        includeEvents: ['rotate', 'tablemap', 'writerows', 'updaterows', 'deleterows'],
        includeSchema: { [db]: [src.table] },
        serverId,
      };
      if (binlogName && position > 0) {
        // resume from the last processed position — kept up to date by onEvent,
        // so a mid-stream reconnect never loses the events in between
        startOpts.filename = binlogName;
        startOpts.position = position;
      } else {
        // genuinely no cursor yet (fresh hook): start at the tip of the binlog
        startOpts.startAtEnd = true;
      }
      instance.start(startOpts);
      attempt = 0;
    };

    startInstance();

    return {
      stop: async () => {
        stopped = true;
        try {
          zongji?.stop();
        } catch {
          /* ignore */
        }
      },
    };
  }
}
