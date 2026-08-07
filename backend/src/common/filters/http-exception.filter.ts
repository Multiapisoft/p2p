import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        const raw = resp.message;
        if (Array.isArray(raw)) {
          message = raw.filter(Boolean).join(', ') || message;
          errors = raw;
        } else if (typeof raw === 'string' && raw.trim()) {
          message = raw;
        } else if (typeof resp.error === 'string' && resp.error.trim()) {
          message = resp.error;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `${request?.method ?? '?'} ${request?.url ?? '?'} → ${exception.message}`,
        exception.stack,
      );
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message || message;
      }
    } else {
      this.logger.error(
        `${request?.method ?? '?'} ${request?.url ?? '?'} → unknown error`,
        String(exception),
      );
    }

    response.status(status).json({
      success: false,
      message: Array.isArray(errors) ? (errors as unknown[]).filter(Boolean).join(', ') : message,
      statusCode: status,
    });
  }
}
