'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { isUnauthorizedError } from '@/lib/auth'
import { marketingAttributionApi } from '@/lib/api'
import type {
  MarketingAttributionOrderDetailsQuery,
  MarketingAttributionOrderDetailsResponse,
  MarketingAttributionReport,
  MarketingAttributionReportRow,
} from '@/lib/marketing-attribution-report.types'
import { getAdminUserDisplayName } from '@/components/users/user-formatting'
import {
  formatMarketingDateTimeUtc,
  formatMarketingMoney,
} from './marketing-report-formatting'

interface AttributionOrderDetailsModalProps {
  row: MarketingAttributionReportRow
  filters: MarketingAttributionReport['filters']
  onClose: () => void
}

export default function AttributionOrderDetailsModal({
  row,
  filters,
  onClose,
}: AttributionOrderDetailsModalProps) {
  const requestGenerationRef = useRef(0)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<MarketingAttributionOrderDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const campaign = row.campaign
  const sourceName = campaign?.name ?? 'Прямой трафик'

  const loadOrders = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current
    let keepLoadingForPageCorrection = false
    const params: MarketingAttributionOrderDetailsQuery = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      model: filters.model,
      ...(filters.channel ? { channel: filters.channel } : {}),
      source: campaign ? 'CAMPAIGN' : 'DIRECT',
      ...(campaign ? { campaignId: campaign.id } : {}),
      page,
      limit: 50,
    }

    try {
      setLoading(true)
      setError(null)
      const response = await marketingAttributionApi.getAttributionOrderDetails(params)
      if (requestGeneration !== requestGenerationRef.current) return
      if (
        response.data.data.length === 0
        && response.data.meta.total > 0
        && page > response.data.meta.totalPages
      ) {
        keepLoadingForPageCorrection = true
        setPage(response.data.meta.totalPages)
        return
      }
      setResult(response.data)
    } catch (requestError) {
      if (requestGeneration !== requestGenerationRef.current) return
      if (isUnauthorizedError(requestError)) return
      setError('Не удалось загрузить заказы из строки отчёта')
    } finally {
      if (
        requestGeneration === requestGenerationRef.current
        && !keepLoadingForPageCorrection
      ) {
        setLoading(false)
      }
    }
  }, [campaign, filters, page])

  useEffect(() => {
    void loadOrders()
    return () => {
      requestGenerationRef.current += 1
    }
  }, [loadOrders])

  return (
    <Modal
      title={`Заказы: ${sourceName}`}
      description="Только завершённые primary-заказы из этой строки отчёта. Пополнения eSIM исключены."
      onClose={onClose}
      contentClassName="max-w-5xl p-6"
    >
      <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        UTC · {filters.dateFrom}—{filters.dateTo} · {row.metrics.purchases} покупок · {row.metrics.firstPurchases} первых в истории · {row.metrics.repeatPurchases} повторных
      </div>

      {loading ? <Spinner centered /> : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void loadOrders()}>
            Повторить
          </Button>
        </div>
      ) : result && result.data.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHead className="bg-slate-50">
                <TableRow>
                  <TableHeaderCell>Заказ</TableHeaderCell>
                  <TableHeaderCell>Пользователь</TableHeaderCell>
                  <TableHeaderCell>Продукт</TableHeaderCell>
                  <TableHeaderCell>Тип покупки</TableHeaderCell>
                  <TableHeaderCell className="text-right">Сумма</TableHeaderCell>
                  <TableHeaderCell>Завершён</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.data.map((order) => (
                  <TableRow key={order.id} className="border-t border-slate-100">
                    <TableCell className="font-mono text-xs text-slate-700">#{order.id.slice(0, 12)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{getAdminUserDisplayName(order.user)}</div>
                      {order.user.email ? <div className="mt-1 text-xs text-slate-500">{order.user.email}</div> : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-slate-900">{order.product.name ?? 'Товар удалён'}</div>
                      {order.product.country ? <div className="mt-1 text-xs text-slate-500">{order.product.country}</div> : null}
                    </TableCell>
                    <TableCell>
                      <span className={order.purchaseKind === 'FIRST'
                        ? 'rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'
                        : 'rounded bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700'}
                      >
                        {order.purchaseKind === 'FIRST'
                          ? 'Первая в истории'
                          : `Повторная · №${order.purchaseSequence}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {formatMarketingMoney(order.totalAmount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-slate-600">
                      {formatMarketingDateTimeUtc(order.completedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={result.meta.page}
            totalPages={result.meta.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">В выбранном периоде заказов нет.</p>
      )}
    </Modal>
  )
}
