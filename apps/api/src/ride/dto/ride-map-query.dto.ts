import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const toNumber = ({ value }: { value: unknown }) => value === '' ? Number.NaN : Number(value);

export class RideMapQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'MAP_KEYWORD_REQUIRED' })
  @MaxLength(80, { message: 'MAP_KEYWORD_INVALID' })
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'MAP_CITY_INVALID' })
  city?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'MAP_COORDINATE_INVALID' })
  @Min(-180, { message: 'MAP_COORDINATE_INVALID' })
  @Max(180, { message: 'MAP_COORDINATE_INVALID' })
  originLongitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'MAP_COORDINATE_INVALID' })
  @Min(-90, { message: 'MAP_COORDINATE_INVALID' })
  @Max(90, { message: 'MAP_COORDINATE_INVALID' })
  originLatitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'MAP_COORDINATE_INVALID' })
  @Min(-180, { message: 'MAP_COORDINATE_INVALID' })
  @Max(180, { message: 'MAP_COORDINATE_INVALID' })
  destinationLongitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'MAP_COORDINATE_INVALID' })
  @Min(-90, { message: 'MAP_COORDINATE_INVALID' })
  @Max(90, { message: 'MAP_COORDINATE_INVALID' })
  destinationLatitude?: number;
}
