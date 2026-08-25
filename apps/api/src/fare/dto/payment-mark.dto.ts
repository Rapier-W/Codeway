import { IsInt, IsOptional, Min } from 'class-validator';

export class PaymentMarkDto {
  // 金额以整数分保存；不传表示不记录具体金额。
  @IsOptional()
  @IsInt({ message: 'PAYMENT_AMOUNT_INVALID' })
  @Min(0, { message: 'PAYMENT_AMOUNT_INVALID' })
  amountCents?: number;
}
