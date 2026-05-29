'use client'

import { useEffect, useState } from 'react'
import { promoCodesApi } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/auth'
import { getErrorMessage } from '@/lib/errors'
import type {
  AdminPromoCodeStats,
  CreatePromoCodeDto,
  NumericLike,
  PromoCode,
  ReferralPayoutMode,
  UpdatePromoCodeDto,
} from '@/lib/types'
import Button from '@/components/ui/Button'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { useToast } from '@/components/ui/ToastProvider'
import UserPicker from '@/components/ui/UserPicker'
import { Plus, Trash2, ToggleLeft, ToggleRight, Copy, Check, Pencil, BarChart3 } from 'lucide-react'

function num(value: NumericLike | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'string' ? parseFloat(value) || 0 : value
}

function getPayoutModeLabel(mode: ReferralPayoutMode): { label: string; className: string } {
  if (mode === 'EXTERNAL') {
    return { label: 'К выплате', className: 'bg-orange-100 text-orange-700' }
  }
  return { label: 'На баланс', className: 'bg-sky-100 text-sky-700' }
}

function ownerName(promoCode: PromoCode): string {
  const owner = promoCode.referralOwner
  if (!owner) return '—'
  return owner.firstName || owner.username || owner.email || owner.referralCode || owner.id.slice(0, 8)
}

function normalizeOptionalDate(value: string): string | null {
  return value ? value : null
}

function parsePercentInput(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 100) return null
  return parsed
}

function parseMaxUsesInput(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

export default function PromoCodes() {
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statsData, setStatsData] = useState<AdminPromoCodeStats | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      setError(null)
      const { data } = await promoCodesApi.getAll()
      setCodes(data)
    } catch (e) {
      if (isUnauthorizedError(e)) return
      console.error(e)
      setError('Не удалось загрузить промокоды')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingPromo(null)
    setFormOpen(true)
  }

  const openEdit = (promoCode: PromoCode) => {
    setEditingPromo(promoCode)
    setFormOpen(true)
  }

  const handleFormSave = async () => {
    await load()
    setFormOpen(false)
    setEditingPromo(null)
  }

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await promoCodesApi.toggle(id, !current)
      setCodes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive: !current } : c)),
      )
      toast.success(!current ? 'Промокод активирован' : 'Промокод отключен')
    } catch (e) {
      console.error(e)
      toast.error('Не удалось изменить статус промокода')
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Удаление промокода',
      description: 'Удалить промокод? Исторические заказы и начисления не будут пересчитаны, но сам код исчезнет из админского списка.',
      confirmLabel: 'Удалить',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await promoCodesApi.delete(id)
      setCodes((prev) => prev.filter((c) => c.id !== id))
      toast.success('Промокод удален')
    } catch (e) {
      console.error(e)
      toast.error('Не удалось удалить промокод')
    }
  }

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedId(id)
    toast.info(`Код ${code} скопирован`)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const openStats = async (promoCode: PromoCode) => {
    setStatsOpen(true)
    setStatsLoading(true)
    setStatsData(null)
    try {
      const { data } = await promoCodesApi.getStats(promoCode.id)
      setStatsData(data)
    } catch (e) {
      console.error(e)
      toast.error('Не удалось загрузить статистику промокода')
      setStatsOpen(false)
    } finally {
      setStatsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-8 text-center text-slate-600">
        <Spinner centered />
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card glass-card--static p-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Не удалось загрузить промокоды</h2>
        <p className="mt-2 text-slate-600">{error}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={load}>Повторить</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Промокоды</h2>
          <p className="text-sm text-slate-500 mt-1">
            Всего: {codes.length} · Активных: {codes.filter((c) => c.isActive).length} · Партнёрских:{' '}
            {codes.filter((c) => c.referralOwnerId).length}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Партнёрская policy snapshot-ится на заказе: правки здесь не меняют pending/historical начисления.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={18} />
          Создать
        </Button>
      </div>

      {codes.length === 0 ? (
        <div className="glass-card p-8 text-center text-slate-500">
          Нет промокодов. Нажмите «Создать» чтобы добавить.
        </div>
      ) : (
        <div className="glass-card glass-card--static overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow className="bg-slate-50/50">
                  <TableHeaderCell className="px-6">Код</TableHeaderCell>
                  <TableHeaderCell className="px-6">Скидка</TableHeaderCell>
                  <TableHeaderCell className="px-6">Использовано</TableHeaderCell>
                  <TableHeaderCell className="px-6">Владелец</TableHeaderCell>
                  <TableHeaderCell className="px-6">Выплата</TableHeaderCell>
                  <TableHeaderCell className="px-6">Reward</TableHeaderCell>
                  <TableHeaderCell className="px-6">Начислено</TableHeaderCell>
                  <TableHeaderCell className="px-6">Годен до</TableHeaderCell>
                  <TableHeaderCell className="px-6">Статус</TableHeaderCell>
                  <TableHeaderCell className="px-6 text-right">Действия</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-slate-100">
                {codes.map((c) => {
                  const payout = c.referralPayoutMode ? getPayoutModeLabel(c.referralPayoutMode) : null
                  return (
                    <TableRow key={c.id} className="hover:bg-slate-50/50">
                      <TableCell className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">{c.code}</span>
                          <Button
                            onClick={() => handleCopy(c.code, c.id)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Скопировать промокод"
                            className="text-slate-400 hover:bg-transparent hover:text-slate-600"
                          >
                            {copiedId === c.id ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          {c.discountPercent}%
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600">
                        {c.usedCount}
                        {c.maxUses !== null ? ` / ${c.maxUses}` : ' / ∞'}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-700">
                        {c.referralOwner ? (
                          <div>
                            <p className="text-sm font-medium">{ownerName(c)}</p>
                            <p className="text-xs text-slate-400 font-mono">{c.referralOwner.referralCode}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">Обычный</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        {payout ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${payout.className}`}>
                            {payout.label}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600">
                        {c.referralBonusPercent !== null ? `${num(c.referralBonusPercent)}%` : '—'}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-700">
                        {num(c.totalReferrerEarnings).toFixed(2)} ₽
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600">
                        {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('ru-RU') : '—'}
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            c.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {c.isActive ? 'Активен' : 'Выключен'}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => openStats(c)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Статистика промокода"
                            className="text-slate-500 hover:text-indigo-600"
                          >
                            <BarChart3 size={16} />
                          </Button>
                          <Button
                            onClick={() => openEdit(c)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Редактировать промокод"
                            className="text-slate-500 hover:text-blue-600"
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            onClick={() => handleToggle(c.id, c.isActive)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={c.isActive ? 'Выключить промокод' : 'Включить промокод'}
                            className="text-slate-500 hover:text-slate-700"
                          >
                            {c.isActive ? (
                              <ToggleRight size={20} className="text-green-600" />
                            ) : (
                              <ToggleLeft size={20} />
                            )}
                          </Button>
                          <Button
                            onClick={() => handleDelete(c.id)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Удалить промокод"
                            className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {formOpen && (
        <PromoCodeFormModal
          promoCode={editingPromo}
          onClose={() => {
            setFormOpen(false)
            setEditingPromo(null)
          }}
          onSave={handleFormSave}
        />
      )}

      {statsOpen && (
        <PromoCodeStatsModal
          data={statsData}
          loading={statsLoading}
          onClose={() => {
            setStatsOpen(false)
            setStatsData(null)
          }}
        />
      )}
    </div>
  )
}

interface PromoCodeStatsModalProps {
  data: AdminPromoCodeStats | null
  loading: boolean
  onClose: () => void
}

function PromoCodeStatsModal({ data, loading, onClose }: PromoCodeStatsModalProps) {
  if (loading) {
    return (
      <Modal title="Загрузка статистики…" onClose={onClose} contentClassName="max-w-2xl">
        <Spinner centered />
      </Modal>
    )
  }

  if (!data) return null

  const { promoCode, stats, payoutModeSplit } = data
  const balanceSplit = payoutModeSplit.find((item) => item.payoutMode === 'BALANCE')
  const externalSplit = payoutModeSplit.find((item) => item.payoutMode === 'EXTERNAL')
  const unknownSplit = payoutModeSplit.find((item) => item.payoutMode === null)

  return (
    <Modal
      title={`Статистика: ${promoCode.code}`}
      description={promoCode.referralOwner ? `Владелец: ${ownerName(promoCode)}` : 'Обычный промокод без владельца'}
      onClose={onClose}
      contentClassName="max-w-2xl"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Использования" value={stats.uses} />
        <StatCard label="Primary orders" value={stats.completedPrimaryOrders} />
        <StatCard
          label="Выручка (primary)"
          value={`${num(stats.commissionableRevenue).toFixed(2)} ₽`}
        />
        <StatCard
          label="Заработок владельца"
          value={`${num(stats.totalReferrerEarnings).toFixed(2)} ₽`}
        />
      </div>

      <div className="rounded-xl border border-slate-100 bg-white/60 p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Разбивка выплат</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <PayoutSplitCard mode="BALANCE" item={balanceSplit} />
          <PayoutSplitCard mode="EXTERNAL" item={externalSplit} />
          {unknownSplit && <UnknownPayoutSplitCard item={unknownSplit} />}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Split считается по snapshot payout mode из reservation и successful REFERRAL_BONUS ledger, а не по текущим настройкам промокода.
        </p>
      </div>

      {!promoCode.referralOwner && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
          У промокода нет владельца: скидка работает, но партнёрские начисления не создаются.
        </div>
      )}
    </Modal>
  )
}

function PayoutSplitCard({
  mode,
  item,
}: {
  mode: ReferralPayoutMode
  item?: AdminPromoCodeStats['payoutModeSplit'][number]
}) {
  const label = getPayoutModeLabel(mode)
  const amount = num(item?.totalEarnings).toFixed(2)

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${label.className}`}>
        {label.label}
      </span>
      <p className="mt-2 text-lg font-bold text-slate-800">{amount} ₽</p>
      <p className="text-xs text-slate-500">Начислений: {item?.rewardsCount ?? 0}</p>
    </div>
  )
}

function UnknownPayoutSplitCard({
  item,
}: {
  item: AdminPromoCodeStats['payoutModeSplit'][number]
}) {
  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3 md:col-span-2">
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Неизвестный snapshot
      </span>
      <p className="mt-2 text-lg font-bold text-slate-800">{num(item.totalEarnings).toFixed(2)} ₽</p>
      <p className="text-xs text-slate-500">Начислений: {item.rewardsCount}</p>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center">
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

interface PromoCodeFormModalProps {
  promoCode: PromoCode | null
  onClose: () => void
  onSave: () => Promise<void>
}

function PromoCodeFormModal({ promoCode, onClose, onSave }: PromoCodeFormModalProps) {
  const toast = useToast()
  const isEdit = !!promoCode

  const [code, setCode] = useState(promoCode?.code ?? '')
  const [discountPercent, setDiscountPercent] = useState(
    promoCode ? String(promoCode.discountPercent) : '10',
  )
  const [maxUses, setMaxUses] = useState(
    promoCode?.maxUses !== null && promoCode?.maxUses !== undefined ? String(promoCode.maxUses) : '',
  )
  const [expiresAt, setExpiresAt] = useState(
    promoCode?.expiresAt ? promoCode.expiresAt.slice(0, 10) : '',
  )
  const [isActive, setIsActive] = useState(promoCode?.isActive ?? true)
  const [referralOwnerId, setReferralOwnerId] = useState(promoCode?.referralOwnerId ?? '')
  const [referralBonusPercent, setReferralBonusPercent] = useState(
    promoCode?.referralBonusPercent !== null && promoCode?.referralBonusPercent !== undefined
      ? String(num(promoCode.referralBonusPercent))
      : '10',
  )
  const [referralPayoutMode, setReferralPayoutMode] = useState<ReferralPayoutMode>(
    promoCode?.referralPayoutMode ?? 'BALANCE',
  )
  const [saving, setSaving] = useState(false)

  const parsedDiscount = parseMaxUsesInput(discountPercent)
  const parsedMaxUses = parseMaxUsesInput(maxUses)
  const parsedBonus = parsePercentInput(referralBonusPercent)
  const hasOwner = Boolean(referralOwnerId.trim())
  const invalidMaxUses = Boolean(maxUses.trim()) && parsedMaxUses === null
  const canSubmit = Boolean(
    code.trim() &&
    parsedDiscount !== null &&
    parsedDiscount <= 100 &&
    !invalidMaxUses &&
    (!hasOwner || parsedBonus !== null),
  )

  const clearPartnerPolicy = () => {
    setReferralOwnerId('')
    setReferralBonusPercent('10')
    setReferralPayoutMode('BALANCE')
  }

  const handleSubmit = async () => {
    if (!canSubmit || parsedDiscount === null) {
      toast.error('Проверьте код, скидку, лимит и партнёрскую policy')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        const dto: UpdatePromoCodeDto = {
          code: code.trim(),
          discountPercent: parsedDiscount,
          maxUses: parsedMaxUses,
          expiresAt: normalizeOptionalDate(expiresAt),
          isActive,
        }

        if (hasOwner) {
          if (parsedBonus === null) {
            toast.error('Укажите корректный reward percent от 0.01 до 100')
            return
          }
          dto.referralOwnerId = referralOwnerId.trim()
          dto.referralBonusPercent = parsedBonus
          dto.referralPayoutMode = referralPayoutMode
        } else if (promoCode?.referralOwnerId) {
          dto.referralOwnerId = null
        }

        await promoCodesApi.update(promoCode!.id, dto)
        toast.success('Промокод обновлен')
      } else {
        const dto: CreatePromoCodeDto = {
          code: code.trim(),
          discountPercent: parsedDiscount,
          isActive,
        }

        if (parsedMaxUses !== null) dto.maxUses = parsedMaxUses
        if (expiresAt) dto.expiresAt = expiresAt
        if (hasOwner) {
          if (parsedBonus === null) {
            toast.error('Укажите корректный reward percent от 0.01 до 100')
            return
          }
          dto.referralOwnerId = referralOwnerId.trim()
          dto.referralBonusPercent = parsedBonus
          dto.referralPayoutMode = referralPayoutMode
        }

        await promoCodesApi.create(dto)
        toast.success('Промокод создан')
      }
      await onSave()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Ошибка сохранения'))
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'

  return (
    <Modal
      title={isEdit ? 'Редактировать промокод' : 'Новый промокод'}
      description="Owner и reward policy нужны только для партнёрских промокодов. Без owner код остаётся обычным скидочным промокодом."
      onClose={onClose}
      contentClassName="max-w-2xl"
      footer={
        <>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </Button>
          <Button onClick={onClose} variant="secondary">
            Отмена
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Код</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PARTNER10"
            className={`${inputCls} font-mono`}
            data-autofocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Скидка, %</label>
          <input
            type="number"
            min={1}
            max={100}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Макс. использований</label>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="∞ (пусто)"
            className={inputCls}
          />
          {invalidMaxUses && (
            <p className="mt-1 text-xs text-red-600">Введите целое число больше 0 или оставьте поле пустым.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Действует до</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-3 md:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
            />
            Активен
          </label>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Partner reward</h4>
            <p className="mt-1 text-xs text-slate-500">
              Заполняйте блок только для партнёрского промокода. Backend требует owner, percent и payout mode вместе.
            </p>
          </div>
          <Button onClick={clearPartnerPolicy} variant="secondary" size="sm" disabled={!hasOwner && !promoCode?.referralOwnerId}>
            Очистить owner/policy
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Владелец</label>
            <UserPicker
              value={referralOwnerId}
              onChange={setReferralOwnerId}
              placeholder="Найдите партнёра по имени, email или username…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Reward, %</label>
            <input
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              value={referralBonusPercent}
              onChange={(e) => setReferralBonusPercent(e.target.value)}
              disabled={!hasOwner}
              className={inputCls}
            />
            {hasOwner && parsedBonus === null && (
              <p className="mt-1 text-xs text-red-600">Допустимый диапазон: 0.01–100.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Режим выплаты</label>
            <select
              value={referralPayoutMode}
              onChange={(e) => setReferralPayoutMode(e.target.value as ReferralPayoutMode)}
              disabled={!hasOwner}
              className={inputCls}
            >
              <option value="BALANCE">На баланс — бонус зачисляется партнёру</option>
              <option value="EXTERNAL">К выплате — деньги вне системы</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">
              {referralPayoutMode === 'EXTERNAL'
                ? 'Transaction создаётся для учёта суммы к выплате, bonusBalance не меняется.'
                : 'После успешного primary order сумма автоматически увеличит bonusBalance владельца.'}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
