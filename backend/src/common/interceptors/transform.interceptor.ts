import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  private readonly logger = new Logger(TransformInterceptor.name);

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return { success: true, message: 'Success', data };
      }),
      catchError((err) => {
        this.logger.error(
          `Request pipeline error: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }),
    );
  }
}
