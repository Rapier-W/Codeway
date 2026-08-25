import { IsBoolean, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTripDto {
  @IsString()
  @IsNotEmpty({ message: 'ORIGIN_AND_DESTINATION_REQUIRED' })
  @MaxLength(120)
  origin!: string;

  @IsString()
  @IsNotEmpty({ message: 'ORIGIN_AND_DESTINATION_REQUIRED' })
  @MaxLength(120)
  destination!: string;

  // 出发时间必须是 ISO8601；「必须晚于当前时间」由 service 判定，避免在 DTO 里做时间比较。
  @IsISO8601({}, { message: 'DEPART_TIME_MUST_BE_FUTURE' })
  departTime!: string;

  // MVP 单车总人数 3 或 4（含发单人）。
  @IsInt({ message: 'TRIP_CAPACITY_INVALID' })
  @Min(3, { message: 'TRIP_CAPACITY_INVALID' })
  @Max(4, { message: 'TRIP_CAPACITY_INVALID' })
  capacity!: number;

  @IsOptional()
  feePlan?: unknown;

  @IsOptional()
  @IsBoolean()
  femaleOnly?: boolean;
}
