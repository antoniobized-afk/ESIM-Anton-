'use client'

import Link from 'next/link'
import { ChevronRight, DollarSign, Gift, LogOut } from '@/components/icons'
import type { ReferralStats } from '@/lib/api'
import type { UserProfile } from './types'

interface BalanceCardProps {
  user: UserProfile | null
}

interface PromoCodeCardProps {
  promoCode: string
  onPromoCodeChange: (value: string) => void
  onApply: () => void
}

interface ReferralBannerProps {
  referralStats: ReferralStats | null
  onShare: () => void
}

export function ProfileHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Аккаунт</h1>
      <button
        onClick={onLogout}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#f2622a] hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
      >
        <LogOut size={16} />
        Выйти
      </button>
    </div>
  )
}

export function BalanceCard({ user }: BalanceCardProps) {
  return (
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
              <p className="text-xl font-bold text-gray-900 dark:text-white">₽ {user?.balance || 0}</p>
            </div>
          </div>
          <ChevronRight className="text-gray-400" size={20} />
        </div>
      </Link>
    </section>
  )
}

export function PromoCodeCard({ promoCode, onPromoCodeChange, onApply }: PromoCodeCardProps) {
  return (
    <section className="mb-6">
      <div className="card-neutral p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => onPromoCodeChange(e.target.value.toUpperCase())}
            placeholder="Промокод"
            className="flex-1 px-4 py-3 rounded-xl soft-input text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f77430]"
          />
          <button
            onClick={onApply}
            className="px-6 py-3 bg-[#f77430] hover:bg-[#f2622a] text-white font-medium rounded-xl transition-colors"
          >
            Ok
          </button>
        </div>
      </div>
    </section>
  )
}

export function ReferralBanner({ referralStats, onShare }: ReferralBannerProps) {
  const referralBannerTitle = referralStats?.enabled
    ? `Получайте ${referralStats.referralPercent}% с покупок друзей`
    : 'Реферальная программа временно недоступна'

  const referralBannerDescription = referralStats?.enabled
    ? `Поделитесь своей ссылкой. Реферальные бонусы доступны к использованию от ${referralStats.minPayout} ₽.`
    : 'Подробности и статус программы доступны на экране рефералов.'

  const referralButtonLabel = referralStats?.enabled ? 'Поделиться ссылкой' : 'Открыть рефералы'

  return (
    <section className="mb-6">
      <div className="relative overflow-hidden card-accent p-5">
        <div className="relative z-10">
          <p className="text-white font-semibold text-lg mb-3">{referralBannerTitle}</p>
          <p className="text-sm text-white/90 mb-4 max-w-[18rem]">{referralBannerDescription}</p>
          <button
            onClick={onShare}
            className="px-5 py-2.5 bg-white text-[#f77430] font-semibold rounded-xl shadow-lg hover:shadow-xl transition-shadow"
          >
            {referralButtonLabel}
          </button>
        </div>
        <div className="absolute right-4 bottom-2 opacity-90">
          <Gift size={80} className="text-white/30" />
        </div>
      </div>
    </section>
  )
}
