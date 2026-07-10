'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle, XCircle, AlertCircle, ChevronRight, ShoppingBag, RefreshCw } from '@/components/icons'
import BottomNav from '@/components/BottomNav'
import BackHeader from '@/components/BackHeader'
import { ordersApi, type Order } from '@/lib/api'
import { getFlagUrl } from '@/lib/utils'
import { useAuth } from '@/components/AuthProvider'

export default function OrdersPage() {
  const router = useRouter()
  const { user: authUser, isLoading: authLoading } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const loadOrders = useCallback(async () => {
    try {
      let userId: string | null = authUser?.id || null

      if (!userId) {
        const { getToken } = await import('@/lib/auth')
        const token = getToken()
        if (token) {
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          userId = data.id
        } else {
          window.location.href = '/login'
          return
        }
      }

      if (userId) {
        const userOrders = await ordersApi.getMy(userId)
        setOrders(userOrders)
      }
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
    } finally {
      setLoading(false)
    }
  }, [authUser?.id])

  useEffect(() => {
    if (authLoading) return
    void loadOrders()
  }, [authLoading, loadOrders])

  const getStatusConfig = (status: Order['status']) => {
    const configs = {
      PENDING: { label: 'Ожидает оплаты', icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50' },
      PAID: { label: 'Оплачен', icon: CheckCircle, color: 'text-[#f77430]', bg: 'bg-orange-50' },
      PROCESSING: { label: 'Обработка', icon: Clock, color: 'text-[#f77430]', bg: 'bg-orange-50' },
      COMPLETED: { label: 'Выполнен', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
      FAILED: { label: 'Ошибка', icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
      REFUNDED: { label: 'Возврат', icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50' },
      CANCELLED: { label: 'Отменён', icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
    }
    return configs[status]
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
        <BackHeader title="Мои заказы" fallbackRoute="/profile" />
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card">
              <div className="skeleton h-6 w-32 mb-2" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <BackHeader title="Мои заказы" fallbackRoute="/profile" />

      {orders.length === 0 ? (
        <div className="glass-card text-center py-16 animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="text-muted" size={40} />
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">Нет заказов</h3>
          <p className="text-muted text-sm mb-6">
            Вы ещё не совершали покупок
          </p>
          <Link
            href="/"
            className="glass-button inline-flex"
            style={{ width: 'auto', padding: '12px 32px' }}
          >
            Перейти в каталог
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order, index) => {
            const statusConfig = getStatusConfig(order.status)
            const StatusIcon = statusConfig.icon
            
            return (
              <div
                key={order.id}
                className="glass-card animate-slide-up cursor-pointer"
                style={{ animationDelay: `${0.05 * (index + 1)}s` }}
                onClick={() => router.push(`/order/${order.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    router.push(`/order/${order.id}`)
                  }
                }}
                role="link"
                tabIndex={0}
              >
                <div className="flex items-center gap-4">
                  {/* Country Flag */}
                  <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {getFlagUrl(order.product.country) ? (
                      <img
                        src={getFlagUrl(order.product.country)}
                        alt={order.product.country}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img src="/logo-mark.png" alt="Mojo mobile" className="w-8 h-8 rounded-lg object-contain" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-primary truncate">
                        {order.product.country}
                      </h3>
                      <p className="font-bold text-accent shrink-0">₽{order.totalAmount}</p>
                    </div>
                    <p className="text-sm text-secondary">{order.product.name}</p>

                    <div className="flex items-center justify-between mt-2">
                      <div className={`flex items-center gap-1 text-xs ${statusConfig.color}`}>
                        <StatusIcon size={14} />
                        <span>{statusConfig.label}</span>
                      </div>
                      <p className="text-xs text-muted">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/product/${order.productId}`)
                    }}
                    className="shrink-0 p-2 rounded-xl bg-orange-50 hover:bg-orange-100 transition-colors"
                    title="Повторить заказ"
                    aria-label="Повторить заказ"
                  >
                    <RefreshCw className="text-[#f77430]" size={18} />
                  </button>

                  <ChevronRight className="text-muted shrink-0" size={18} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
