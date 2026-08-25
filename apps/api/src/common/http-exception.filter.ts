import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/**
 * 统一错误响应结构：{ code, message, statusCode }。
 *
 * 背景：业务层用 `throw new BadRequestException('TRIP_CAPACITY_INVALID')` 抛错误码，
 * 但 Nest 默认把它放进 `message` 字段，前端读 `body.code` 取不到，只能 fallback 成
 * 通用文案。这里把错误码收敛到 `code`，并保留可展示的 `message`。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const { code, message, details } = this.describe(exception, statusCode);

    // 5xx 记录完整堆栈便于排查；4xx 属于预期的业务拒绝，不刷日志。
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request?.method} ${request?.url} -> ${code}`, exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(statusCode).json({ code, message, statusCode, ...(details ? { details } : {}) });
  }

  private describe(exception: unknown, statusCode: number): { code: string; message: string; details?: string[] } {
    if (!(exception instanceof HttpException)) {
      // 未预期的异常不把内部细节返回给客户端。
      return { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后再试' };
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { code: this.toCode(payload, statusCode), message: payload };
    }

    if (payload && typeof payload === 'object') {
      const body = payload as { code?: unknown; message?: unknown; error?: unknown };

      // ValidationPipe 的 message 是字符串数组，首条作为错误码，全部作为 details 返回。
      if (Array.isArray(body.message)) {
        const messages = body.message.map(String);
        return { code: this.toCode(messages[0] ?? '', statusCode), message: messages[0] ?? '请求参数有误', details: messages };
      }

      const raw = typeof body.code === 'string' ? body.code : typeof body.message === 'string' ? body.message : String(body.error ?? '');
      return { code: this.toCode(raw, statusCode), message: typeof body.message === 'string' ? body.message : raw };
    }

    return { code: this.fallbackCode(statusCode), message: exception.message };
  }

  /** 业务层抛的错误码形如 TRIP_CAPACITY_INVALID，据此判断是否为可直接返回的错误码。 */
  private toCode(raw: string, statusCode: number): string {
    return /^[A-Z][A-Z0-9_]*$/.test(raw) ? raw : this.fallbackCode(statusCode);
  }

  private fallbackCode(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST: return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED: return 'AUTH_REQUIRED';
      case HttpStatus.FORBIDDEN: return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND: return 'NOT_FOUND';
      case HttpStatus.CONFLICT: return 'STATE_CONFLICT';
      case HttpStatus.PAYLOAD_TOO_LARGE: return 'PAYLOAD_TOO_LARGE';
      case HttpStatus.TOO_MANY_REQUESTS: return 'RATE_LIMITED';
      default: return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    }
  }
}
