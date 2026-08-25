import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * MVP 仅记录 SOS 事件及通知意图，不持久化精确位置。坐标字段只为兼容客户端
 * 传参而保留，并会在服务层被显式丢弃。
 */
export class CreateSosEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}
