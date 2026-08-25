import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * 取当前用户 id。
 *
 * 优先读 req.user.id（Task 5 接入真实 Cookie 会话后由 guard 填充），
 * 回退到 x-user-id 请求头（开发联调占位，生产环境必须移除）。
 *
 * 用法：
 *   @Post() create(@CurrentUserId() userId: string) {}        // 必填，缺失返回 403 AUTH_REQUIRED
 *   @Get()  list(@CurrentUserId(false) userId?: string) {}    // 可选，匿名可访问
 *
 * 替代此前各 controller 各写一份 `req.user?.id || headers['x-user-id']` 的做法。
 */
export const CurrentUserId = createParamDecorator((required: boolean | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const raw = request.user?.id ?? request.headers?.['x-user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const userId = typeof value === 'string' ? value.trim() : '';

  if (!userId && required !== false) throw new ForbiddenException('AUTH_REQUIRED');

  return userId || undefined;
});
