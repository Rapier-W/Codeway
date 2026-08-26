import { IsIn, IsInt, Max, Min } from 'class-validator';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export class CreateFareScreenshotUploadDto {
  @IsIn(ALLOWED_MIME_TYPES, { message: 'SCREENSHOT_FORMAT_NOT_ALLOWED' })
  mimeType!: string;

  @IsInt({ message: 'SCREENSHOT_SIZE_INVALID' })
  @Min(1, { message: 'SCREENSHOT_SIZE_INVALID' })
  @Max(MAX_SCREENSHOT_BYTES, { message: 'SCREENSHOT_SIZE_INVALID' })
  sizeBytes!: number;
}
