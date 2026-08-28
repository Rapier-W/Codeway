import { IsNotEmpty, IsString } from 'class-validator';

/** 微信小程序登录 DTO：wx.login 返回的临时 code，有效期 5 分钟。 */
export class WechatLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'WECHAT_CODE_REQUIRED' })
  code!: string;
}
