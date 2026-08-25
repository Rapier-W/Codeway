import { IsInt, Max, Min } from 'class-validator';

export class JoinTripDto {
  // 一次加入 1–2 名拼友。
  @IsInt({ message: 'JOIN_MEMBER_COUNT_INVALID' })
  @Min(1, { message: 'JOIN_MEMBER_COUNT_INVALID' })
  @Max(2, { message: 'JOIN_MEMBER_COUNT_INVALID' })
  memberCount!: number;
}
