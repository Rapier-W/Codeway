import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { RIDE_PLATFORMS } from '../ride-adapter';

export class CoordinateDto {
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'MAP_COORDINATE_INVALID' })
  @Min(-180, { message: 'MAP_COORDINATE_INVALID' })
  @Max(180, { message: 'MAP_COORDINATE_INVALID' })
  longitude!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'MAP_COORDINATE_INVALID' })
  @Min(-90, { message: 'MAP_COORDINATE_INVALID' })
  @Max(90, { message: 'MAP_COORDINATE_INVALID' })
  latitude!: number;
}

export class OpenRideDto {
  @IsString()
  @IsNotEmpty({ message: 'RIDE_ROUTE_REQUIRED' })
  @MaxLength(120, { message: 'RIDE_ROUTE_INVALID' })
  origin!: string;

  @IsString()
  @IsNotEmpty({ message: 'RIDE_ROUTE_REQUIRED' })
  @MaxLength(120, { message: 'RIDE_ROUTE_INVALID' })
  destination!: string;

  @IsIn(RIDE_PLATFORMS, { message: 'RIDE_PLATFORM_INVALID' })
  platform!: (typeof RIDE_PLATFORMS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  originPoint?: CoordinateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  destinationPoint?: CoordinateDto;

  @IsOptional()
  @IsISO8601({}, { message: 'RIDE_DEPARTURE_INVALID' })
  departureAt?: string;
}
