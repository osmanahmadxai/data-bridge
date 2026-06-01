/**
 * Shared implementation for relational engines.
 *
 * Concrete SQL adapters (Postgres, MySQL, SQLite, ...) only implement the
 * connection lifecycle, schema introspection, and three small dialect
 * primitives (`quoteIdent`, `placeholder`, `runSql`). Everything user-facing —
 * browse, raw query, and row mutations — is built here ONCE, with strict
 * parameterization so no user value is ever concatenated into SQL.
 */
import type {
  AdapterCapabilities,
  BrowseParams,
  BrowseResult,
  ColumnDefinition,
  ConnectionConfig,
  CreateTableSpec,
  DatabaseAdapter,
  DatabaseEngine,
  DatabaseSchema,
  DeleteRowParams,
  FilterSpec,
  InsertRowParams,
  QueryResult,
  UpdateRowParams,
} from '../types';
import { BadRequestError } from '../../errors';

/** Reject identifiers that aren't safe to embed in DDL (which can't be bound). */
export function assertSafeIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new BadRequestError(
      `Invalid identifier "${name}". Use letters, digits and underscores.`,
    );
  }
  return name;
}

const DEFAULT_MAX_ROWS = 5000;

export abstract class BaseSqlAdapter implements DatabaseAdapter {
  abstract readonly engine: DatabaseEngine;
  abstract readonly capabilities: AdapterCapabilities;

  protected readonly config: ConnectionConfig;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  protected get maxRows(): number {
    const fromOpts = Number(this.config.options?.maxQueryRows);
    return Number.isFinite(fromOpts) && fromOpts > 0
      ? fromOpts
      : DEFAULT_MAX_ROWS;
  }

  /* ----- lifecycle / introspection: implemented by concrete adapters ----- */
  abstract connect(): Promise<void>;
  abstract ping(): Promise<void>;
  abstract close(): Promise<void>;
  abstract listDatabases(): Promise<string[]>;
  abstract getSchema(database?: string): Promise<DatabaseSchema>;

  /* ----- dialect primitives ----- */

  /** Quote an identifier (table/column) safely for this dialect. */
  protected abstract quoteIdent(identifier: string): string;

  /**
   * Render a positional placeholder for the n-th (1-based) parameter.
   * Postgres → `$1`, MySQL/SQLite → `?`.
   */
  protected abstract placeholder(index: number): string;

  /** Execute a parameterized statement and return a normalized result. */
  protected abstract runSql(
    sql: string,
    params: unknown[],
  ): Promise<QueryResult>;

  /** LIKE keyword to use for case-insensitive matching (Postgres → ILIKE). */
  protected likeKeyword(): string {
    return 'LIKE';
  }

  /* ----- shared SQL building ----- */

  protected qualify(table: string, schema?: string): string {
    return schema
      ? `${this.quoteIdent(schema)}.${this.quoteIdent(table)}`
      : this.quoteIdent(table);
  }

  /**
   * Build a parameterized WHERE clause from filters.
   * Returns the SQL fragment (without leading WHERE) and bound params.
   */
  private buildWhere(
    filters: FilterSpec[] | undefined,
    startIndex: number,
  ): { clause: string; params: unknown[] } {
    if (!filters || filters.length === 0) return { clause: '', params: [] };

    const params: unknown[] = [];
    let idx = startIndex;
    const parts = filters.map((f) => {
      const col = this.quoteIdent(f.column);
      switch (f.operator) {
        case 'isNull':
          return `${col} IS NULL`;
        case 'notNull':
          return `${col} IS NOT NULL`;
        case 'eq':
          params.push(f.value);
          return `${col} = ${this.placeholder(idx++)}`;
        case 'neq':
          params.push(f.value);
          return `${col} <> ${this.placeholder(idx++)}`;
        case 'lt':
          params.push(f.value);
          return `${col} < ${this.placeholder(idx++)}`;
        case 'lte':
          params.push(f.value);
          return `${col} <= ${this.placeholder(idx++)}`;
        case 'gt':
          params.push(f.value);
          return `${col} > ${this.placeholder(idx++)}`;
        case 'gte':
          params.push(f.value);
          return `${col} >= ${this.placeholder(idx++)}`;
        case 'contains':
          params.push(`%${String(f.value ?? '')}%`);
          return `${col} ${this.likeKeyword()} ${this.placeholder(idx++)}`;
        case 'startsWith':
          params.push(`${String(f.value ?? '')}%`);
          return `${col} ${this.likeKeyword()} ${this.placeholder(idx++)}`;
        case 'endsWith':
          params.push(`%${String(f.value ?? '')}`);
          return `${col} ${this.likeKeyword()} ${this.placeholder(idx++)}`;
        default:
          throw new BadRequestError(
            `Unsupported filter operator: ${String(f.operator)}`,
          );
      }
    });

    return { clause: parts.join(' AND '), params };
  }

  async browse(params: BrowseParams): Promise<BrowseResult> {
    const limit = Math.min(Math.max(params.limit, 1), this.maxRows);
    const offset = Math.max(params.offset, 0);
    const target = this.qualify(params.table, params.schema);

    const where = this.buildWhere(params.filters, 1);
    const whereSql = where.clause ? ` WHERE ${where.clause}` : '';

    let orderSql = '';
    if (params.sort && params.sort.length > 0) {
      orderSql =
        ' ORDER BY ' +
        params.sort
          .map(
            (s) =>
              `${this.quoteIdent(s.column)} ${
                s.direction === 'desc' ? 'DESC' : 'ASC'
              }`,
          )
          .join(', ');
    }

    // Fetch one extra row to learn whether a next page exists — far cheaper
    // than a COUNT(*) on every page for large tables.
    const probe = limit + 1;
    const sql =
      `SELECT * FROM ${target}${whereSql}${orderSql} ` +
      `LIMIT ${probe} OFFSET ${offset}`;

    const hasFilters = !!params.filters && params.filters.length > 0;
    const [data, count, pk] = await Promise.all([
      this.runSql(sql, where.params),
      this.countRows({
        table: params.table,
        schema: params.schema,
        whereSql,
        whereParams: where.params,
        hasFilters,
      }).catch(() => ({ total: null, estimated: false })),
      this.primaryKeyColumns(params.table, params.schema),
    ]);

    const hasMore = data.rows.length > limit;
    const rows = hasMore ? data.rows.slice(0, limit) : data.rows;

    return {
      ...data,
      rows,
      rowCount: rows.length,
      total: count.total,
      estimated: count.estimated,
      hasMore,
      primaryKey: pk,
    };
  }

  /**
   * Row total for the browse footer. The default runs an exact `COUNT(*)`,
   * which is fine for local engines (SQLite). Server engines override this to
   * use cheap catalog estimates and to skip counting filtered views entirely.
   */
  protected async countRows(args: {
    table: string;
    schema?: string;
    whereSql: string;
    whereParams: unknown[];
    hasFilters: boolean;
  }): Promise<{ total: number | null; estimated: boolean }> {
    const target = this.qualify(args.table, args.schema);
    const res = await this.runSql(
      `SELECT COUNT(*) AS count FROM ${target}${args.whereSql}`,
      args.whereParams,
    );
    const total = res.rows[0] ? Number(res.rows[0].count) : null;
    return { total: Number.isFinite(total) ? total : null, estimated: false };
  }

  async query(statement: string, params?: unknown[]): Promise<QueryResult> {
    const result = await this.runSql(statement, params ?? []);
    if (result.rows.length > this.maxRows) {
      return {
        ...result,
        rows: result.rows.slice(0, this.maxRows),
        rowCount: this.maxRows,
        truncated: true,
      };
    }
    return result;
  }

  async insertRow(p: InsertRowParams): Promise<QueryResult> {
    const cols = Object.keys(p.values);
    if (cols.length === 0) {
      throw new BadRequestError('Cannot insert a row with no values');
    }
    const target = this.qualify(p.table, p.schema);
    const placeholders = cols.map((_, i) => this.placeholder(i + 1));
    const sql =
      `INSERT INTO ${target} (${cols.map((c) => this.quoteIdent(c)).join(', ')}) ` +
      `VALUES (${placeholders.join(', ')})`;
    return this.runSql(
      sql,
      cols.map((c) => p.values[c]),
    );
  }

  async updateRow(p: UpdateRowParams): Promise<QueryResult> {
    const changeCols = Object.keys(p.changes);
    const idCols = Object.keys(p.identity);
    if (changeCols.length === 0) {
      throw new BadRequestError('No changes provided');
    }
    if (idCols.length === 0) {
      throw new BadRequestError(
        'Cannot update a row without a primary key identity',
      );
    }
    const target = this.qualify(p.table, p.schema);
    const params: unknown[] = [];
    let idx = 1;

    const setSql = changeCols
      .map((c) => {
        params.push(p.changes[c]);
        return `${this.quoteIdent(c)} = ${this.placeholder(idx++)}`;
      })
      .join(', ');

    const whereSql = idCols
      .map((c) => {
        params.push(p.identity[c]);
        return `${this.quoteIdent(c)} = ${this.placeholder(idx++)}`;
      })
      .join(' AND ');

    return this.runSql(
      `UPDATE ${target} SET ${setSql} WHERE ${whereSql}`,
      params,
    );
  }

  async deleteRow(p: DeleteRowParams): Promise<QueryResult> {
    const idCols = Object.keys(p.identity);
    if (idCols.length === 0) {
      throw new BadRequestError(
        'Cannot delete a row without a primary key identity',
      );
    }
    const target = this.qualify(p.table, p.schema);
    const params: unknown[] = [];
    const whereSql = idCols
      .map((c, i) => {
        params.push(p.identity[c]);
        return `${this.quoteIdent(c)} = ${this.placeholder(i + 1)}`;
      })
      .join(' AND ');

    return this.runSql(`DELETE FROM ${target} WHERE ${whereSql}`, params);
  }

  /* ----- schema management (DDL) ----- */

  /** Auto-increment keyword appended after the type (MySQL → AUTO_INCREMENT). */
  protected autoIncrementKeyword(): string | null {
    return null;
  }

  /** Serial pseudo-type that replaces the column type (Postgres → SERIAL). */
  protected serialType(): string | null {
    return null;
  }

  /** Validate a raw column type string (it cannot be a bound parameter). */
  protected validateType(type: string): string {
    const t = type.trim();
    if (!/^[A-Za-z0-9_ (),]+$/.test(t)) {
      throw new BadRequestError(`Invalid column type: "${type}"`);
    }
    return t;
  }

  protected columnSql(col: ColumnDefinition): string {
    const name = this.quoteIdent(assertSafeIdentifier(col.name));
    let typeSql = this.validateType(col.type);
    if (col.autoIncrement && this.serialType()) typeSql = this.serialType()!;
    let sql = `${name} ${typeSql}`;
    if (col.autoIncrement && this.autoIncrementKeyword()) {
      sql += ` ${this.autoIncrementKeyword()}`;
    }
    if (!col.nullable) sql += ' NOT NULL';
    if (col.unique && !col.primaryKey) sql += ' UNIQUE';
    if (col.defaultValue && col.defaultValue.trim()) {
      sql += ` DEFAULT ${col.defaultValue.trim()}`;
    }
    return sql;
  }

  async createTable(spec: CreateTableSpec): Promise<void> {
    if (!spec.columns.length) {
      throw new BadRequestError('A table needs at least one column');
    }
    const target = this.qualify(
      assertSafeIdentifier(spec.table),
      spec.schema ? assertSafeIdentifier(spec.schema) : undefined,
    );
    const parts = spec.columns.map((c) => this.columnSql(c));
    const pk = spec.columns
      .filter((c) => c.primaryKey)
      .map((c) => this.quoteIdent(c.name));
    if (pk.length) parts.push(`PRIMARY KEY (${pk.join(', ')})`);
    await this.runSql(`CREATE TABLE ${target} (${parts.join(', ')})`, []);
  }

  async dropTable(table: string, schema?: string): Promise<void> {
    await this.runSql(`DROP TABLE ${this.qualify(table, schema)}`, []);
  }

  async truncateTable(table: string, schema?: string): Promise<void> {
    await this.runSql(`TRUNCATE TABLE ${this.qualify(table, schema)}`, []);
  }

  async createDatabase(name: string): Promise<void> {
    await this.runSql(
      `CREATE DATABASE ${this.quoteIdent(assertSafeIdentifier(name))}`,
      [],
    );
  }

  async dropDatabase(name: string): Promise<void> {
    await this.runSql(
      `DROP DATABASE ${this.quoteIdent(assertSafeIdentifier(name))}`,
      [],
    );
  }

  /**
   * Primary-key columns for a relation, used to build safe row identities.
   * Default implementation derives them from the schema introspection; engines
   * may override for efficiency.
   */
  protected async primaryKeyColumns(
    table: string,
    schema?: string,
  ): Promise<string[]> {
    const dbSchema = await this.getSchema();
    for (const ns of dbSchema.namespaces) {
      if (schema && ns.name !== schema) continue;
      const found = ns.tables.find((t) => t.name === table);
      if (found) return found.primaryKey;
    }
    return [];
  }
}
