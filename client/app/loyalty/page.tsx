'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Gift, TrendingUp, Wallet } from '@/components/icons'
import BackHeader from '@/components/BackHeader'
import BottomNav from '@/components/BottomNav'
import { LoyaltyProgram, loyaltyApi } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'

function formatMoney(amount: number) {
  return `₽${Math.round(amount).toLocaleString('ru-RU')}`
}

export default function LoyaltyPage() {
  const router = useRouter()
  const { token, isLoading: authLoading, isTelegram, authError } = useAuth()
  const [program, setProgram] = useState<LoyaltyProgram | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!token) {
      if (!isTelegram) {
        router.replace('/login?returnTo=/loyalty')
      }
      setLoading(false)
      return
    }

    void loadProgram()
  }, [authLoading, token, isTelegram, router])

  const loadProgram = async () => {
    try {
      const data = await loyaltyApi.getMyProgram()
      setProgram(data)
    } catch (error) {
      console.error('Loyalty load error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950">
        <div className="skeleton h-8 w-40 mb-6 mt-6" />
        <div className="skeleton h-40 w-full rounded-3xl mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="skeleton h-28 w-full rounded-2xl" />
          <div className="skeleton h-28 w-full rounded-2xl" />
        </div>
        <div className="skeleton h-64 w-full rounded-2xl" />
        <BottomNav />
      </div>
    )
  }

  if (!program) {
    if (isTelegram && authError === 'telegram-auth-required') {
      const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'mojo_mobile_bot'

      return (
        <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 mt-6">Система лояльности</h1>
          <p className="text-sm text-gray-500 mb-6">
            Для открытия страницы нужен корректный запуск Mini App через Telegram.
          </p>
            <div className="card-neutral p-5 border border-amber-200 bg-amber-50 text-amber-900">
              <p className="text-sm font-medium mb-2">Не удалось подтвердить Telegram-сессию.</p>
              <p className="text-sm text-amber-800 mb-4">
                Откройте приложение из бота заново, чтобы загрузить ваш уровень лояльности.
              </p>
              <a
                href={`https://telegram.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-[#f77430] px-4 py-3 text-sm font-medium text-white"
              >
                Открыть бота
              </a>
            </div>
          <BottomNav />
        </div>
      )
    }

    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 mt-6">Система лояльности</h1>
        <p className="text-sm text-gray-500">
          Не удалось загрузить данные программы. Попробуйте открыть страницу ещё раз.
        </p>
        <BottomNav />
      </div>
    )
  }

  const currentLevelName = program.currentLevel?.name || 'Базовый уровень'

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950">
      <BackHeader title="Система лояльности" fallbackRoute="/profile" className="mb-6" />
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#f77430] via-[#f29b41] to-[#f9d17f] p-6 text-white shadow-[0_20px_50px_rgba(242,116,48,0.28)] mb-6">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-black/10 blur-2xl" />

          <div className="relative">
            <p className="text-sm uppercase tracking-[0.24em] text-white/70 mb-2">Ваш уровень</p>
            <h2 className="text-3xl font-bold mb-2">{currentLevelName}</h2>
            <p className="text-sm text-white/85 mb-5">
              Сейчас у вас {program.currentDiscount}% скидки и {program.currentCashbackPercent}% cashback с каждой успешной покупки.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/15 p-4 backdrop-blur">
                <p className="text-xs text-white/70 mb-1">Потрачено</p>
                <p className="text-2xl font-bold">{formatMoney(program.totalSpent)}</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-4 backdrop-blur">
                <p className="text-xs text-white/70 mb-1">Бонусный баланс</p>
                <p className="text-2xl font-bold">{formatMoney(program.bonusBalance)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="card-neutral p-4">
            <TrendingUp className="text-[#f77430] mb-2" size={24} />
            <p className="text-xs text-gray-500 mb-1">Скидка сейчас</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{program.currentDiscount}%</p>
          </div>
          <div className="card-neutral p-4">
            <Wallet className="text-[#f77430] mb-2" size={24} />
            <p className="text-xs text-gray-500 mb-1">Cashback сейчас</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{program.currentCashbackPercent}%</p>
          </div>
        </div>

        <div className="card-neutral p-5 mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">До следующего уровня</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {program.nextLevel ? program.nextLevel.name : 'Максимальный уровень'}
              </p>
            </div>
            <div className="rounded-2xl bg-orange-50 dark:bg-amber-900/30 px-3 py-2 text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {program.nextLevel ? 'Осталось потратить' : 'Статус'}
              </p>
              <p className="font-semibold text-[#f77430]">
                {program.nextLevel ? formatMoney(program.amountToNextLevel) : 'Достигнут'}
              </p>
            </div>
          </div>

          <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f77430] to-[#f29b41] transition-all"
              style={{ width: `${Math.max(6, program.progressToNextLevel)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{formatMoney(program.currentLevel?.minSpent || 0)}</span>
            <span>{Math.round(program.progressToNextLevel)}%</span>
            <span>{program.nextLevel ? formatMoney(program.nextLevel.minSpent) : 'MAX'}</span>
          </div>
        </div>

        <div className="card-neutral p-5 mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Уровни программы</h3>
          <div className="flex flex-col gap-3">
            {program.levels.map((level) => {
              const isCurrent = level.id === program.effectiveLevelId
              const isReached = program.totalSpent >= level.minSpent

              return (
                <div
                  key={level.id}
                  className={`rounded-2xl border px-4 py-4 ${
                    isCurrent
                      ? 'border-[#f77430] dark:border-[#f77430]/70 bg-orange-50 dark:bg-[#f77430]/20'
                      : isReached
                        ? 'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{level.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        От {formatMoney(level.minSpent)} суммарных покупок
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full bg-[#f77430] px-2.5 py-1 text-xs font-semibold text-white">
                        Текущий
                      </span>
                    ) : isReached ? (
                      <CheckCircle className="text-green-600" size={20} />
                    ) : null}
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <span className="rounded-full bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                      Скидка {level.discount}%
                    </span>
                    <span className="rounded-full bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                      Cashback {level.cashbackPercent}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card-neutral p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Правила программы</h3>
          <div className="flex flex-col gap-4 text-sm text-gray-600 dark:text-gray-400">
            {[
              'Ваш уровень зависит от общей суммы завершённых покупок eSIM.',
              'Скидка уровня применяется к новой покупке до списания бонусов и промокодов.',
              'Cashback начисляется после успешного завершения заказа и попадает в бонусный баланс.',
              'Top-up пакеты не повышают уровень и не начисляют cashback по программе лояльности.',
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-50 dark:bg-amber-900/30 text-[#f77430]">
                  {index === 2 ? <Gift size={16} /> : <CheckCircle size={16} />}
                </div>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      <BottomNav />
    </div>
  )
}
