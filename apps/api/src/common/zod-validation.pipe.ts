import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates and narrows a request payload with a Zod schema, reusing the same
 * schemas shared with the web client (`@relay/core`). Usage:
 *   `@Body(new ZodValidationPipe(schema)) body: Dto`
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.flatten(),
      });
    }
    return result.data;
  }
}
