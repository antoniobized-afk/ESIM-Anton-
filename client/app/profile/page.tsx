'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { referralsApi, type ReferralStats } from '@/lib/api'
import {
  DollarSign, Smartphone, ShoppingBag, Globe, Moon, Bell, Sun, Monitor,
  ChevronRight, Gift, HelpCircle, FileText, MessageCircle, X, Check, LogOut
} from '@/components/icons'
import BottomNav from '@/components/BottomNav'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/components/ThemeProvider'
import packageJson from '@/package.json'

interface UserProfile {
  id: string
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
  balance: number
  bonusBalance: number
  referralCode: string
}

type Language = 'ru' | 'en'

export default function ProfilePage() {
  const { user: authUser, isLoading: authLoading } = useAuth()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [promoCode, setPromoCode] = useState('')
  const [language, setLanguage] = useState<Language>('ru')
  const [notifications, setNotifications] = useState(true)

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

  useEffect(() => {
    if (authLoading) return
    void loadUserData()
    void loadReferralStats()
    const savedLang = localStorage.getItem('language') as Language
    const savedNotifications = localStorage.getItem('notifications')

    if (savedLang) setLanguage(savedLang)
    if (savedNotifications !== null) setNotifications(savedNotifications === 'true')
  }, [authLoading, loadReferralStats, loadUserData])

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
