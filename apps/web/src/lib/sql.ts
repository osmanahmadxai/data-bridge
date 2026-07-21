import type { DatabaseEngine } from '@syncle/core';

/** quote an identifier for the given engine's dialect */
export function quoteIdent(engine: DatabaseEngine, id: string): string {
  if (engine === 'mysql') return `\`${id.replace(/`/g, '``')}\``;
  return `"${id.replace(/"/g, '""')}"`;
}

/**
 * build a safe, dialect-quoted `SELECT *` for a relation. backs the
 * "open in query editor" action so users don't have to remember quoting rules
 * (e.g. PostgreSQL folding unquoted `User` to `user`)
 */
export function buildSelect(
  engine: DatabaseEngine,
  table: string,
  schema?: string,
  limit = 100,
): string {
  const target = schema
    ? `${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`
    : quoteIdent(engine, table);
  return `SELECT * FROM ${target} LIMIT ${limit};`;
}
