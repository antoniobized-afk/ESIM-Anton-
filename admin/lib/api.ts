import axios from 'axios'
import { clearToken, dispatchAuthLogoutEvent, getToken } from './auth'
import type {
  AdminProduct,
  AdminOrder,
  AdminPayment,
  AdminReferralLink,
  AdminReferralLinkStats,
  ApiMutationResponse,
  AuthLoginResponse,
  AutoUpdateExchangeRateResponse,
  CreateLoyaltyLevelDto,
  CreateProductDto,
  CreatePromoCodeDto,
  CreateReferralLinkDto,
  DashboardStats,
  ExchangeRateInfo,
  ExchangeRateUpdateResponse,
  LoyaltyLevel,
  OrdersQueryParams,
  PaginatedResponse,
  PaymentsQueryParams,
  PricingSettings,
  ProductBulkMutationResponse,
  ProductDedupeResponse,
  ProductFilters,
  ProductSyncResponse,
  PromoCode,
  ReferralSettings,
  ReferralStats,
  SalesChartParams,
  SalesChartPoint,
  SystemSettingsMap,
  TopProductAnalyticsItem,
  TopProductsParams,
  TopReferrer,
  UpdateLoyaltyLevelDto,
  UpdateProductDto,
  UpdateReferralLinkDto,
  UserStatsResponse,
  AdminUser,
} from './types'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: `${apiUrl}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor для добавления токена авторизации
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 → очистка token и auth logout event
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken()
      dispatchAuthLogoutEvent()
    }
    return Promise.reject(err)
  },
)

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthLoginResponse>('/auth/login', { email, password }),
}

// API методы
export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/analytics/dashboard'),
}

export const usersApi = {
  getAll: (page = 1, limit = 20, search?: string) =>
    api.get<PaginatedResponse<AdminUser>>(`/users`, { params: { page, limit, search } }),
  getById: (id: string) => api.get<AdminUser>(`/users/${id}`),
  getStats: (id: string) => api.get<UserStatsResponse>(`/users/${id}/stats`),
}

export const ordersApi = {
  getAll: (params?: OrdersQueryParams) =>
    api.get<PaginatedResponse<AdminOrder>>('/orders', { params }),
  getById: (id: string) => api.get<AdminOrder>(`/orders/${id}`),
  getByUser: (userId: string) => api.get<AdminOrder[]>(`/orders/user/${userId}`),
  cancel: (id: string) => api.patch<AdminOrder>(`/orders/${id}/cancel`),
}

export const productsApi = {
  getAll: (filters?: ProductFilters) =>
    api.get<PaginatedResponse<AdminProduct>>('/products', { params: { ...filters, paginated: true } }),
  getCountries: () => api.get<string[]>('/products/countries'),
  create: (data: CreateProductDto) => api.post<AdminProduct>('/products', data),
  update: (id: string, data: UpdateProductDto) => api.put<AdminProduct>(`/products/${id}`, data),
  sync: () => api.post<ProductSyncResponse>('/products/sync'),
  repriceAll: () => api.post<ProductBulkMutationResponse>('/products/reprice'),
  // Массовые операции
  bulkToggleActive: (ids: string[], isActive: boolean) =>
    api.post<ProductBulkMutationResponse>('/products/bulk/toggle-active', { ids, isActive }),
  bulkToggleByType: (tariffType: 'standard' | 'unlimited', isActive: boolean) =>
    api.post<ProductBulkMutationResponse>('/products/bulk/toggle-by-type', { tariffType, isActive }),
  bulkSetBadge: (ids: string[], badge: string | null, badgeColor: string | null) =>
    api.post<ProductBulkMutationResponse>('/products/bulk/set-badge', { ids, badge, badgeColor }),
  bulkSetMarkup: (ids: string[], markupPercent: number) =>
    api.post<ProductBulkMutationResponse>('/products/bulk/set-markup', { ids, markupPercent }),
  // Найти и скрыть дубликаты тарифов
  dedupe: (dryRun = false) =>
    api.post<ProductDedupeResponse>(`/products/dedupe${dryRun ? '?dryRun=true' : ''}`),
}

export const paymentsApi = {
  getAll: (params?: PaymentsQueryParams) =>
    api.get<PaginatedResponse<AdminPayment>>('/payments', { params }),
  getByUser: (userId: string) => api.get<AdminPayment[]>(`/payments/user/${userId}`),
}

export const analyticsApi = {
  getDashboard: (params?: { dateFrom?: string; dateTo?: string }) =>
    api.get<DashboardStats>('/analytics/dashboard', { params }),
  getTopProducts: (params?: TopProductsParams) =>
    api.get<TopProductAnalyticsItem[]>('/analytics/top-products', { params }),
  getSalesChart: (params: SalesChartParams) =>
    api.get<SalesChartPoint[]>('/analytics/sales-chart', { params }),
}

export const referralsApi = {
  getStats: (userId: string) => api.get<ReferralStats>(`/referrals/stats/${userId}`),
  getTop: () => api.get<TopReferrer[]>('/referrals/top'),
}

export const referralLinksApi = {
  getAll: (params?: { page?: number; limit?: number; userId?: string; isActive?: boolean }) =>
    api.get<PaginatedResponse<AdminReferralLink>>('/referrals/links', { params }),
  create: (data: CreateReferralLinkDto) =>
    api.post<AdminReferralLink>('/referrals/links', data),
  update: (id: string, data: UpdateReferralLinkDto) =>
    api.patch<AdminReferralLink>(`/referrals/links/${id}`, data),
  getStats: (id: string) =>
    api.get<AdminReferralLinkStats>(`/referrals/links/${id}/stats`),
}

export const loyaltyApi = {
  getLevels: () => api.get<LoyaltyLevel[]>('/loyalty/levels'),
  createLevel: (data: CreateLoyaltyLevelDto) => api.post<LoyaltyLevel>('/loyalty/levels', data),
  updateLevel: (id: string, data: UpdateLoyaltyLevelDto) =>
    api.put<LoyaltyLevel>(`/loyalty/levels/${id}`, data),
  deleteLevel: (id: string) => api.delete<LoyaltyLevel>(`/loyalty/levels/${id}`),
}

export const promoCodesApi = {
  getAll: () => api.get<PromoCode[]>('/promo-codes'),
  create: (data: CreatePromoCodeDto) => api.post<PromoCode>('/promo-codes', data),
  toggle: (id: string, isActive: boolean) =>
    api.patch<PromoCode>(`/promo-codes/${id}/toggle`, { isActive }),
  delete: (id: string) => api.delete<PromoCode>(`/promo-codes/${id}`),
}

export const systemSettingsApi = {
  getAll: () => api.get<SystemSettingsMap>('/system-settings'),
  getReferralSettings: () => api.get<ReferralSettings>('/system-settings/referral'),
  updateReferralSettings: (data: ReferralSettings) =>
    api.post<ApiMutationResponse<ReferralSettings>>('/system-settings/referral', data),
  // Настройки ценообразования
  getPricingSettings: () => api.get<PricingSettings>('/system-settings/pricing'),
  updatePricingSettings: (data: PricingSettings) =>
    api.post<ApiMutationResponse<PricingSettings>>('/system-settings/pricing', data),
  // Автоматический курс ЦБ РФ
  getExchangeRateInfo: () => api.get<ExchangeRateInfo>('/system-settings/exchange-rate'),
  updateExchangeRateFromCBR: () =>
    api.post<ExchangeRateUpdateResponse>('/system-settings/exchange-rate/update'),
  setExchangeRateAutoUpdate: (enabled: boolean) =>
    api.post<AutoUpdateExchangeRateResponse>('/system-settings/exchange-rate/auto-update', { enabled }),
}

export const trafficMonitorApi = {
  triggerTraffic: () => api.post<{ success: boolean; message: string }>('/traffic-monitor/trigger-traffic'),
  triggerExpiry: () => api.post<{ success: boolean; message: string }>('/traffic-monitor/trigger-expiry'),
}
