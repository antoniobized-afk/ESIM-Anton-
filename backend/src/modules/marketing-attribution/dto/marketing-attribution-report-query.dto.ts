import { MarketingTouchChannel } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, Matches } from 'class-validator';

export const MARKETING_ATTRIBUTION_MODELS = ['FIRST_TOUCH', 'LAST_TOUCH'] as const;
export type MarketingAttributionModel = (typeof MARKETING_ATTRIBUTION_MODELS)[number];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class MarketingAttributionReportQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'dateFrom должен быть в формате YYYY-MM-DD' })
  @IsDateString({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'dateTo должен быть в формате YYYY-MM-DD' })
  @IsDateString({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsEnum(MarketingTouchChannel)
  channel?: MarketingTouchChannel;

  @IsOptional()
  @IsIn(MARKETING_ATTRIBUTION_MODELS)
  model?: MarketingAttributionModel;
}
