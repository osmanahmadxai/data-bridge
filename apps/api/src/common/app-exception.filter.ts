import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '@relay/core';

/**
 * Maps domain {@link AppError}s (and any uncaught error) to a consistent JSON
 * envelope: `{ error: { code, message, details } }`. NestJS HttpExceptions
 * (e.g. validation failures) are passed through with their own status.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Relay');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      if (exception.status >= 500) this.logger.error(exception.message);
      res.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details ?? null,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json({
        error: {
          code: 'BAD_REQUEST',
          message:
            typeof body === 'string'
              ? body
              : ((body as { message?: string }).message ?? 'Request failed'),
          details: typeof body === 'object' ? body : null,
        },
      });
      return;
    }

    this.logger.error(exception);
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: null,
      },
    });
  }
}
