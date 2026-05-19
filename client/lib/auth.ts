const TOKEN_KEY = 'mojo_auth_token'
const USER_KEY = 'mojo_auth_user'

export interface AuthUser {
  id: string
  telegramId?: string
  username?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  balance: number
  bonusBalance: number
  referralCode: string
  referredById?: string | null
  referralLinkId?: string | null
  pendingPromoCode?: string | null
  totalSpent: number
  authProvider?: string
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).Telegram?.WebApp?.initData
}

export function hasTelegramLaunchParams(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  return hash.includes('tgWebAppData') || hash.includes('tgWebAppVersion')
}

// Это hint для Telegram runtime и ожидания SDK, а не доказательство авторизации.
export function isTelegramEnvironment(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as any).Telegram?.WebApp?.initData) return true
  return hasTelegramLaunchParams()
}

export function getTelegramUserId(): string | null {
  if (!isTelegramWebApp()) return null
  const tg = (window as any).Telegram.WebApp
  const userId = tg?.initDataUnsafe?.user?.id
  return userId ? String(userId) : null
}
