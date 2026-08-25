import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  // 文本长度上限与 schema 的 @db.VarChar(500) 保持一致。
  @IsString()
  @IsNotEmpty({ message: 'MESSAGE_TEXT_REQUIRED' })
  @MaxLength(500, { message: 'MESSAGE_TEXT_TOO_LONG' })
  text!: string;
}
