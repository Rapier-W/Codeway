import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListTripsDto {
  // 按日期筛选，YYYY-MM-DD。
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'LIST_DATE_INVALID' })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  origin?: string;

  // 按出发时刻筛选，HH:mm。
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'LIST_TIME_INVALID' })
  time?: string;

  // query 参数只会是字符串，这里限定取值而不是用 @IsBoolean。
  @IsOptional()
  @IsIn(['true', 'false', true, false], { message: 'LIST_FEMALE_ONLY_INVALID' })
  femaleOnly?: string | boolean;
}
