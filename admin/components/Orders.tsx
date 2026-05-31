'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ordersApi } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/auth'
import type { AdminOrder, OrderStatus, OrdersQueryParams } from '@/lib/types'
import Button from '@/components/ui/Button'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { SortableHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { useToast } from '@/components/ui/ToastProvider'
import { Package, Download } from 'lucide-react'

// -- Helpers ----------------------------------------------------------

const fmtPrice = (v: unknown): string =>
  `₽${Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`

const hasDiscount = (order: AdminOrder): boolean =>
  Number(order.promoDiscount || 0) > 0 ||
  Number(order.discount || 0) > 0 ||
  Number(order.bonusUsed || 0) > 0

const CANCELLABLE = new Set<OrderStatus>(['PENDING', 'FAILED'])
const RETRYABLE = new Set<OrderStatus>(['PAID'])
const PENDING_PAID_RECOVERY = 'pending_paid_recovery'
const RECONCILE_FINALIZABLE = new Set([
  'issued_but_finalize_failed',
  'topup_issued_but_finalize_failed',
])

type SortField = 'createdAt' | 'totalAmount' | 'productPrice' | 'status'

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'PENDING', label: 'Ожидает оплаты' },
  { value: 'PAID', label: 'Оплачен' },
  { value: 'PROCESSING', label: 'В обработке' },
  { value: 'COMPLETED', label: 'Выполнен' },
  { value: 'FAILED', label: 'Ошибка' },
  { value: 'CANCELLED', label: 'Отменен' },
  { value: 'REFUNDED', label: 'Возврат' },
] as const

const STATUS_TEXT: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]),
)

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  PAID: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-700',
  REFUNDED: 'bg-gray-100 text-gray-700',
}

// -- CSV Export --------------------------------------------------------

function exportOrdersCsv(orders: AdminOrder[]) {
  const headers = [
    'ID', 'Пользователь', 'Продукт', 'Страна',
    'Цена', 'Промокод', 'Скидка промокод', 'Скидка лояльность',
    'Бонусы', 'Итого оплачено', 'Статус', 'Дата',
  ]

  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

  const rows = orders.map((o) => [
    o.id,
    o.user?.firstName || o.user?.username || '',
    o.product?.name || '',
    o.product?.country || '',
    Number(o.productPrice || 0),
    o.promoCode || '',
    Number(o.promoDiscount || 0),
    Number(o.discount || 0),
    Number(o.bonusUsed || 0),
    Number(o.totalAmount || 0),
    STATUS_TEXT[o.status] || o.status,
    new Date(o.createdAt).toLocaleDateString('ru-RU'),
  ])

  // Semicolon delimiter for Russian Excel locale, UTF-8 BOM
  const csv = [headers, ...rows]
    .map(row => row.map(escape).join(';'))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// -- Component --------------------------------------------------------

export default function Orders() {
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const rawStatus = searchParams.get('status')
  const statusFilter = STATUS_OPTIONS.some((option) => option.value === rawStatus)
    ? (rawStatus as OrderStatus | '')
    : ''
  const rawSortBy = searchParams.get('sortBy')
  const sortBy: SortField =
    rawSortBy === 'createdAt' ||
    rawSortBy === 'totalAmount' ||
    rawSortBy === 'productPrice' ||
    rawSortBy === 'status'
      ? rawSortBy
      : 'createdAt'
  const rawSortOrder = searchParams.get('sortOrder')
  const sortOrder: 'asc' | 'desc' = rawSortOrder === 'asc' ? 'asc' : 'desc'

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    mutate(nextParams)
    if (!nextParams.get('page')) nextParams.set('page', '1')
    router.replace(`${pathname}?${nextParams.toString()}`)
  }, [pathname, router, searchParams])

  useEffect(() => {
    const normalized = new URLSearchParams()
    normalized.set('page', String(page))
    if (statusFilter) normalized.set('status', statusFilter)
    if (sortBy !== 'createdAt') normalized.set('sortBy', sortBy)
    if (sortOrder !== 'desc') normalized.set('sortOrder', sortOrder)

    if (normalized.toString() !== searchParams.toString()) {
      router.replace(`${pathname}?${normalized.toString()}`)
    }
  }, [page, pathname, router, searchParams, sortBy, sortOrder, statusFilter])

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params: OrdersQueryParams = { page, limit: 20, sortBy, sortOrder }
      if (statusFilter) params.status = statusFilter
      const response = await ordersApi.getAll(params)
      if (response.data) {
        setOrders(response.data.data || [])
        setTotalPages(response.data.meta?.totalPages || 1)
        setTotalCount(response.data.meta?.total || 0)
      }
    } catch (error) {
      if (isUnauthorizedError(error)) return
      console.error('Ошибка загрузки заказов:', error)
      setError('Не удалось загрузить список заказов')
    } finally {
      setLoading(false)
    }
  }, [page, sortBy, sortOrder, statusFilter])

  useEffect(() => { loadOrders() }, [loadOrders])

  // -- Handlers -------------------------------------------------------

  const handleStatusChange = (value: OrderStatus | '') => {
    replaceParams((params) => {
      if (value) params.set('status', value)
      else params.delete('status')
      params.set('page', '1')
    })
  }

  const handleSort = (field: SortField) => {
    replaceParams((params) => {
      if (sortBy === field) {
        params.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')
      } else {
        params.set('sortBy', field)
        params.delete('sortOrder')
      }
      params.set('page', '1')
    })
  }

  const handleCancel = async (orderId: string) => {
    const confirmed = await confirmDialog({
      title: 'Отмена заказа',
      description: 'Отменить заказ? Это действие необратимо.',
      confirmLabel: 'Отменить заказ',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await ordersApi.cancel(orderId)
      toast.success('Заказ отменен')
      loadOrders()
    } catch (error: unknown) {
      console.error('Ошибка отмены заказа:', error)
      const errorMessage =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(errorMessage || 'Ошибка отмены заказа')
    }
  }

  const handleRetryFulfillment = async (orderId: string) => {
    const confirmed = await confirmDialog({
      title: 'Повторный запуск fulfillment',
      description: 'Повторно передать оплаченный заказ в canonical fulfillment pipeline?',
      confirmLabel: 'Запустить повторно',
    })
    if (!confirmed) return

    try {
      await ordersApi.retryFulfillment(orderId)
      toast.success('Fulfillment повторно запущен')
      loadOrders()
    } catch (error: unknown) {
      console.error('Ошибка повторного запуска fulfillment:', error)
      const errorMessage =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(errorMessage || 'Не удалось повторно запустить fulfillment')
    }
  }

  const handleRecoverPaidPending = async (orderId: string) => {
    const confirmed = await confirmDialog({
      title: 'Восстановить оплату заказа',
      description: 'Перевести pending-заказ с уже зафиксированной оплатой обратно в canonical fulfillment pipeline?',
      confirmLabel: 'Запустить recovery',
    })
    if (!confirmed) return

    try {
      await ordersApi.recoverPaidPending(orderId)
      toast.success('Recovery оплаты запущен')
      loadOrders()
    } catch (error: unknown) {
      console.error('Ошибка recovery оплаченного pending-заказа:', error)
      const errorMessage =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(errorMessage || 'Не удалось запустить recovery оплаты')
    }
  }

  const handleFulfillFree = async (orderId: string) => {
    const confirmed = await confirmDialog({
      title: 'Выполнить бесплатный заказ',
      description: 'Запустить fulfillment для бесплатного заказа без повторной оплаты?',
      confirmLabel: 'Выполнить',
    })
    if (!confirmed) return

    try {
      await ordersApi.fulfillFree(orderId)
      toast.success('Бесплатный заказ отправлен в fulfillment')
      loadOrders()
    } catch (error: unknown) {
      console.error('Ошибка выполнения бесплатного заказа:', error)
      const errorMessage =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(errorMessage || 'Не удалось выполнить бесплатный заказ')
    }
  }

  const handleFinalizeReconcile = async (orderId: string) => {
    const confirmed = await confirmDialog({
      title: 'Дофинализировать заказ',
      description: 'Завершить локальную финализацию заказа без повторного вызова провайдера?',
      confirmLabel: 'Дофинализировать',
    })
    if (!confirmed) return

    try {
      await ordersApi.finalizeReconcile(orderId)
      toast.success('Заказ дофинализирован')
      loadOrders()
    } catch (error: unknown) {
      console.error('Ошибка локальной финализации заказа:', error)
      const errorMessage =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(errorMessage || 'Не удалось дофинализировать заказ')
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const params: OrdersQueryParams = { page: 1, limit: 10000, sortBy, sortOrder }
      if (statusFilter) params.status = statusFilter
      const response = await ordersApi.getAll(params)
      exportOrdersCsv(response.data?.data || [])
    } catch (error) {
      console.error('Ошибка экспорта:', error)
      toast.error('Не удалось экспортировать заказы')
    } finally {
      setExporting(false)
    }
  }

  // -- Render ---------------------------------------------------------

  if (loading) {
    return (
      <div className="glass-card p-8">
        <Spinner centered />
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card glass-card--static p-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Не удалось загрузить заказы</h2>
        <p className="mt-2 text-slate-600">{error}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={loadOrders}>Повторить</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card glass-card--static p-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold">
          Все заказы
          <span className="ml-2 text-base font-normal text-slate-500">({totalCount})</span>
        </h2>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => handleStatusChange(e.target.value as OrderStatus | '')}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <Button
            onClick={handleExport}
            disabled={exporting || orders.length === 0}
            variant="secondary"
            className="bg-green-50 text-green-700 hover:bg-green-100"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Экспорт…' : 'Excel'}
          </Button>

          <Button onClick={loadOrders} variant="ghost" size="sm" className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-700">
            Обновить
          </Button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg">Пока нет заказов</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow className="border-b border-slate-200">
                  <TableHeaderCell>ID</TableHeaderCell>
                  <TableHeaderCell>Пользователь</TableHeaderCell>
                  <TableHeaderCell>Продукт</TableHeaderCell>
                  <SortableHeader active={sortBy === 'productPrice'} direction={sortOrder} onClick={() => handleSort('productPrice')}>
                    Цена
                  </SortableHeader>
                  <SortableHeader active={sortBy === 'status'} direction={sortOrder} onClick={() => handleSort('status')}>
                    Статус
                  </SortableHeader>
                  <SortableHeader active={sortBy === 'createdAt'} direction={sortOrder} onClick={() => handleSort('createdAt')}>
                    Дата
                  </SortableHeader>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => {
                  const discounted = hasDiscount(order)
                  const promoAmt = Number(order.promoDiscount || 0)
                  const loyaltyAmt = Number(order.discount || 0)
                  const bonusAmt = Number(order.bonusUsed || 0)
                  const canRetryFulfillment = RETRYABLE.has(order.status)
                  const canRecoverPaidPending =
                    order.status === 'PENDING' &&
                    order.reconciliation?.category === PENDING_PAID_RECOVERY
                  const canFulfillFree =
                    order.status === 'PENDING' &&
                    Number(order.totalAmount || 0) <= 0
                  const canFinalizeReconcile =
                    order.status === 'PROCESSING' &&
                    RECONCILE_FINALIZABLE.has(order.reconciliation?.category || '')

                  return (
                    <TableRow
                      key={order.id}
                      className="border-b border-slate-100 hover:bg-white/50 transition-colors"
                    >
                      <TableCell className="font-mono text-sm">
                        #{order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {order.user?.firstName || order.user?.username || 'Пользователь'}
                      </TableCell>
                      <TableCell>
                        {order.product?.name || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {discounted ? (
                          <div className="text-sm space-y-0.5">
                            <div className="text-slate-400 line-through">
                              {fmtPrice(order.productPrice)}
                            </div>
                            {promoAmt > 0 && (
                              <div className="text-orange-600">
                                −{fmtPrice(promoAmt)}{' '}
                                {order.promoCode && (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 text-xs font-medium">
                                    {order.promoCode}
                                  </span>
                                )}
                              </div>
                            )}
                            {loyaltyAmt > 0 && (
                              <div className="text-purple-600">
                                −{fmtPrice(loyaltyAmt)} лояльность
                              </div>
                            )}
                            {bonusAmt > 0 && (
                              <div className="text-green-600">
                                −{fmtPrice(bonusAmt)} бонусы
                              </div>
                            )}
                            <div className="font-bold text-slate-900 pt-0.5 border-t border-slate-200">
                              {fmtPrice(order.totalAmount)}
                            </div>
                          </div>
                        ) : (
                          <span className="font-bold">
                            {fmtPrice(order.totalAmount)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_TEXT[order.status] || order.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                      </TableCell>
                      <TableCell>
                        {canRetryFulfillment && (
                          <Button
                            onClick={() => handleRetryFulfillment(order.id)}
                            variant="ghost"
                            size="sm"
                            className="px-0 text-xs text-blue-600 hover:bg-transparent hover:text-blue-700"
                          >
                            Retry fulfillment
                          </Button>
                        )}
                        {canRecoverPaidPending && (
                          <Button
                            onClick={() => handleRecoverPaidPending(order.id)}
                            variant="ghost"
                            size="sm"
                            className="px-0 text-xs text-blue-600 hover:bg-transparent hover:text-blue-700"
                          >
                            Recovery оплаты
                          </Button>
                        )}
                        {canFulfillFree && (
                          <Button
                            onClick={() => handleFulfillFree(order.id)}
                            variant="ghost"
                            size="sm"
                            className="px-0 text-xs text-emerald-600 hover:bg-transparent hover:text-emerald-700"
                          >
                            Выполнить бесплатно
                          </Button>
                        )}
                        {canFinalizeReconcile && (
                          <Button
                            onClick={() => handleFinalizeReconcile(order.id)}
                            variant="ghost"
                            size="sm"
                            className="px-0 text-xs text-amber-600 hover:bg-transparent hover:text-amber-700"
                          >
                            Дофинализировать
                          </Button>
                        )}
                        {CANCELLABLE.has(order.status) && (
                          <Button onClick={() => handleCancel(order.id)} variant="ghost" size="sm" className="px-0 text-xs text-red-500 hover:bg-transparent hover:text-red-700">
                            Отменить
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={(nextPage) => replaceParams((params) => {
            params.set('page', String(nextPage))
          })} />
        </>
      )}
    </div>
  )
}
