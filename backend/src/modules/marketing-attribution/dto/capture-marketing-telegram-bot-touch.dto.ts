import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { MARKETING_SOURCE_EVENT_KEY_REGEX } from '../marketing-attribution.types';

const TELEGRAM_ID_REGEX = /^\d+$/;

export class CaptureMarketingTelegramBotTouchDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsString()
  @Matches(TELEGRAM_ID_REGEX)
  telegramId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  startParam?: string;

  @ValidateIf(
    (dto: CaptureMarketingTelegramBotTouchDto) =>
      typeof dto.startParam === 'string' && dto.startParam.startsWith('ma_'),
  )
  @IsString()
  @Matches(MARKETING_SOURCE_EVENT_KEY_REGEX)
  sourceEventKey?: string;
}
