'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  authIdentitiesApi,
  referralsApi,
  type AuthIdentityProvider,
  type ReferralStats,
  type UserIdentitySummary,
} from '@/lib/api'
import {
  DollarSign, Smartphone, ShoppingBag, Globe, Moon, Bell, Sun, Monitor,
  ChevronRight, Gift, HelpCircle, FileText, MessageCircle, X, Check, LogOut,
  Plus, Loader2, Shield, AlertCircle, Mail
} from '@/components/icons'
import BottomNav from '@/components/BottomNav'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/components/ThemeProvider'
import TelegramLoginWidgetButton from '@/components/TelegramLoginWidgetButton'
import packageJson from '@/package.json'

interface UserProfile {
  id: string
  firstName: string
  lastName?: string
  username?: string
  email?: string
  photoUrl?: string
  balance: number
  bonusBalance: number
  referralCode: string
}

type Language = 'ru' | 'en'

const LINKABLE_PROVIDER_ORDER: AuthIdentityProvider[] = ['EMAIL', 'TELEGRAM', 'GOOGLE', 'YANDEX']
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'mojo_mobile_bot'

const IDENTITY_PROVIDER_META: Record<AuthIdentityProvider, {
  label: string
  description: string
  tone: string
}> = {
  EMAIL: {
    label: 'Email',
    description: 'Вход по одноразовому коду',
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
  },
  TELEGRAM: {
    label: 'Telegram',
    description: 'Вход через Telegram',
    tone: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30',
  },
  GOOGLE: {
    label: 'Google',
    description: 'OAuth вход',
    tone: 'bg-red-100 text-red-600 dark:bg-red-900/30',
  },
  YANDEX: {
    label: 'Яндекс',
    description: 'OAuth вход',
    tone: 'bg-orange-100 text-[#f77430] dark:bg-orange-900/30',
  },
  VK: {
    label: 'VK',
    description: 'OAuth вход',
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
  },
}

function providerIcon(provider: AuthIdentityProvider) {
  if (provider === 'EMAIL') return Mail
  if (provider === 'TELEGRAM') return MessageCircle
  if (provider === 'GOOGLE' || provider === 'YANDEX') return Shield
  return Globe
}

export default function ProfilePage() {
  const { user: authUser, isLoading: authLoading, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [promoCode, setPromoCode] = useState('')
  const [language, setLanguage] = useState<Language>('ru')
  const [notifications, setNotifications] = useState(true)
  const [identities, setIdentities] = useState<UserIdentitySummary[]>([])
  const [availableIdentityProviders, setAvailableIdentityProviders] = useState<AuthIdentityProvider[]>([])
  const [identitiesLoading, setIdentitiesLoading] = useState(false)
  const [identityAction, setIdentityAction] = useState<string | null>(null)
  const [identityMessage, setIdentityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showEmailLinkModal, setShowEmailLinkModal] = useState(false)
  const [emailLinkStep, setEmailLinkStep] = useState<'email' | 'code'>('email')
  const [emailLinkValue, setEmailLinkValue] = useState('')
  const [emailLinkCode, setEmailLinkCode] = useState('')
  const [telegramWebAppAvailable, setTelegramWebAppAvailable] = useState(false)

  // Modals
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const [showNotificationsModal, setShowNotificationsModal] = useState(false)

  const changeLanguage = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
    setShowLanguageModal(false)
  }

  const changeTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme)
    setShowThemeModal(false)
  }

  const toggleNotifications = () => {
    const newValue = !notifications
    setNotifications(newValue)
    localStorage.setItem('notifications', String(newValue))
  }

  const loadUserData = useCallback(async () => {
    let redirectedToLogin = false
    try {
      if (authUser) {
        setUser({
          id: authUser.id,
          firstName: authUser.firstName || 'Пользователь',
          lastName: authUser.lastName,
          username: authUser.username,
          email: authUser.email,
          balance: Number(authUser.balance) || 0,
          bonusBalance: Number(authUser.bonusBalance) || 0,
          referralCode: authUser.referralCode,
        })
      } else {
        const { getToken } = await import('@/lib/auth')
        const token = getToken()
        if (token) {
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          setUser({
            id: data.id,
            firstName: data.firstName || 'Пользователь',
            lastName: data.lastName,
            username: data.username,
            email: data.email,
            balance: Number(data.balance) || 0,
            bonusBalance: Number(data.bonusBalance) || 0,
            referralCode: data.referralCode,
          })
        } else {
          redirectedToLogin = true
          window.location.replace('/login')
          return
        }
      }
    } catch (e: any) {
      console.error('Profile load error:', e)
      const status = e?.response?.status
      if (status === 401 || status === 403) {
        redirectedToLogin = true
        const { clearToken } = await import('@/lib/auth')
        clearToken()
        window.location.replace('/login')
      }
    } finally {
      if (!redirectedToLogin) {
        setLoading(false)
      }
    }
  }, [authUser])

  const loadReferralStats = useCallback(async () => {
    try {
      const stats = await referralsApi.getStats()
      setReferralStats(stats)
    } catch (e) {
      console.error('Referral stats load error:', e)
      setReferralStats(null)
    }
  }, [])

  const loadIdentities = useCallback(async () => {
    try {
      setIdentitiesLoading(true)
      const result = await authIdentitiesApi.getMine()
      setIdentities(result.identities)
      setAvailableIdentityProviders(result.availableProviders)
    } catch (e) {
      console.error('Identities load error:', e)
      setIdentities([])
      setAvailableIdentityProviders([])
    } finally {
      setIdentitiesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void loadUserData()
    void loadReferralStats()
    void loadIdentities()
    const savedLang = localStorage.getItem('language') as Language
    const savedNotifications = localStorage.getItem('notifications')

    if (savedLang) setLanguage(savedLang)
    if (savedNotifications !== null) setNotifications(savedNotifications === 'true')
  }, [authLoading, loadIdentities, loadReferralStats, loadUserData])

  useEffect(() => {
    setTelegramWebAppAvailable(Boolean((window as any).Telegram?.WebApp?.initData))
  }, [])

  useEffect(() => {
    ;(window as any).onTelegramIdentityLink = async (userData: Record<string, string>) => {
      setIdentityAction('telegram')
      setIdentityMessage(null)
      try {
        const result = await authIdentitiesApi.linkTelegramWidget(userData)
        setIdentityMessage({
          type: 'success',
          text: result.status === 'already_linked'
            ? 'Telegram уже привязан.'
            : 'Telegram привязан.',
        })
        await Promise.all([loadIdentities(), refreshUser()])
      } catch (e: any) {
        setIdentityMessage({
          type: 'error',
          text: e?.response?.data?.message || 'Не удалось привязать Telegram.',
        })
      } finally {
        setIdentityAction(null)
      }
    }

    return () => {
      delete (window as any).onTelegramIdentityLink
    }
  }, [loadIdentities, refreshUser])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linkStatus = params.get('identityLink')
    const linkError = params.get('identityError')
    if (!linkStatus) return

    setIdentityMessage({
      type: linkStatus === 'linked' || linkStatus === 'already_linked' ? 'success' : 'error',
      text: linkStatus === 'already_linked'
        ? 'Этот способ входа уже был привязан.'
        : linkStatus === 'linked'
          ? 'Способ входа привязан.'
          : linkError || 'Не удалось привязать способ входа.',
    })
    window.history.replaceState(null, '', '/profile')
    void loadIdentities()
    void refreshUser()
  }, [loadIdentities, refreshUser])

  const applyPromoCode = () => {
    if (promoCode.trim()) {
      alert('Промокод применён!')
      setPromoCode('')
    }
  }

  const shareReferral = () => {
    if (!referralStats?.enabled || !referralStats.referralLink) {
      window.location.href = '/referrals'
      return
    }

    const shareTitle = 'Mojo mobile'
    const shareText = [
      'Подключай eSIM в Mojo mobile по моей ссылке.',
      `Реферальные бонусы по программе рекомендаций: ${referralStats.referralPercent}%.`,
      `Ссылка: ${referralStats.referralLink}`,
    ].join('\n\n')
    const tg = (window as any).Telegram?.WebApp
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(referralStats.referralLink)}&text=${encodeURIComponent(shareText)}`
      )
    } else if (navigator.share) {
      navigator.share({ title: shareTitle, text: shareText, url: referralStats.referralLink }).catch(() => { })
    } else {
      navigator.clipboard?.writeText(`${shareText}\n`)
      alert('Ссылка скопирована!')
    }
  }

  const referralBannerTitle = referralStats?.enabled
    ? `Получайте ${referralStats.referralPercent}% с покупок друзей`
    : 'Реферальная программа временно недоступна'

  const referralBannerDescription = referralStats?.enabled
    ? `Поделитесь своей ссылкой. Реферальные бонусы доступны к использованию от ${referralStats.minPayout} ₽.`
    : 'Подробности и статус программы доступны на экране рефералов.'

  const referralButtonLabel = referralStats?.enabled ? 'Поделиться ссылкой' : 'Открыть рефералы'

  const handleLogout = async () => {
    const { isTelegramWebApp, clearToken } = await import('@/lib/auth')
    if (isTelegramWebApp()) {
      alert('В Telegram Mini App выход не требуется. Для смены аккаунта используйте другой Telegram аккаунт.')
      return
    }
    clearToken()
    window.location.href = '/login'
  }

  const handleOAuthLink = async (provider: 'google' | 'yandex') => {
    setIdentityAction(provider)
    setIdentityMessage(null)
    try {
      const { url } = await authIdentitiesApi.startOAuthLink(provider, '/profile')
      window.location.href = url
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось начать привязку.',
      })
      setIdentityAction(null)
    }
  }

  const handleTelegramLink = async () => {
    const initData = (window as any).Telegram?.WebApp?.initData
    if (!initData) {
      setIdentityMessage({
        type: 'error',
        text: 'Telegram можно привязать из Mini App.',
      })
      return
    }

    setIdentityAction('telegram')
    setIdentityMessage(null)
    try {
      const result = await authIdentitiesApi.linkTelegramWebApp(initData)
      setIdentityMessage({
        type: 'success',
        text: result.status === 'already_linked'
          ? 'Telegram уже привязан.'
          : 'Telegram привязан.',
      })
      await Promise.all([loadIdentities(), refreshUser()])
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось привязать Telegram.',
      })
    } finally {
      setIdentityAction(null)
    }
  }

  const sendEmailLinkCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLinkValue)) {
      setIdentityMessage({ type: 'error', text: 'Введите корректный email.' })
      return
    }

    setIdentityAction('email')
    setIdentityMessage(null)
    try {
      await authIdentitiesApi.sendEmailLinkCode(emailLinkValue)
      setEmailLinkStep('code')
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось отправить код.',
      })
    } finally {
      setIdentityAction(null)
    }
  }

  const verifyEmailLink = async () => {
    if (emailLinkCode.length !== 6) {
      setIdentityMessage({ type: 'error', text: 'Введите 6-значный код.' })
      return
    }

    setIdentityAction('email')
    setIdentityMessage(null)
    try {
      const result = await authIdentitiesApi.verifyEmailLink(emailLinkValue, emailLinkCode)
      setIdentityMessage({
        type: 'success',
        text: result.status === 'already_linked'
          ? 'Email уже был привязан.'
          : 'Email привязан.',
      })
      setShowEmailLinkModal(false)
      setEmailLinkStep('email')
      setEmailLinkCode('')
      await Promise.all([loadIdentities(), refreshUser()])
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось привязать email.',
      })
    } finally {
      setIdentityAction(null)
    }
  }

  const unlinkIdentity = async (identity: UserIdentitySummary) => {
    if (!identity.canUnlink) {
      setIdentityMessage({ type: 'error', text: 'Нельзя удалить последний способ входа.' })
      return
    }
    if (!window.confirm(`Отвязать ${identity.label}?`)) return

    setIdentityAction(identity.id)
    setIdentityMessage(null)
    try {
      await authIdentitiesApi.unlink(identity.id)
      setIdentityMessage({ type: 'success', text: `${identity.label} отвязан.` })
      await Promise.all([loadIdentities(), refreshUser()])
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось отвязать способ входа.',
      })
    } finally {
      setIdentityAction(null)
    }
  }

  const linkedProviders = new Set(identities.map((identity) => identity.provider))
  const linkableProviders = LINKABLE_PROVIDER_ORDER.filter((provider) =>
    availableIdentityProviders.includes(provider) && !linkedProviders.has(provider)
  )

  if (loading) {
    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
        <div className="skeleton h-8 w-32 mb-6" />
        <div className="skeleton h-20 w-full rounded-2xl mb-4" />
        <div className="skeleton h-14 w-full rounded-2xl mb-4" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Аккаунт
        </h1>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#f2622a] hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>

      {/* Deposit / Balance */}
      <section className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">Депозит</p>
        <Link href="/balance">
          <div className="card-neutral p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <DollarSign className="text-[#f77430]" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Баланс:</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ₽ {user?.balance || 0}
                </p>
              </div>
            </div>
            <ChevronRight className="text-gray-400" size={20} />
          </div>
        </Link>
      </section>

      {/* Promo Code */}
      <section className="mb-6">
        <div className="card-neutral p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Промокод"
              className="flex-1 px-4 py-3 rounded-xl soft-input text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f77430]"
            />
            <button
              onClick={applyPromoCode}
              className="px-6 py-3 bg-[#f77430] hover:bg-[#f2622a] text-white font-medium rounded-xl transition-colors"
            >
              Ok
            </button>
          </div>
        </div>
      </section>

      {/* Referral Banner */}
      <section className="mb-6">
        <div className="relative overflow-hidden card-accent p-5">
          <div className="relative z-10">
            <p className="text-white font-semibold text-lg mb-3">
              {referralBannerTitle}
            </p>
            <p className="text-sm text-white/90 mb-4 max-w-[18rem]">
              {referralBannerDescription}
            </p>
            <button
              onClick={shareReferral}
              className="px-5 py-2.5 bg-white text-[#f77430] font-semibold rounded-xl shadow-lg hover:shadow-xl transition-shadow"
            >
              {referralButtonLabel}
            </button>
          </div>
          {/* Decorative gift */}
          <div className="absolute right-4 bottom-2 opacity-90">
            <Gift size={80} className="text-white/30" />
          </div>
        </div>
      </section>

      {/* Profile Section */}
      <section className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">Профиль</p>
        <div className="card-neutral overflow-hidden">

          <Link href="/my-esim">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Smartphone className="text-[#f77430]" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Мои eSIM</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <Link href="/orders">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <ShoppingBag className="text-[#f77430]" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Заказы</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <Link href="/referrals">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Gift className="text-[#f77430]" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Реферальная программа</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <Link href="/loyalty">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Check className="text-[#f77430]" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Система лояльности</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

        </div>
      </section>

      {/* Login Identities */}
      <section className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">Способы входа</p>
        <div className="card-neutral overflow-hidden">
          {identityMessage && (
            <div className={`mx-4 mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
              identityMessage.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}>
              {identityMessage.type === 'success'
                ? <Check size={16} className="mt-0.5 shrink-0" />
                : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
              <span>{identityMessage.text}</span>
            </div>
          )}

          {identitiesLoading && (
            <div className="flex items-center gap-3 px-4 py-4 text-sm text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Загружаем способы входа
            </div>
          )}

          {!identitiesLoading && identities.map((identity, index) => {
            const meta = IDENTITY_PROVIDER_META[identity.provider]
            const Icon = providerIcon(identity.provider)
            return (
              <div key={identity.id}>
                {index > 0 && <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />}
                <div className="flex items-center gap-4 px-4 py-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.tone}`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">{identity.label}</p>
                      {identity.emailVerified && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:bg-green-900/20 dark:text-green-300">
                          подтвержден
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {identity.email || identity.displayName || meta.description}
                    </p>
                  </div>
                  <button
                    onClick={() => unlinkIdentity(identity)}
                    disabled={!identity.canUnlink || identityAction === identity.id}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    {identityAction === identity.id ? <Loader2 size={16} className="animate-spin" /> : 'Отвязать'}
                  </button>
                </div>
              </div>
            )
          })}

          {linkableProviders.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-2">
                {linkableProviders.map((provider) => {
                  const meta = IDENTITY_PROVIDER_META[provider]
                  const Icon = providerIcon(provider)
                  const loadingProvider = identityAction === provider.toLowerCase()
                  if (provider === 'TELEGRAM' && !telegramWebAppAvailable) {
                    return (
                      <TelegramLoginWidgetButton
                        key={provider}
                        botUsername={BOT_USERNAME}
                        onAuthFunctionName="onTelegramIdentityLink"
                        title={meta.label}
                        subtitle="Привязать"
                        loading={loadingProvider}
                        disabled={Boolean(identityAction)}
                        fallbackText="Для привязки Telegram откройте приложение через бота"
                        fallbackCta="Открыть в Telegram"
                        fallbackStart="link"
                      />
                    )
                  }
                  return (
                    <button
                      key={provider}
                      onClick={() => {
                        if (provider === 'EMAIL') {
                          setEmailLinkValue(user?.email || '')
                          setEmailLinkCode('')
                          setEmailLinkStep('email')
                          setShowEmailLinkModal(true)
                        } else if (provider === 'TELEGRAM') {
                          void handleTelegramLink()
                        } else if (provider === 'GOOGLE') {
                          void handleOAuthLink('google')
                        } else if (provider === 'YANDEX') {
                          void handleOAuthLink('yandex')
                        }
                      }}
                      disabled={Boolean(identityAction)}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:hover:bg-gray-800"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.tone}`}>
                        {loadingProvider ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {meta.label}
                        </p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                          Привязать
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Settings Section */}
      <section className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">Настройки</p>
        <div className="card-neutral overflow-hidden">

          <button
            onClick={() => setShowLanguageModal(true)}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Globe className="text-[#f77430]" size={20} />
            </div>
            <span className="flex-1 font-medium text-gray-900 dark:text-white text-left">Язык</span>
            <span className="text-gray-400 text-sm mr-1">
              {language === 'ru' ? 'Русский' : 'English'}
            </span>
            <ChevronRight className="text-gray-400" size={20} />
          </button>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <button
            onClick={() => setShowThemeModal(true)}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
              {theme === 'dark' ? <Moon className="text-white" size={20} /> :
                theme === 'light' ? <Sun className="text-white" size={20} /> :
                  <Monitor className="text-white" size={20} />}
            </div>
            <span className="flex-1 font-medium text-gray-900 dark:text-white text-left">Тема</span>
            <span className="text-gray-400 text-sm mr-1">
              {theme === 'light' ? 'Светлая' : theme === 'dark' ? 'Тёмная' : 'Авто'}
            </span>
            <ChevronRight className="text-gray-400" size={20} />
          </button>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <button
            onClick={() => setShowNotificationsModal(true)}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Bell className="text-[#f77430]" size={20} />
            </div>
            <span className="flex-1 font-medium text-gray-900 dark:text-white text-left">Уведомления</span>
            <span className={`text-sm mr-1 ${notifications ? 'text-green-500' : 'text-gray-400'}`}>
              {notifications ? 'Вкл' : 'Выкл'}
            </span>
            <ChevronRight className="text-gray-400" size={20} />
          </button>

        </div>
      </section>

      {/* Other Section */}
      <section className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">Другое</p>
        <div className="card-neutral overflow-hidden">

          <Link href="/help">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <HelpCircle className="text-[#f77430]" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Помощь</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <a href="mailto:mojomobile@yandex.ru" target="_blank" rel="noopener noreferrer">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <MessageCircle className="text-[#f77430]" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Поддержка</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </a>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <Link href="/offer">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <FileText className="text-gray-600 dark:text-gray-400" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Публичная оферта</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

          <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

          <Link href="/agreement">
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <FileText className="text-gray-600 dark:text-gray-400" size={20} />
              </div>
              <span className="flex-1 font-medium text-gray-900 dark:text-white">Пользовательское соглашение</span>
              <ChevronRight className="text-gray-400" size={20} />
            </div>
          </Link>

        </div>
      </section>

      {/* App Version */}
      <p className="text-center text-gray-400 dark:text-gray-600 text-sm">
        Версия {packageJson.version}
      </p>

      {/* Email Link Modal */}
      {showEmailLinkModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowEmailLinkModal(false)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Привязать email</h3>
              <button onClick={() => setShowEmailLinkModal(false)} className="p-2">
                <X className="text-gray-400" size={24} />
              </button>
            </div>

            {emailLinkStep === 'email' && (
              <div className="flex flex-col gap-3">
                <input
                  type="email"
                  value={emailLinkValue}
                  onChange={(e) => setEmailLinkValue(e.target.value.trim())}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 rounded-xl soft-input text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f77430]"
                />
                <button
                  onClick={sendEmailLinkCode}
                  disabled={identityAction === 'email'}
                  className="w-full rounded-xl bg-[#f77430] py-3 font-semibold text-white disabled:opacity-50"
                >
                  {identityAction === 'email' ? 'Отправляем...' : 'Получить код'}
                </button>
              </div>
            )}

            {emailLinkStep === 'code' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Код отправлен на {emailLinkValue}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={emailLinkCode}
                  onChange={(e) => setEmailLinkCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl soft-input text-center text-2xl font-bold tracking-[0.3em] text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#f77430]"
                />
                <button
                  onClick={verifyEmailLink}
                  disabled={identityAction === 'email' || emailLinkCode.length !== 6}
                  className="w-full rounded-xl bg-[#f77430] py-3 font-semibold text-white disabled:opacity-50"
                >
                  {identityAction === 'email' ? 'Проверяем...' : 'Привязать email'}
                </button>
                <button
                  onClick={() => setEmailLinkStep('email')}
                  className="w-full rounded-xl py-2 text-sm font-medium text-gray-500"
                >
                  Изменить email
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Language Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowLanguageModal(false)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Выбор языка</h3>
              <button onClick={() => setShowLanguageModal(false)} className="p-2">
                <X className="text-gray-400" size={24} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => changeLanguage('ru')}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${language === 'ru' ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🇷🇺</span>
                  <span className="font-medium text-gray-900 dark:text-white">Русский</span>
                </div>
                {language === 'ru' && <Check className="text-[#f77430]" size={20} />}
              </button>
              <button
                onClick={() => changeLanguage('en')}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${language === 'en' ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🇬🇧</span>
                  <span className="font-medium text-gray-900 dark:text-white">English</span>
                </div>
                {language === 'en' && <Check className="text-[#f77430]" size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowThemeModal(false)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Выбор темы</h3>
              <button onClick={() => setShowThemeModal(false)} className="p-2">
                <X className="text-gray-400" size={24} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => changeTheme('light')}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${theme === 'light' ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Sun className="text-yellow-500" size={24} />
                  <span className="font-medium text-gray-900 dark:text-white">Светлая</span>
                </div>
                {theme === 'light' && <Check className="text-[#f77430]" size={20} />}
              </button>
              <button
                onClick={() => changeTheme('dark')}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${theme === 'dark' ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Moon className="text-[#f29b41]" size={24} />
                  <span className="font-medium text-gray-900 dark:text-white">Тёмная</span>
                </div>
                {theme === 'dark' && <Check className="text-[#f77430]" size={20} />}
              </button>
              <button
                onClick={() => changeTheme('system')}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${theme === 'system' ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Monitor className="text-gray-500" size={24} />
                  <span className="font-medium text-gray-900 dark:text-white">Как в системе</span>
                </div>
                {theme === 'system' && <Check className="text-[#f77430]" size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowNotificationsModal(false)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Уведомления</h3>
              <button onClick={() => setShowNotificationsModal(false)} className="p-2">
                <X className="text-gray-400" size={24} />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-4 py-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Push-уведомления</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Статус заказов, акции</p>
                </div>
                <button
                  onClick={toggleNotifications}
                  className={`w-14 h-8 rounded-full transition-colors relative ${notifications ? 'bg-[#f77430]' : 'bg-gray-300'
                    }`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${notifications ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                </button>
              </div>
              <p className="text-sm text-gray-500 text-center">
                Мы будем отправлять только важные уведомления о ваших заказах и специальных предложениях
              </p>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
