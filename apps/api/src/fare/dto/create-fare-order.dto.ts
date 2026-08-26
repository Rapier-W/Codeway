import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateFareOrderDto {
  @IsUUID('4', { message: 'SCREENSHOT_UPLOAD_INVALID' })
  screenshotUploadId!: string;

  // 金额以整数分保存，避免浮点误差。
  @IsInt({ message: 'FARE_AMOUNT_INVALID' })
  @Min(0, { message: 'FARE_AMOUNT_INVALID' })
  actualTotalFareCents!: number;
}
