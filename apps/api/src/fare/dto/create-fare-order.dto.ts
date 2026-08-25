import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

// 订单截图仅允许 PNG/JPEG/WebP，单张不超过 10MB。
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export class CreateFareOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'SCREENSHOT_REQUIRED' })
  @MaxLength(512)
  screenshotKey!: string;

  @IsIn(ALLOWED_MIME_TYPES, { message: 'SCREENSHOT_FORMAT_NOT_ALLOWED' })
  mimeType!: string;

  @IsInt({ message: 'SCREENSHOT_SIZE_INVALID' })
  @Min(0, { message: 'SCREENSHOT_SIZE_INVALID' })
  @Max(MAX_SCREENSHOT_BYTES, { message: 'SCREENSHOT_SIZE_INVALID' })
  sizeBytes!: number;

  // 金额以整数分保存，避免浮点误差。
  @IsInt({ message: 'FARE_AMOUNT_INVALID' })
  @Min(0, { message: 'FARE_AMOUNT_INVALID' })
  actualTotalFareCents!: number;
}
