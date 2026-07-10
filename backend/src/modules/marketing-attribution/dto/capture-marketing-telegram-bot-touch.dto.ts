import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const TELEGRAM_ID_REGEX = /^\d+$/;
const SOURCE_EVENT_KEY_REGEX = /^[A-Za-z0-9:_-]{1,180}$/;

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

  @ValidateIf((dto: CaptureMarketingTelegramBotTouchDto) => dto.startParam?.startsWith('ma_'))
  @IsString()
  @Matches(SOURCE_EVENT_KEY_REGEX)
  sourceEventKey?: string;
}
