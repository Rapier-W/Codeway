import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class ListMessagesDto {
  // 游标分页：只返回该时间点之前的消息，用于向上翻历史。
  @IsOptional()
  @IsISO8601({}, { message: 'MESSAGE_CURSOR_INVALID' })
  before?: string;

  // query 参数是字符串，需要显式转成数字后再校验。
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'MESSAGE_LIMIT_INVALID' })
  @Min(1, { message: 'MESSAGE_LIMIT_INVALID' })
  @Max(100, { message: 'MESSAGE_LIMIT_INVALID' })
  limit?: number;
}
