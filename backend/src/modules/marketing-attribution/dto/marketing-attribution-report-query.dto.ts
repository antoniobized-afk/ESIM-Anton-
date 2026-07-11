import { MarketingTouchChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MARKETING_ATTRIBUTION_MODELS,
  MARKETING_ATTRIBUTION_ORDER_SOURCES,
  MARKETING_REPORT_DATE_PATTERN,
  type MarketingAttributionModel,
  type MarketingAttributionOrderSource,
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

export class MarketingAttributionOrderDetailsQueryDto extends MarketingAttributionReportQueryDto {
  @IsIn(MARKETING_ATTRIBUTION_ORDER_SOURCES)
  source!: MarketingAttributionOrderSource;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'campaignId должен быть непустым идентификатором' })
  @MaxLength(191)
  campaignId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
