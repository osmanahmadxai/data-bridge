import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** wraps every successful response in a `{ data }` envelope */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { data: T }> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ data: T }> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
