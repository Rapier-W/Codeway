import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsUUID(undefined, { message: 'REVIEW_TARGET_INVALID' })
  targetUserId!: string;

  @IsInt() @Min(1) @Max(5)
  punctuality!: number;

  @IsInt() @Min(1) @Max(5)
  communication!: number;

  @IsInt() @Min(1) @Max(5)
  safety!: number;

  @IsInt() @Min(1) @Max(5)
  politeness!: number;

  @IsOptional() @IsString() @MaxLength(500)
  comment?: string;

  @IsOptional() @IsBoolean()
  anonymous?: boolean;
}
