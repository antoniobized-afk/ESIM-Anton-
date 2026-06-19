'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { RefreshCw, Wifi, AlertCircle, CheckCircle2, Wallet, CreditCard } from '@/components/icons'
import BottomNav from '@/components/BottomNav'
import { ordersApi, userApi, type TopupPackage, type Order } from '@/lib/api'
import BackHeader from '@/components/BackHeader'
import { useAuth } from '@/components/AuthProvider'
import { payCloudPayments } from '@/lib/cloudpayments'

// Расширяем тип TopupPackage из api.ts: бэкенд теперь добавляет priceRub/priceUsd
interface TopupPackagePriced extends TopupPackage {
  priceRub?: number
  priceUsd?: number
}

function formatVolume(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} МБ`
  return `${bytes} Б`
}

export default function TopupPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = String(params?.orderId || '')

  const { user: authUser, isLoading: authLoading } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [packages, setPackages] = useState<TopupPackagePriced[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'card'>('card')
  // Выбранное число дней для Day Pass пакетов (supportTopUpType = 3), по packageCode.
  const [daysByPkg, setDaysByPkg] = useState<Record<string, number>>({})

  // Day Pass пополнение: цена пакета указана за день, нужно выбрать число дней.
  const isDayPass = (pkg: TopupPackagePriced) => pkg.supportTopUpType === 3
  const getDays = (pkg: TopupPackagePriced) =>
    isDayPass(pkg) ? daysByPkg[pkg.packageCode] ?? 1 : 1
  const setDays = (code: string, value: number) =>
    setDaysByPkg((prev) => ({
      ...prev,
      [code]: Math.min(365, Math.max(1, Math.floor(value) || 1)),
    }))

  // Подгружаем актуальный баланс пользователя — нужен для подсветки кнопки
  // «С баланса» и проверки достаточности средств перед сабмитом.
  useEffect(() => {
    if (authLoading) return
    if (!authUser?.id) return
    void loadBalance(authUser.id)
  }, [authLoading, authUser?.id])

  const loadBalance = async (userId: string) => {
    try {
      const u = await userApi.getProfile(userId)
      const b = Number(u.balance) || 0
      setBalance(b)
      // Если баланса хватает — по умолчанию предлагаем оплату с баланса
      // (один клик вместо редиректа в Robokassa).
      if (b > 0) setPaymentMethod('balance')
    } catch (e) {
      console.warn('Не удалось получить баланс:', e)
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const o = await ordersApi.getById(orderId)
      setOrder(o)

      if (!o.iccid) {
        setError('eSIM ещё не выдана — пополнение пока недоступно')
        return
      }

      const pkgs = await ordersApi.getTopupPackages(orderId)
      setPackages(
        (pkgs as TopupPackagePriced[]).filter((p) => p.supportTopup !== false),
      )
    } catch (e: any) {
      setError(
        e.response?.data?.message ||
          e.message ||
          'Не удалось загрузить пакеты пополнения',
      )
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    void loadData()
  }, [orderId, loadData])

  const handleTopup = async (pkg: TopupPackagePriced) => {
    const days = getDays(pkg)
    const priceRub = Number(pkg.priceRub || 0) * days
    if (paymentMethod === 'balance' && balance !== null && priceRub > balance) {
      setError(`Недостаточно средств: нужно ${priceRub}₽, на балансе ${balance}₽. Пополните баланс.`)
      return
    }
    const daysSuffix = isDayPass(pkg) ? ` на ${days} дн.` : ''
    const confirmText =
      paymentMethod === 'balance'
        ? `Списать ${priceRub}₽ с баланса и пополнить «${pkg.name}»${daysSuffix}?`
        : `Перейти к оплате «${pkg.name}»${daysSuffix} картой (${priceRub}₽)?`
    if (!confirm(confirmText)) return

    setSubmitting(pkg.packageCode)
    setError(null)
    setSuccess(null)
    try {
      const data = await ordersApi.topup(orderId, {
        packageCode: pkg.packageCode,
        paymentMethod,
        // periodNum нужен только для Day Pass и только когда дней больше одного
        // (для одного дня бэкенд полагается на дефолт провайдера).
        ...(isDayPass(pkg) && days > 1 ? { periodNum: days } : {}),
      })
      if (data?.paymentMethod === 'card' && data?.order?.id) {
        const publicId = process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID
        if (!publicId) {
          throw new Error('Платёжный шлюз не настроен (NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID)')
        }
        const result = await payCloudPayments({
          publicId,
          description: `Пополнение eSIM ${order?.product?.country ?? ''} #${data.order.id.slice(-8)}`,
          amount: Number(data.order.totalAmount ?? priceRub),
          currency: 'RUB',
          invoiceId: data.order.id,
          accountId: authUser?.id || '',
          email: authUser?.email || undefined,
          data: {
            purpose: 'esim_topup',
            parentOrderId: orderId,
          },
        })
        if (!result.success) {
          throw new Error(result.reason || 'Оплата не была завершена')
        }
        setSuccess('✅ Оплата принята, пополнение обрабатывается...')
        setTimeout(() => router.push(`/order/${data.order.id}`), 900)
        return
      }
      setSuccess(`✅ eSIM пополнена пакетом «${pkg.name}»`)
      setTimeout(() => router.push('/my-esim'), 1500)
    } catch (e: any) {
      setError(
        e.response?.data?.message || e.message || 'Не удалось выполнить пополнение',
      )
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <BackHeader title="Пополнение трафика" fallbackRoute="/my-esim" />

      <div className="flex flex-col gap-4">
        {order && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Wifi className="text-[#f77430]" size={24} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {order.product.country} — {order.product.dataAmount}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  ICCID: {order.iccid || '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Способ оплаты */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
            Способ оплаты
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('balance')}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 transition-colors ${
                paymentMethod === 'balance'
                  ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-[#f77430]" />
                <span className="font-medium text-gray-900 dark:text-white">С баланса</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {balance !== null ? `Доступно ${balance} ₽` : '—'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 transition-colors ${
                paymentMethod === 'card'
                  ? 'border-[#f77430] bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-[#f77430]" />
                <span className="font-medium text-gray-900 dark:text-white">Картой</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Visa, MasterCard, МИР
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" size={20} />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle2 className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" size={20} />
            <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4">
                <div className="skeleton h-5 w-32 mb-2" />
                <div className="skeleton h-4 w-48" />
              </div>
            ))}
          </div>
        ) : packages.length === 0 && !error ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Для этой eSIM пополнение недоступно у провайдера.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {packages.map((pkg) => {
              const dayPass = isDayPass(pkg)
              const days = getDays(pkg)
              const unitPrice = Number(pkg.priceRub || 0)
              const priceRub = unitPrice * days
              const insufficient =
                paymentMethod === 'balance' &&
                balance !== null &&
                priceRub > balance
              return (
                <div
                  key={pkg.packageCode}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {pkg.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {formatVolume(pkg.volume)}
                        {dayPass ? ' / день' : ` · ${pkg.duration} ${pkg.durationUnit || 'дн'}`}
                        {pkg.speed ? ` · ${pkg.speed}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900 dark:text-white">
                        {priceRub} ₽
                      </p>
                      {dayPass && (
                        <p className="text-xs text-gray-400">{unitPrice} ₽ × {days} дн.</p>
                      )}
                    </div>
                  </div>

                  {dayPass && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Дней:</span>
                      <button
                        type="button"
                        onClick={() => setDays(pkg.packageCode, days - 1)}
                        disabled={days <= 1}
                        className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 disabled:opacity-40"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={days}
                        onChange={(e) => setDays(pkg.packageCode, parseInt(e.target.value))}
                        className="w-16 text-center py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f77430]/25"
                      />
                      <button
                        type="button"
                        onClick={() => setDays(pkg.packageCode, days + 1)}
                        disabled={days >= 365}
                        className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => handleTopup(pkg)}
                    disabled={submitting !== null || insufficient}
                    className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 ${
                      insufficient
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                        : 'bg-[#f77430] hover:bg-[#f2622a] text-white'
                    }`}
                  >
                    {submitting === pkg.packageCode ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Отправка...
                      </>
                    ) : insufficient ? (
                      <>Не хватает {priceRub - (balance || 0)} ₽</>
                    ) : paymentMethod === 'balance' ? (
                      <>
                        <Wallet size={16} />
                        Списать с баланса
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} />
                        Оплатить картой
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">
          После оплаты статус заказа обновится на странице заказа.
        </p>
      </div>

      <BottomNav />
    </div>
  )
}
