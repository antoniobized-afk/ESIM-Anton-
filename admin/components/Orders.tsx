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
import { Package } from 'lucide-react'
import OrderActionsCell from '@/components/orders/OrderActionsCell'
import OrderPriceCell from '@/components/orders/OrderPriceCell'
import OrderStatusCell from '@/components/orders/OrderStatusCell'
import OrdersToolbar from '@/components/orders/OrdersToolbar'
import { STATUS_OPTIONS, STATUS_TEXT } from '@/components/orders/orders.constants'

// -- Helpers ----------------------------------------------------------

type SortField = 'createdAt' | 'totalAmount' | 'productPrice' | 'status'

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
  const needsAttentionOnly = searchParams.get('reconciliation') === 'needs_attention'
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
    if (needsAttentionOnly) normalized.set('reconciliation', 'needs_attention')
    if (sortBy !== 'createdAt') normalized.set('sortBy', sortBy)
    if (sortOrder !== 'desc') normalized.set('sortOrder', sortOrder)

    if (normalized.toString() !== searchParams.toString()) {
      router.replace(`${pathname}?${normalized.toString()}`)
    }
  }, [needsAttentionOnly, page, pathname, router, searchParams, sortBy, sortOrder, statusFilter])

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params: OrdersQueryParams = { page, limit: 20, sortBy, sortOrder }
      if (statusFilter) params.status = statusFilter
      if (needsAttentionOnly) params.reconciliation = 'needs_attention'
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
  }, [needsAttentionOnly, page, sortBy, sortOrder, statusFilter])

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

  const handleNeedsAttentionToggle = () => {
    replaceParams((params) => {
      if (needsAttentionOnly) params.delete('reconciliation')
      else params.set('reconciliation', 'needs_attention')
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

  const handleRetryCompletionAccounting = async (orderId: string) => {
    const confirmed = await confirmDialog({
      title: 'Повторить учёт заказа',
      description: 'Повторить cashback/referral/partner accounting без повторного вызова провайдера?',
      confirmLabel: 'Повторить учёт',
    })
    if (!confirmed) return

    try {
      await ordersApi.retryCompletionAccounting(orderId)
      toast.success('Повторный учёт заказа запущен')
      loadOrders()
    } catch (error: unknown) {
      console.error('Ошибка повторного completion accounting:', error)
      const errorMessage =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(errorMessage || 'Не удалось повторить учёт заказа')
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const params: OrdersQueryParams = { page: 1, limit: 10000, sortBy, sortOrder }
      if (statusFilter) params.status = statusFilter
      if (needsAttentionOnly) params.reconciliation = 'needs_attention'
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
      <OrdersToolbar
        totalCount={totalCount}
        statusFilter={statusFilter}
        needsAttentionOnly={needsAttentionOnly}
        exporting={exporting}
        hasOrders={orders.length > 0}
        onStatusChange={handleStatusChange}
        onNeedsAttentionToggle={handleNeedsAttentionToggle}
        onExport={handleExport}
        onRefresh={loadOrders}
      />

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
                        <OrderPriceCell order={order} />
                      </TableCell>
                      <TableCell>
                        <OrderStatusCell order={order} />
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                      </TableCell>
                      <OrderActionsCell
                        order={order}
                        onRetryFulfillment={handleRetryFulfillment}
                        onRecoverPaidPending={handleRecoverPaidPending}
                        onFulfillFree={handleFulfillFree}
                        onFinalizeReconcile={handleFinalizeReconcile}
                        onRetryCompletionAccounting={handleRetryCompletionAccounting}
                        onCancel={handleCancel}
                      />
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
