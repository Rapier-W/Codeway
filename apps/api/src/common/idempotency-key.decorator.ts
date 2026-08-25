import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 幂等键格式限制：避免超长或含控制字符的键写入数据库唯一索引。
 * 不设长度下限——键由客户端生成（通常是 UUID），短键在业务上同样有效。
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_:-]{1,128}$/;

/**
 * 从 Idempotency-Key 请求头读取幂等键。
 *
 * 用法：
 *   @Post() create(@IdempotencyKey() key: string) {}          // 必填，缺失或格式错误返回 400
 *   @Post() create(@IdempotencyKey(false) key?: string) {}     // 可选
 *
 * 替代此前各 controller 手写 `headers['idempotency-key']` 的写法，统一校验与错误码。
 */
export const IdempotencyKey = createParamDecorator((required: boolean | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  // Node 会把请求头名统一转成小写。
  const raw = request.headers?.['idempotency-key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof key === 'string' ? key.trim() : '';
  const isRequired = required !== false;

  if (!trimmed) {
    if (isRequired) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    return undefined;
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) throw new BadRequestException('IDEMPOTENCY_KEY_INVALID');

  return trimmed;
});
