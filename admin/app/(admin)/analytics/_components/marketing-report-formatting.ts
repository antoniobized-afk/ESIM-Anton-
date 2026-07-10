import type {
  MarketingTouchChannel,
  NumericLike,
} from '@/lib/types'
import type {
  MarketingAttributionModel,
  MarketingCpaReportRow,
} from '@/lib/marketing-attribution-report.types'

export const CHANNEL_LABELS: Record<MarketingTouchChannel, string> = {
  WEB: 'Web',
  TELEGRAM_BOT: 'Telegram bot',
  TELEGRAM_MINI_APP: 'Telegram Mini App',
}

export function formatMarketingModel(model: MarketingAttributionModel) {
  return model === 'FIRST_TOUCH' ? 'Первое касание' : 'Последнее касание'
}

export function formatMarketingCount(value: number) {
  return value.toLocaleString('ru-RU')
}

export function formatMarketingMoney(value: NumericLike | null) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`
}

export function formatMarketingPartner(partner: MarketingCpaReportRow['partner']) {
  const fullName = [partner.firstName, partner.lastName].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (partner.username) return `@${partner.username}`
  return partner.referralCode
}
