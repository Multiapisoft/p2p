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
    let code: string | undefined;

    try {
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
          if (typeof resp.code === 'string' && resp.code.trim()) {
            code = resp.code;
          }
        }
      } else if (exception instanceof Error) {
        this.logger.error(
          `${request?.method ?? '?'} ${request?.url ?? '?'} → ${exception.message}`,
          exception.stack,
        );
        const errName = exception.name || '';
        const errMsg = exception.message || '';
        if (
          errName === 'ValidationError' ||
          errMsg.toLowerCase().includes('validation failed')
        ) {
          status = HttpStatus.BAD_REQUEST;
          message =
            'Could not save payment. Check UTR and proof, then try again.';
        } else if (errMsg.includes('E11000') || errMsg.toLowerCase().includes('duplicate key')) {
          status = HttpStatus.BAD_REQUEST;
          message = 'This reference is already used. Enter a unique UTR / TxID.';
        } else if (process.env.NODE_ENV !== 'production') {
          message = errMsg || message;
        }
      } else {
        this.logger.error(
          `${request?.method ?? '?'} ${request?.url ?? '?'} → unknown error`,
          String(exception),
        );
      }

      if (!response.headersSent) {
        response.status(status).json({
          success: false,
          message: Array.isArray(errors)
            ? (errors as unknown[]).filter(Boolean).join(', ')
            : message,
          statusCode: status,
          ...(code ? { code } : {}),
        });
      }
    } catch (filterErr) {
      this.logger.error(
        `Exception filter failed: ${filterErr instanceof Error ? filterErr.message : String(filterErr)}`,
      );
      if (!response.headersSent) {
        try {
          response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Internal server error',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          });
        } catch {
          /* ignore */
        }
      }
    }
  }
}
