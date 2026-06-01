/**
 * Typed error hierarchy. Route handlers map these to HTTP status codes in one
 * place, so domain code can throw meaningfully without knowing about HTTP.
 */

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CONNECTION_FAILED'
  | 'QUERY_FAILED'
  | 'UNSUPPORTED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super('BAD_REQUEST', message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class ConnectionError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONNECTION_FAILED', message, 502, details);
  }
}

export class QueryError extends AppError {
  constructor(message: string, details?: unknown) {
    super('QUERY_FAILED', message, 400, details);
  }
}

export class UnsupportedError extends AppError {
  constructor(message: string) {
    super('UNSUPPORTED', message, 501);
  }
}

/** Normalize any thrown value into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new AppError('INTERNAL', err.message, 500);
  }
  return new AppError('INTERNAL', 'An unexpected error occurred', 500);
}
