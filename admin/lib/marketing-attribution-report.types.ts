import type {
  MarketingAttributionModel,
  MarketingTouchChannel,
} from '@shared/marketing-attribution-report'
import type {
  NumericLike,
  ReferralPayoutMode,
} from './types'

export type { MarketingAttributionModel } from '@shared/marketing-attribution-report'

export interface MarketingAttributionReportFilters {
  dateFrom: string
  dateTo: string
  channel?: MarketingTouchChannel
  model: MarketingAttributionModel
}

export interface MarketingReportSemantics {
  timezone: 'UTC'
  interval: string
  clicksDateField: string
  registrationsDateField: string
  purchasesDateField: string
  note: string
  payoutSource?: string
}

export interface MarketingAttributionReportRow {
  campaign: {
    id: string
    shortCode: string | null
    name: string | null
    utmSource: string | null
    utmMedium: string | null
    utmCampaign: string | null
    isActive: boolean | null
    deactivatedAt: string | null
  } | null
  metrics: {
    clicks: number
    registrations: number
    firstPurchases: number
    repeatPurchases: number
    purchases: number
    revenue: NumericLike
  }
}

export interface MarketingAttributionReport {
  filters: Required<Omit<MarketingAttributionReportFilters, 'channel'>> & {
    channel: MarketingTouchChannel | null
  }
  semantics: MarketingReportSemantics
  totals: MarketingAttributionReportRow['metrics']
  rows: MarketingAttributionReportRow[]
}

export type MarketingCpaPayoutMode = ReferralPayoutMode | 'UNKNOWN'

export interface MarketingCpaReportRow {
  campaign: {
    id: string
    shortCode: string
    name: string
    isActive: boolean
    deactivatedAt: string | null
  }
  referralLink: {
    id: string
    code: string
    label: string | null
  }
  partner: {
    userId: string
    firstName: string | null
    lastName: string | null
    username: string | null
    referralCode: string
  }
  metrics: {
    firstPurchases: number
    repeatPurchases: number
    purchases: number
    revenue: NumericLike
    rewardsCount: number
    payout: NumericLike
    actualCpa: NumericLike | null
  }
  payoutModeSplit: Array<{
    payoutMode: MarketingCpaPayoutMode
    rewardsCount: number
    payout: NumericLike
  }>
}

export interface MarketingCpaReport {
  filters: MarketingAttributionReport['filters']
  semantics: MarketingReportSemantics
  totals: Omit<MarketingCpaReportRow['metrics'], 'actualCpa'>
  rows: MarketingCpaReportRow[]
}
