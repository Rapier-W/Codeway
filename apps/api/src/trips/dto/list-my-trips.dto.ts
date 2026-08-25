import { IsIn, IsOptional } from 'class-validator';

export class ListMyTripsDto {
  @IsOptional()
  @IsIn(['joined', 'published'], { message: 'MY_TRIPS_ROLE_INVALID' })
  role?: 'joined' | 'published';
}
