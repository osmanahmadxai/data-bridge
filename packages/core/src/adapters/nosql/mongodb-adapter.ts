/**
 * MongoDB adapter. Collections map to "tables"; documents map to rows. Schema
 * is inferred by sampling documents (Mongo is schemaless). The query editor
 * speaks a small JSON dialect — see {@link MongodbAdapter.query}.
 */
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type {
  AdapterCapabilities,
  BrowseParams,
  BrowseResult,
  ColumnSchema,
  ConnectionConfig,
  CreateTableSpec,
  DatabaseAdapter,
  DatabaseSchema,
  DeleteRowParams,
  FilterSpec,
  InsertRowParams,
  QueryResult,
  TableSchema,
  UpdateRowParams,
} from '../types';
import {
  BadRequestError,
  ConnectionError,
  QueryError,
  UnsupportedError,
} from '../../errors';

export const MONGODB_CAPABILITIES: AdapterCapabilities = {
  query: true,
  queryLanguage: 'mongo',
  schemas: false,
  multipleDatabases: true,
  foreignKeys: false,
  rowEditing: true,
  transactions: false,
  // Collections behave like tables (create/drop/empty); databases are created
  // implicitly by adding a collection, so we don't expose explicit DB creation.
  ddl: true,
  manageDatabases: false,
};

const SAMPLE_SIZE = 50;
const DEFAULT_LIMIT = 100;

export class MongodbAdapter implements DatabaseAdapter {
  readonly engine = 'mongodb' as const;
  readonly capabilities = MONGODB_CAPABILITIES;

  private readonly config: ConnectionConfig;
  private client: MongoClient | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  private uri(): string {
    if (this.config.connectionString) return this.config.connectionString;
    const auth =
      this.config.user && this.config.password
        ? `${encodeURIComponent(this.config.user)}:${encodeURIComponent(
            this.config.password,
          )}@`
        : '';
    const host = this.config.host ?? 'localhost';
    const port = this.config.port ?? 27017;
    return `mongodb://${auth}${host}:${port}`;
  }

  private async getClient(): Promise<MongoClient> {
    if (this.client) return this.client;
    try {
      this.client = new MongoClient(this.uri(), {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 5,
      });
      await this.client.connect();
      return this.client;
    } catch (err) {
      this.client = null;
      throw new ConnectionError(
        `Could not connect to MongoDB: ${(err as Error).message}`,
      );
    }
  }

  private async getDb(name?: string): Promise<Db> {
    const client = await this.getClient();
    const dbName = name ?? this.config.database ?? 'test';
    return client.db(dbName);
  }

  async connect(): Promise<void> {
    await this.getClient();
  }

  async ping(): Promise<void> {
    const db = await this.getDb();
    await db.command({ ping: 1 });
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }

  async listDatabases(): Promise<string[]> {
    const client = await this.getClient();
    const res = await client.db().admin().listDatabases();
    return res.databases.map((d) => d.name);
  }

  async getSchema(database?: string): Promise<DatabaseSchema> {
    const db = await this.getDb(database);
    const collections = await db.listCollections().toArray();
    const tables: TableSchema[] = [];

    for (const coll of collections) {
      const sample = await db
        .collection(coll.name)
        .find({}, { limit: SAMPLE_SIZE })
        .toArray();
      const fields = inferColumns(sample);
      const estimated = await db
        .collection(coll.name)
        .estimatedDocumentCount()
        .catch(() => null);
      tables.push({
        name: coll.name,
        kind: 'collection',
        columns: fields,
        indexes: [],
        foreignKeys: [],
        primaryKey: ['_id'],
        estimatedRows: estimated,
        comment: null,
      });
    }

    return {
      database: db.databaseName,
      namespaces: [{ name: '', tables }],
    };
  }

  async browse(params: BrowseParams): Promise<BrowseResult> {
    const db = await this.getDb(params.schema);
    const coll = db.collection(params.table);
    const limit = Math.min(Math.max(params.limit, 1), 1000);
    const filter = buildMongoFilter(params.filters);
    const sort: Record<string, 1 | -1> = {};
    for (const s of params.sort ?? []) {
      sort[s.column] = s.direction === 'desc' ? -1 : 1;
    }

    const hasFilters = Object.keys(filter).length > 0;
    const started = performance.now();
    // Probe one extra doc to detect a next page without a full count.
    const cursor = coll.find(filter).skip(params.offset).limit(limit + 1);
    if (Object.keys(sort).length > 0) cursor.sort(sort);
    const probed = await cursor.toArray();
    const hasMore = probed.length > limit;
    const docs = hasMore ? probed.slice(0, limit) : probed;

    // estimatedDocumentCount is O(1) on the collection metadata; the exact
    // countDocuments is only used when a filter is applied.
    const total = hasFilters
      ? await coll.countDocuments(filter).catch(() => null)
      : await coll.estimatedDocumentCount().catch(() => null);

    const rows = docs.map(normalizeDoc);
    return {
      columns: inferColumns(docs).map((c) => ({ name: c.name })),
      rows,
      rowCount: rows.length,
      executionMs: Math.round(performance.now() - started),
      command: 'find',
      total,
      estimated: !hasFilters,
      hasMore,
      primaryKey: ['_id'],
    };
  }

  /**
   * Executes a JSON command document:
   *   { "collection": "users", "find": { "active": true },
   *     "sort": { "createdAt": -1 }, "limit": 20 }
   *   { "collection": "orders", "aggregate": [ { "$group": ... } ] }
   *   { "collection": "users", "countDocuments": { } }
   */
  async query(statement: string): Promise<QueryResult> {
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(statement);
    } catch {
      throw new BadRequestError(
        'MongoDB query must be a JSON command document, e.g. ' +
          '{ "collection": "users", "find": {} }',
      );
    }
    const collName = spec.collection;
    if (typeof collName !== 'string') {
      throw new BadRequestError('Query document requires a "collection" field');
    }
    const db = await this.getDb();
    const coll = db.collection(collName);
    const started = performance.now();

    try {
      if (spec.aggregate) {
        const pipeline = spec.aggregate as Record<string, unknown>[];
        const docs = await coll.aggregate(pipeline).limit(1000).toArray();
        return finalize(docs, started, 'aggregate');
      }
      if ('countDocuments' in spec) {
        const count = await coll.countDocuments(
          (spec.countDocuments as Record<string, unknown>) ?? {},
        );
        return {
          columns: [{ name: 'count' }],
          rows: [{ count }],
          rowCount: 1,
          executionMs: Math.round(performance.now() - started),
          command: 'countDocuments',
        };
      }
      const filter = (spec.find as Record<string, unknown>) ?? {};
      const cursor = coll
        .find(filter)
        .limit(Number(spec.limit ?? DEFAULT_LIMIT));
      if (spec.sort) cursor.sort(spec.sort as Record<string, 1 | -1>);
      const docs = await cursor.toArray();
      return finalize(docs, started, 'find');
    } catch (err) {
      throw new QueryError((err as Error).message);
    }
  }

  async insertRow(p: InsertRowParams): Promise<QueryResult> {
    const db = await this.getDb(p.schema);
    const res = await db.collection(p.table).insertOne(p.values);
    return writeResult(res.acknowledged ? 1 : 0, 'insertOne');
  }

  async updateRow(p: UpdateRowParams): Promise<QueryResult> {
    const db = await this.getDb(p.schema);
    const res = await db
      .collection(p.table)
      .updateOne(coerceId(p.identity), { $set: p.changes });
    return writeResult(res.modifiedCount, 'updateOne');
  }

  async deleteRow(p: DeleteRowParams): Promise<QueryResult> {
    const db = await this.getDb(p.schema);
    const res = await db.collection(p.table).deleteOne(coerceId(p.identity));
    return writeResult(res.deletedCount, 'deleteOne');
  }

  /* ----- schema management ----- */

  async createTable(spec: CreateTableSpec): Promise<void> {
    const db = await this.getDb(spec.schema);
    await db.createCollection(spec.table);
  }

  async dropTable(table: string, schema?: string): Promise<void> {
    const db = await this.getDb(schema);
    await db.collection(table).drop();
  }

  async truncateTable(table: string, schema?: string): Promise<void> {
    const db = await this.getDb(schema);
    await db.collection(table).deleteMany({});
  }

  async createDatabase(): Promise<void> {
    throw new UnsupportedError(
      'MongoDB creates databases automatically when the first collection is added.',
    );
  }

  async dropDatabase(name: string): Promise<void> {
    const client = await this.getClient();
    await client.db(name).dropDatabase();
  }
}

/* ----- helpers ----- */

function coerceId(identity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...identity };
  if (typeof out._id === 'string' && ObjectId.isValid(out._id)) {
    out._id = new ObjectId(out._id);
  }
  return out;
}

function normalizeDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    out[k] = v instanceof ObjectId ? v.toHexString() : v;
  }
  return out;
}

function inferColumns(docs: Record<string, unknown>[]): ColumnSchema[] {
  const seen = new Map<string, string>();
  for (const doc of docs) {
    for (const [k, v] of Object.entries(doc)) {
      if (!seen.has(k)) seen.set(k, jsType(v));
    }
  }
  return [...seen.entries()].map(([name, dataType]) => ({
    name,
    dataType,
    nullable: true,
    isPrimaryKey: name === '_id',
    isUnique: name === '_id',
    isAutoIncrement: false,
    defaultValue: null,
    comment: null,
    references: null,
  }));
}

function jsType(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof ObjectId) return 'objectId';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  return typeof v;
}

function buildMongoFilter(
  filters: FilterSpec[] | undefined,
): Record<string, unknown> {
  if (!filters || filters.length === 0) return {};
  const query: Record<string, unknown> = {};
  for (const f of filters) {
    switch (f.operator) {
      case 'eq':
        query[f.column] = f.value;
        break;
      case 'neq':
        query[f.column] = { $ne: f.value };
        break;
      case 'lt':
        query[f.column] = { $lt: f.value };
        break;
      case 'lte':
        query[f.column] = { $lte: f.value };
        break;
      case 'gt':
        query[f.column] = { $gt: f.value };
        break;
      case 'gte':
        query[f.column] = { $gte: f.value };
        break;
      case 'contains':
        query[f.column] = { $regex: String(f.value ?? ''), $options: 'i' };
        break;
      case 'startsWith':
        query[f.column] = { $regex: `^${String(f.value ?? '')}`, $options: 'i' };
        break;
      case 'endsWith':
        query[f.column] = { $regex: `${String(f.value ?? '')}$`, $options: 'i' };
        break;
      case 'isNull':
        query[f.column] = null;
        break;
      case 'notNull':
        query[f.column] = { $ne: null };
        break;
    }
  }
  return query;
}

function finalize(
  docs: Record<string, unknown>[],
  started: number,
  command: string,
): QueryResult {
  const rows = docs.map(normalizeDoc);
  return {
    columns: inferColumns(docs).map((c) => ({ name: c.name })),
    rows,
    rowCount: rows.length,
    executionMs: Math.round(performance.now() - started),
    command,
  };
}

function writeResult(affected: number, command: string): QueryResult {
  return {
    columns: [],
    rows: [],
    rowCount: affected,
    affectedRows: affected,
    executionMs: 0,
    command,
  };
}
