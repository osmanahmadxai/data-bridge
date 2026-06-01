/**
 * Typed client for the Relay NestJS API. Unwraps the `{ data }` envelope and
 * throws a structured {@link ApiError} on `{ error }` responses.
 */
import type {
  BrowseParams,
  BrowseResult,
  ConnectionConfig,
  ConnectionInputDTO,
  CreateTableSpec,
  DatabaseSchema,
  DeleteRowParams,
  DriverInfo,
  InsertRowParams,
  QueryResult,
  UpdateRowParams,
} from '@relay/core';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new ApiError(
      `Cannot reach the Relay API at ${BASE_URL}. Is it running?`,
      'NETWORK',
      0,
      (err as Error).message,
    );
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body?.error ?? {};
    throw new ApiError(
      error.message ?? `Request failed (${res.status})`,
      error.code ?? 'UNKNOWN',
      res.status,
      error.details,
    );
  }
  return body.data as T;
}

function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

export const api = {
  listDrivers: () => request<DriverInfo[]>('/drivers'),

  listConnections: () => request<ConnectionConfig[]>('/connections'),
  getConnection: (id: string) =>
    request<ConnectionConfig>(`/connections/${id}`),
  createConnection: (input: ConnectionInputDTO) =>
    request<ConnectionConfig>('/connections', {
      method: 'POST',
      ...jsonBody(input),
    }),
  updateConnection: (id: string, input: ConnectionInputDTO) =>
    request<ConnectionConfig>(`/connections/${id}`, {
      method: 'PUT',
      ...jsonBody(input),
    }),
  deleteConnection: (id: string) =>
    request<{ id: string }>(`/connections/${id}`, { method: 'DELETE' }),
  testConnection: (input: ConnectionInputDTO) =>
    request<{ success: true }>('/connections/test', {
      method: 'POST',
      ...jsonBody(input),
    }),
  testSavedConnection: (id: string) =>
    request<{ success: true }>(`/connections/${id}/test`, { method: 'POST' }),

  listDatabases: (id: string) =>
    request<string[]>(`/connections/${id}/databases`),
  getSchema: (id: string, database?: string) =>
    request<DatabaseSchema>(`/connections/${id}/schema${dbQuery(database)}`),
  browse: (id: string, params: BrowseParams, database?: string) =>
    request<BrowseResult>(`/connections/${id}/browse${dbQuery(database)}`, {
      method: 'POST',
      ...jsonBody(params),
    }),
  runQuery: (
    id: string,
    statement: string,
    params?: unknown[],
    database?: string,
  ) =>
    request<QueryResult>(`/connections/${id}/query${dbQuery(database)}`, {
      method: 'POST',
      ...jsonBody({ statement, params }),
    }),
  insertRow: (id: string, params: InsertRowParams, database?: string) =>
    request<QueryResult>(`/connections/${id}/rows${dbQuery(database)}`, {
      method: 'POST',
      ...jsonBody(params),
    }),
  updateRow: (id: string, params: UpdateRowParams, database?: string) =>
    request<QueryResult>(`/connections/${id}/rows${dbQuery(database)}`, {
      method: 'PATCH',
      ...jsonBody(params),
    }),
  deleteRow: (id: string, params: DeleteRowParams, database?: string) =>
    request<QueryResult>(`/connections/${id}/rows${dbQuery(database)}`, {
      method: 'DELETE',
      ...jsonBody(params),
    }),

  createDatabase: (id: string, name: string) =>
    request<{ success: true }>(`/connections/${id}/ddl/database`, {
      method: 'POST',
      ...jsonBody({ name }),
    }),
  dropDatabase: (id: string, name: string) =>
    request<{ success: true }>(`/connections/${id}/ddl/drop-database`, {
      method: 'POST',
      ...jsonBody({ name }),
    }),
  createTable: (id: string, spec: CreateTableSpec, database?: string) =>
    request<{ success: true }>(
      `/connections/${id}/ddl/table${dbQuery(database)}`,
      { method: 'POST', ...jsonBody(spec) },
    ),
  dropTable: (
    id: string,
    table: string,
    schema?: string,
    database?: string,
  ) =>
    request<{ success: true }>(
      `/connections/${id}/ddl/drop-table${dbQuery(database)}`,
      { method: 'POST', ...jsonBody({ table, schema }) },
    ),
  truncateTable: (
    id: string,
    table: string,
    schema?: string,
    database?: string,
  ) =>
    request<{ success: true }>(
      `/connections/${id}/ddl/truncate-table${dbQuery(database)}`,
      { method: 'POST', ...jsonBody({ table, schema }) },
    ),
};

function dbQuery(database?: string): string {
  return database ? `?database=${encodeURIComponent(database)}` : '';
}
