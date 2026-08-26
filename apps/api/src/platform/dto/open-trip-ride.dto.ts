import { IsIn } from 'class-validator';
import { RIDE_PLATFORMS, RidePlatform } from '../../ride/ride-adapter';

export class OpenTripRideDto {
  @IsIn(RIDE_PLATFORMS, { message: 'RIDE_PLATFORM_INVALID' })
  platform!: RidePlatform;
}
