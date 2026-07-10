import { MarketingTouchChannel } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, Matches } from 'class-validator';
import {
  MARKETING_ATTRIBUTION_MODELS,
  MARKETING_REPORT_DATE_PATTERN,
  type MarketingAttributionModel,
} from '@shared/marketing-attribution-report';

export { MARKETING_ATTRIBUTION_MODELS } from '@shared/marketing-attribution-report';
export type { MarketingAttributionModel } from '@shared/marketing-attribution-report';

export class MarketingAttributionReportQueryDto {
  @IsOptional()
  @Matches(MARKETING_REPORT_DATE_PATTERN, { message: 'dateFrom должен быть в формате YYYY-MM-DD' })
  @IsDateString({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @Matches(MARKETING_REPORT_DATE_PATTERN, { message: 'dateTo должен быть в формате YYYY-MM-DD' })
  @IsDateString({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsEnum(MarketingTouchChannel)
  channel?: MarketingTouchChannel;

  @IsOptional()
  @IsIn(MARKETING_ATTRIBUTION_MODELS)
  model?: MarketingAttributionModel;
}
