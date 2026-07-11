export const MARKETING_ATTRIBUTION_MODELS = ['FIRST_TOUCH', 'LAST_TOUCH'] as const;

export type MarketingAttributionModel = (typeof MARKETING_ATTRIBUTION_MODELS)[number];

export const MARKETING_ATTRIBUTION_ORDER_SOURCES = ['CAMPAIGN', 'DIRECT'] as const;

export type MarketingAttributionOrderSource =
  (typeof MARKETING_ATTRIBUTION_ORDER_SOURCES)[number];

export const MARKETING_ATTRIBUTION_DEFAULT_MODEL: MarketingAttributionModel = 'LAST_TOUCH';

export const MARKETING_ATTRIBUTION_MODEL_LABELS: Record<MarketingAttributionModel, string> = {
  FIRST_TOUCH: 'Первое касание',
  LAST_TOUCH: 'Последнее касание',
};

export const MARKETING_TOUCH_CHANNELS = [
  'WEB',
  'TELEGRAM_BOT',
  'TELEGRAM_MINI_APP',
] as const;

export type MarketingTouchChannel = (typeof MARKETING_TOUCH_CHANNELS)[number];

export const MARKETING_TOUCH_CHANNEL_LABELS: Record<MarketingTouchChannel, string> = {
  WEB: 'Web',
  TELEGRAM_BOT: 'Telegram Bot',
  TELEGRAM_MINI_APP: 'Telegram Mini App',
};

export const MARKETING_REPORT_DEFAULT_RANGE_DAYS = 30;
export const MARKETING_REPORT_MAX_RANGE_DAYS = 366;

export const MARKETING_REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getMarketingAttributionModelLabel(model: MarketingAttributionModel): string {
  return MARKETING_ATTRIBUTION_MODEL_LABELS[model];
}

export function getMarketingTouchChannelLabel(channel: MarketingTouchChannel): string {
  return MARKETING_TOUCH_CHANNEL_LABELS[channel];
}

export function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseUtcDateOnly(value: string): Date | null {
  if (!MARKETING_REPORT_DATE_PATTERN.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && formatUtcDate(date) === value ? date : null;
}

export function isValidUtcDateOnly(
  value: string | null | undefined,
): value is string {
  return typeof value === 'string' && parseUtcDateOnly(value) !== null;
}

export function getDefaultMarketingReportDateRange(referenceDate = new Date()): {
  dateFrom: string;
  dateTo: string;
} {
  const dateTo = formatUtcDate(referenceDate);
  const from = new Date(`${dateTo}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - (MARKETING_REPORT_DEFAULT_RANGE_DAYS - 1));

  return {
    dateFrom: formatUtcDate(from),
    dateTo,
  };
}

export type MarketingPartnerDisplayInput = {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  referralCode: string;
};

export function formatMarketingPartner(partner: MarketingPartnerDisplayInput): string {
  const fullName = [partner.firstName, partner.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (partner.username) return `@${partner.username}`;
  return partner.referralCode;
}
