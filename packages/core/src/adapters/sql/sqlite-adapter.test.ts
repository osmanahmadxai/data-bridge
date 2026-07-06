import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestError } from '../../errors';
import type { ConnectionConfig } from '../types';
import { assertSafeDefaultValue } from './base-sql-adapter';
import { SqliteAdapter } from './sqlite-adapter';

function makeConfig(file: string): ConnectionConfig {
  const now = new Date().toISOString();
  return {
    id: 'test',
    name: 'test',
    engine: 'sqlite',
    database: file,
    createdAt: now,
    updatedAt: now,
  };
}

describe('SqliteAdapter', () => {
  let adapter: SqliteAdapter;
  let file: string;

  beforeEach(async () => {
    file = join(tmpdir(), `data-bridge-test-${Date.now()}-${Math.random()}.db`);
    adapter = new SqliteAdapter(makeConfig(file));
    await adapter.connect();
    await adapter.query(
      `CREATE TABLE users (
         id INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         email TEXT,
         active INTEGER DEFAULT 1
       )`,
    );
    await adapter.insertRow({
      table: 'users',
      values: { name: 'Ada', email: 'ada@example.com' },
    });
    await adapter.insertRow({
      table: 'users',
      values: { name: 'Linus', email: 'linus@example.com' },
    });
  });

  afterEach(async () => {
    await adapter.close();
    try {
      rmSync(file);
    } catch {
      /* ignore */
    }
  });

  it('introspects the schema with primary keys', async () => {
    const schema = await adapter.getSchema();
    const table = schema.namespaces[0]?.tables.find((t) => t.name === 'users');
    expect(table).toBeDefined();
    expect(table?.primaryKey).toEqual(['id']);
    expect(table?.columns.map((c) => c.name)).toContain('email');
  });

  it('browses with sorting and reports the total', async () => {
    const result = await adapter.browse({
      table: 'users',
      limit: 10,
      offset: 0,
      sort: [{ column: 'name', direction: 'asc' }],
    });
    expect(result.total).toBe(2);
    expect(result.rows[0]?.name).toBe('Ada');
    expect(result.primaryKey).toEqual(['id']);
  });

  it('updates and deletes by primary-key identity', async () => {
    await adapter.updateRow({
      table: 'users',
      identity: { id: 1 },
      changes: { name: 'Ada Lovelace' },
    });
    let result = await adapter.browse({ table: 'users', limit: 10, offset: 0 });
    expect(result.rows.find((r) => r.id === 1)?.name).toBe('Ada Lovelace');

    await adapter.deleteRow({ table: 'users', identity: { id: 2 } });
    result = await adapter.browse({ table: 'users', limit: 10, offset: 0 });
    expect(result.total).toBe(1);
  });

  it('is immune to SQL injection via filter values (parameterized)', async () => {
    // a classic injection payload should be treated as a literal string value,
    // not executed. the table must survive and just match zero rows
    const result = await adapter.browse({
      table: 'users',
      limit: 10,
      offset: 0,
      filters: [
        { column: 'name', operator: 'eq', value: "x'; DROP TABLE users;--" },
      ],
    });
    expect(result.rows).toHaveLength(0);

    // proof the table still exists and is intact
    const after = await adapter.browse({ table: 'users', limit: 10, offset: 0 });
    expect(after.total).toBe(2);
  });

  it('applies contains filters case-insensitively', async () => {
    const result = await adapter.browse({
      table: 'users',
      limit: 10,
      offset: 0,
      filters: [{ column: 'email', operator: 'contains', value: 'EXAMPLE' }],
    });
    expect(result.rows).toHaveLength(2);
  });

  it('upserts idempotently keyed by a unique column (bridge sink)', async () => {
    // first upsert inserts a new row
    await adapter.upsertRow({
      table: 'users',
      values: { id: 10, name: 'Grace', email: 'grace@x.com' },
      keyColumns: ['id'],
    });
    let res = await adapter.browse({ table: 'users', limit: 50, offset: 0 });
    expect(res.total).toBe(3);

    // re-running the SAME upsert must NOT create a duplicate (exactly-once)
    await adapter.upsertRow({
      table: 'users',
      values: { id: 10, name: 'Grace', email: 'grace@x.com' },
      keyColumns: ['id'],
    });
    res = await adapter.browse({ table: 'users', limit: 50, offset: 0 });
    expect(res.total).toBe(3);

    // an upsert with the same key but changed values updates in place
    await adapter.upsertRow({
      table: 'users',
      values: { id: 10, name: 'Grace Hopper', email: 'grace@x.com' },
      keyColumns: ['id'],
    });
    res = await adapter.browse({ table: 'users', limit: 50, offset: 0 });
    expect(res.total).toBe(3);
    expect(res.rows.find((r) => r.id === 10)?.name).toBe('Grace Hopper');
  });

  it('rejects non-integer limit/offset before they reach SQL', async () => {
    await expect(
      adapter.browse({ table: 'users', limit: NaN, offset: 0 }),
    ).rejects.toThrow(BadRequestError);
    await expect(
      adapter.browse({ table: 'users', limit: 10, offset: NaN }),
    ).rejects.toThrow(BadRequestError);
  });

  it('accepts safe DEFAULT values in createTable and rejects injection', async () => {
    await adapter.createTable({
      table: 'safe_defaults',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, autoIncrement: true },
        { name: 'n', type: 'INTEGER', nullable: true, primaryKey: false, autoIncrement: false, defaultValue: '42' },
        { name: 'label', type: 'TEXT', nullable: true, primaryKey: false, autoIncrement: false, defaultValue: "'it''s ok'" },
        { name: 'at', type: 'TEXT', nullable: true, primaryKey: false, autoIncrement: false, defaultValue: 'CURRENT_TIMESTAMP' },
      ],
    });
    await adapter.insertRow({ table: 'safe_defaults', values: { n: 1 } });
    const res = await adapter.browse({ table: 'safe_defaults', limit: 10, offset: 0 });
    expect(res.rows[0]?.label).toBe("it's ok");

    await expect(
      adapter.createTable({
        table: 'evil_defaults',
        columns: [
          {
            name: 'x',
            type: 'TEXT',
            nullable: true,
            primaryKey: false,
            autoIncrement: false,
            defaultValue: "'a'); DROP TABLE users;--",
          },
        ],
      }),
    ).rejects.toThrow(BadRequestError);
    // the injection never ran
    const after = await adapter.browse({ table: 'users', limit: 10, offset: 0 });
    expect(after.total).toBe(2);
  });

  it('rejects AUTOINCREMENT combined with a composite primary key', async () => {
    await expect(
      adapter.createTable({
        table: 'bad_pk',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, primaryKey: true, autoIncrement: true },
          { name: 'other', type: 'TEXT', nullable: false, primaryKey: true, autoIncrement: false },
        ],
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('round-trips Buffers through a JSON backup as tagged $bytes', async () => {
    await adapter.query('CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
    const bytes = Buffer.from([0, 1, 2, 250, 255]);
    await adapter.insertRow({ table: 'blobs', values: { id: 1, data: bytes } });

    const json = await adapter.backup({ format: 'json', tables: ['blobs'] });
    expect(json).toContain('"$bytes"');
    expect(json).not.toContain('"type": "Buffer"');

    await adapter.dropTable('blobs');
    await adapter.restore(json, 'json');
    const res = await adapter.browse({ table: 'blobs', limit: 10, offset: 0 });
    const restored = res.rows[0]?.data;
    expect(Buffer.isBuffer(restored)).toBe(true);
    expect(Buffer.compare(restored as Buffer, bytes)).toBe(0);
  });

  it('dumps Buffers as hex literals in SQL backups', async () => {
    await adapter.query('CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
    await adapter.insertRow({
      table: 'blobs',
      values: { id: 1, data: Buffer.from('hi') },
    });
    const dump = await adapter.backup({ format: 'sql', tables: ['blobs'] });
    expect(dump).toContain("X'6869'");
  });
});

describe('assertSafeDefaultValue', () => {
  it('accepts numbers, quoted strings and allowlisted expressions', () => {
    for (const ok of ['0', '-12', '3.25', "''", "'plain'", "'it''s'", 'NULL', 'true', 'CURRENT_TIMESTAMP', 'now()', 'gen_random_uuid()', 'uuid()']) {
      expect(assertSafeDefaultValue(ok)).toBe(ok);
    }
  });

  it('rejects everything else', () => {
    for (const bad of [
      "'a'); DROP TABLE users;--",
      "1; DROP TABLE users",
      '(SELECT secret FROM vault)',
      "'unterminated",
      "'back\\slash'",
      'randomblob(16)',
    ]) {
      expect(() => assertSafeDefaultValue(bad)).toThrow(BadRequestError);
    }
  });
});
