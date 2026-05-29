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

export interface AdminUser {
  id: string
  telegramId?: string | null
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  email?: string | null
  authProvider?: string | null
  providerId?: string | null
  balance: NumericLike
  bonusBalance: NumericLike
  referralCode?: string
  totalSpent: NumericLike
  isBlocked?: boolean
  utmCampaign?: string | null
  utmMedium?: string | null
  utmSource?: string | null
  createdAt: string
  updatedAt?: string
  loyaltyLevel?: LoyaltyLevel | null
  referredBy?: Pick<AdminUser, 'id' | 'username' | 'firstName' | 'lastName'> | null
  referrals?: Array<Pick<AdminUser, 'id' | 'username' | 'firstName' | 'lastName'>>
  orders?: AdminOrder[]
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
  speed?: string | null
  providerPrice: NumericLike
  ourPrice: NumericLike
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
  esimStatus?: string | null
  activatedAt?: string | null
  expiresAt?: string | null
  parentOrderId?: string | null
  topupPackageCode?: string | null
  user?: AdminUser
  product?: AdminProduct
  reconciliation?: OrderReconciliation
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
  country?: string
  isActive?: boolean
  search?: string
  tariffType?: 'standard' | 'unlimited'
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
  speed?: string | null
  providerPrice: NumericLike
  ourPrice: NumericLike
  providerId: string
  providerName?: string
  isActive: boolean
  stock?: number
  isUnlimited?: boolean
  badge?: string | null
  badgeColor?: string | null
  tags?: string[]
  notes?: string | null
  supportTopup?: boolean
}

export type UpdateProductDto = Partial<CreateProductDto>

export type EditableProduct = CreateProductDto & { id?: string }

export interface BulkToggleActiveDto {
  ids: string[]
  isActive: boolean
}

export interface BulkToggleByTypeDto {
  tariffType: 'standard' | 'unlimited'
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
  version?: string
  settings?: {
    exchangeRate: number
    markupPercent: number
  }
  breakdown?: {
    standard: number
    unlimited: number
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
  createdAt: string
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
