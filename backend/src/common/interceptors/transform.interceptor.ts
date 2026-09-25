import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
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
        let detail = err instanceof Error ? err.message : String(err);
        if (err instanceof HttpException) {
          const res = err.getResponse();
          if (typeof res === 'string') detail = res;
          else if (res && typeof res === 'object') {
            const msg = (res as { message?: string | string[] }).message;
            if (Array.isArray(msg)) detail = msg.join('; ');
            else if (typeof msg === 'string') detail = msg;
          }
        }
        this.logger.error(`Request pipeline error: ${detail}`);
        throw err;
      }),
    );
  }
}
