import type {
  ProductDataType,
  ProductDataTypeSelector,
  ProductDataTypeValue,
} from '@shared/product-data-type'
import type { ProductSortField, ProductSortOrder } from '@shared/product-sorting'
import type { UserSortField, UserSortOrder } from '@shared/user-sorting'

export type { ProductSortField, ProductSortOrder } from '@shared/product-sorting'
export type { UserSortField, UserSortOrder } from '@shared/user-sorting'

export type NumericLike = number | string

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED'

export type TransactionStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export type TransactionType =
  | 'PAYMENT'
  | 'REFUND'
  | 'BONUS_ACCRUAL'
  | 'BONUS_SPENT'
  | 'REFERRAL_BONUS'

export type AdminRole = 'SUPER_ADMIN' | 'MANAGER' | 'SUPPORT'

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export interface ApiListResponse<T> {
  data: T[]
}

export interface ApiMutationResponse<T = undefined> {
  success: boolean
  message?: string
  data?: T
}

export interface AdminAuthUser {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  role: AdminRole
}

export interface AuthLoginResponse {
  access_token: string
  admin: AdminAuthUser
}

export interface LoyaltyLevel {
  id: string
  name: string
  minSpent: number
  cashbackPercent: number
  discount: number
}

export type AuthIdentityProviderValue = 'EMAIL' | 'TELEGRAM' | 'GOOGLE' | 'YANDEX' | 'VK'

export interface AdminUserIdentityProvider {
  id: string
  provider: AuthIdentityProviderValue
  label: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
  linkedAt: string
  lastLoginAt: string | null
}

export interface AdminUserCompactReference {
  id: string
  displayName: string
  username: string | null
  email: string | null
}

export type AdminUserAttributionBucket =
  | {
      kind: 'referral'
      label: string
      referredById: string | null
      referralLinkId: string | null
      referralLinkCode: string | null
      referralLinkLabel: string | null
      referrer: AdminUserCompactReference | null
    }
  | {
      kind: 'utm'
      label: string
      source: string | null
      medium: string | null
      campaign: string | null
    }
  | {
      kind: 'entryChannel'
      label: string
      channel: 'telegram' | 'direct'
    }
  | {
      kind: 'unknown'
      label: string
    }

export interface AdminUserAttributionSummary {
  buckets: AdminUserAttributionBucket[]
}

export interface AdminUserLoyaltyLevel {
  id: string
  name: string
  minSpent: NumericLike
  cashbackPercent: NumericLike
  discount: NumericLike
}

export interface AdminUser {
  id: string
  telegramId: string | null
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  email?: string | null
  balance: NumericLike
  bonusBalance: NumericLike
  referralCode: string
  totalSpent: NumericLike
  isBlocked: boolean
  createdAt: string
  updatedAt: string
  loyaltyLevel: AdminUserLoyaltyLevel | null
  identityProviders: AdminUserIdentityProvider[]
  attributionSummary: AdminUserAttributionSummary
}

export interface AdminProduct {
  id: string
  country: string
  region?: string | null
  name: string
  description?: string | null
  dataAmount: string
  validityDays: number
  duration?: number | null
  dataType: ProductDataTypeValue
  speed?: string | null
  providerPrice: NumericLike
  ourPrice: NumericLike
  dataAmountMb?: NumericLike | null
  providerCostPerGb?: NumericLike | null
  markupRatio?: NumericLike | null
  providerId: string
  providerName?: string
  isActive: boolean
  stock?: number
  createdAt: string
  updatedAt?: string
  isUnlimited?: boolean
  badge?: string | null
  badgeColor?: string | null
  tags?: string[]
  notes?: string | null
  supportTopup?: boolean
}

export interface OrderReconciliation {
  needsAttention: boolean
  category: string | null
  refunded: boolean
  paymentProvider: string | null
  paymentMethod: string | null
  paymentAmount: NumericLike | null
  lastError: string | null
  repeatChargeAttemptId: string | null
  repeatChargeAttemptStatus: string | null
  providerReasonCode: number | null
  providerMessage: string | null
  ambiguousReason: string | null
}

export interface AdminOrder {
  id: string
  userId: string
  productId: string
  status: OrderStatus
  quantity: number
  periodNum?: number | null
  productPrice: NumericLike
  discount: NumericLike
  promoCode?: string | null
  promoDiscount: NumericLike
  bonusUsed: NumericLike
  totalAmount: NumericLike
  qrCode?: string | null
  iccid?: string | null
  activationCode?: string | null
  providerOrderId?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt?: string
  completedAt?: string | null
  completionAccountingStatus?: 'NOT_REQUIRED' | 'PENDING' | 'APPLIED' | 'FAILED'
  completionAccountingAttempts?: number
  completionAccountingLastAttemptAt?: string | null
  completionAccountingNextRetryAt?: string | null
  completionAccountingLastError?: string | null
  esimStatus?: string | null
  activatedAt?: string | null
  expiresAt?: string | null
  parentOrderId?: string | null
  topupPackageCode?: string | null
  user?: AdminUser
  product?: AdminProduct
  reconciliation?: OrderReconciliation
}

export interface CompletionAccountingRetryResponse {
  orderId: string
  status: 'NOT_REQUIRED' | 'PENDING' | 'APPLIED' | 'FAILED'
  applied: boolean
  reason:
    | 'applied'
    | 'already_applied'
    | 'failed'
    | 'not_completed'
    | 'not_required'
    | 'not_due'
    | 'not_claimed'
  error?: string
}

export interface DashboardStats {
  users: {
    total: number
    new: number
  }
  orders: {
    total: number
    completed: number
    withPromo: number
    freeOrders: number
    conversionRate: number
  }
  revenue: {
    total: NumericLike
    gross: NumericLike
    promoDiscounts: NumericLike
    loyaltyDiscounts: NumericLike
    bonusesUsed: NumericLike
    average: NumericLike
  }
  topProducts: TopProductAnalyticsItem[]
  topCountries: TopCountryAnalyticsItem[]
}

export interface TopProductAnalyticsItem {
  productId: string
  productName: string
  country: string
  count: number
  revenue: number
}

export interface TopCountryAnalyticsItem {
  country: string
  count: number
  revenue: number
}

export interface SalesChartPoint {
  date: string
  count: number
  revenue: number
}

export interface UserStatsResponse {
  user: AdminUser
  ordersCount: number
  referralsCount: number
  totalSpent: NumericLike
}

export interface AdminUserDeleteResult {
  success: true
  deletedUserId: string
  deletedIdentityCount: number
  deletedIdentityAuditCount: number
  deletedPushSubscriptionCount: number
  deletedNotificationCount: number
}

export interface AdminUserDeleteBlocker {
  code: string
  message: string
}

export interface OrdersQueryParams {
  status?: OrderStatus
  reconciliation?: 'needs_attention'
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'totalAmount' | 'productPrice' | 'status'
  sortOrder?: 'asc' | 'desc'
}

export interface PaymentsQueryParams {
  status?: TransactionStatus
  type?: TransactionType
  page?: number
  limit?: number
}

export interface UsersQueryParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: UserSortField
  sortOrder?: UserSortOrder
}

export interface AnalyticsRangeParams {
  dateFrom?: string
  dateTo?: string
}

export interface TopProductsParams extends AnalyticsRangeParams {
  limit?: number
}

export interface SalesChartParams {
  dateFrom: string
  dateTo: string
}

export interface ProductFilters {
  country?: string | string[]
  isActive?: boolean
  search?: string
  tariffType?: 'standard' | 'unlimited'
  dataType?: ProductDataTypeSelector
  dataAmount?: string
  dataUnit?: 'MB' | 'GB'
  durationDays?: number
  sortBy?: ProductSortField
  sortOrder?: ProductSortOrder
  page?: number
  limit?: number
}

export interface CreateProductDto {
  country: string
  region?: string | null
  name: string
  description?: string | null
  dataAmount: string
  validityDays: number
  duration?: number | null
  dataType?: ProductDataType
  speed?: string | null
  providerPrice: NumericLike
  ourPrice: NumericLike
  providerId: string
  providerName?: string
  isActive: boolean
  stock?: number
  badge?: string | null
  badgeColor?: string | null
  tags?: string[]
  notes?: string | null
  supportTopup?: boolean
}

export type UpdateProductDto = Partial<CreateProductDto>

export type EditableProduct = Omit<CreateProductDto, 'dataType'> & {
  id?: string
  dataType?: ProductDataTypeValue
  isUnlimited?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface BulkToggleActiveDto {
  ids: string[]
  isActive: boolean
}

export interface BulkToggleByDataTypeDto {
  dataType: ProductDataTypeSelector
  isActive: boolean
}

export interface BulkSetBadgeDto {
  ids: string[]
  badge: string | null
  badgeColor: string | null
}

export interface BulkSetMarkupDto {
  ids: string[]
  markupPercent: number
}

export interface ProductSyncResponse extends ApiMutationResponse {
  synced: number
  errors: number
  providerErrors?: number
  packageErrors?: number
  providerFailures?: Array<{
    dataType: ProductDataType
    label: string
    message: string
  }>
  version?: string
  settings?: {
    exchangeRate: number
    markupPercent: number
  }
  breakdown?: {
    standard: number
    unlimited: number
    dataTypes?: Partial<Record<ProductDataType, number>>
  }
}

export interface ProductBulkMutationResponse extends ApiMutationResponse {
  updated: number
}

export interface ProductDedupeResponse extends ApiMutationResponse {
  dryRun: boolean
  groups: number
  deactivated: number
  report: unknown[]
}

export interface AdminPayment {
  id: string
  userId: string
  orderId?: string | null
  type: TransactionType
  status: TransactionStatus
  amount: NumericLike
  paymentProvider?: string | null
  paymentId?: string | null
  paymentMethod?: string | null
  metadata?: unknown
  createdAt: string
  updatedAt?: string
  user?: Pick<AdminUser, 'id' | 'telegramId' | 'username'>
  order?: AdminOrder | null
}

export interface ReferralStats {
  referralCode: string
  referralLink: string
  referralsCount: number
  totalEarnings: NumericLike
  referralPercent: NumericLike
  referrals: Array<{
    id: string
    username?: string | null
    firstName?: string | null
    totalOrders: number
    totalSpent: NumericLike
  }>
}

export interface TopReferrer {
  id: string
  username?: string | null
  firstName?: string | null
  referralsCount: number
  bonusBalance: NumericLike
}

export interface CreateLoyaltyLevelDto {
  name: string
  minSpent: number
  cashbackPercent: number
  discount: number
}

export type UpdateLoyaltyLevelDto = Partial<CreateLoyaltyLevelDto>

export type EditableLoyaltyLevel = CreateLoyaltyLevelDto & { id?: string }

export interface PromoCode {
  id: string
  code: string
  discountPercent: number
  maxUses: number | null
  usedCount: number
  isActive: boolean
  expiresAt: string | null
  referralOwnerId: string | null
  referralBonusPercent: NumericLike | null
  referralPayoutMode: ReferralPayoutMode | null
  referralOwner?: {
    id: string
    firstName: string | null
    lastName: string | null
    username: string | null
    email: string | null
    referralCode: string
  } | null
  totalReferrerEarnings: NumericLike
  createdAt: string
}

export interface AdminPromoCodeStats {
  promoCode: PromoCode
  stats: {
    uses: number
    completedPrimaryOrders: number
    commissionableRevenue: NumericLike
    totalReferrerEarnings: NumericLike
  }
  payoutModeSplit: Array<{
    payoutMode: ReferralPayoutMode | null
    rewardsCount: number
    totalEarnings: NumericLike
  }>
}

export interface CreatePromoCodeDto {
  code: string
  discountPercent: number
  maxUses?: number
  expiresAt?: string
  isActive?: boolean
  referralOwnerId?: string | null
  referralBonusPercent?: number | null
  referralPayoutMode?: ReferralPayoutMode | null
}

export interface UpdatePromoCodeDto {
  code?: string
  discountPercent?: number
  maxUses?: number | null
  expiresAt?: string | null
  isActive?: boolean
  referralOwnerId?: string | null
  referralBonusPercent?: number | null
  referralPayoutMode?: ReferralPayoutMode | null
}

export interface ReferralSettings {
  bonusPercent: number
  minPayout: number
  enabled: boolean
}

export interface PricingSettings {
  exchangeRate: number
  defaultMarkupPercent: number
}

export interface ExchangeRateInfo {
  rate: number
  updatedAt: string | null
  autoUpdate: boolean
  source: string
}

export interface ExchangeRateUpdateResponse {
  success: boolean
  rate: number
  date: string
}

export interface AutoUpdateExchangeRateResponse extends ApiMutationResponse {
  autoUpdate: boolean
}

export interface SystemSettingsMap {
  [key: string]: string
}

// ── Partner Referral Links ─────────────────────────────────────────

export type ReferralPayoutMode = 'BALANCE' | 'EXTERNAL'

export interface AdminReferralLink {
  id: string
  code: string
  userId: string
  label: string | null
  bonusPercent: NumericLike
  payoutMode: ReferralPayoutMode
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt?: string
  promoCode: { id: string; code: string; isActive?: boolean; expiresAt?: string | null } | null
  user: { id: string; referralCode: string; firstName: string | null; username: string | null }
  _count: { referredUsers: number; transactions: number }
}

export interface AdminReferralLinkStats {
  link: AdminReferralLink
  stats: {
    registrations: number
    ordersCount: number
    commissionableRevenue: NumericLike
    totalReferrerEarnings: NumericLike
  }
  referredUsers: Array<{
    id: string
    name: string
    joinedAt: string
    totalOrders: number
    totalSpent: NumericLike
  }>
}

export interface CreateReferralLinkDto {
  code: string
  userId: string
  bonusPercent: number
  payoutMode?: ReferralPayoutMode
  label?: string
  promoCodeId?: string
  isActive?: boolean
  expiresAt?: string
}

export interface UpdateReferralLinkDto {
  code?: string
  bonusPercent?: number
  payoutMode?: ReferralPayoutMode
  label?: string | null
  promoCodeId?: string | null
  isActive?: boolean
  expiresAt?: string | null
}
