'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { referralLinksApi } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/auth'
import { getErrorMessage } from '@/lib/errors'
import type {
  AdminReferralLink,
  AdminReferralLinkStats,
  CreateReferralLinkDto,
  PaginationMeta,
  NumericLike,
  ReferralPayoutMode,
  UpdateReferralLinkDto,
} from '@/lib/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table'
import Pagination from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/ToastProvider'
import {
  Plus,
  Check,
  Pencil,
  BarChart3,
  MessageCircle,
  Globe,
} from 'lucide-react'
import UserPicker from '@/components/ui/UserPicker'
import PromoSelect from '@/components/ui/PromoSelect'

// ── Helpers ────────────────────────────────────────────────────────

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'mojo_mobile_bot'
const CLIENT_URL = process.env.NEXT_PUBLIC_CLIENT_URL || 'https://app.mojomobile.ru'

function num(v: NumericLike): number {
  return typeof v === 'string' ? parseFloat(v) || 0 : v
}

function getLinkStatus(link: AdminReferralLink): { label: string; className: string } {
  if (!link.isActive) {
    return { label: 'Неактивна', className: 'bg-red-100 text-red-700' }
  }
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return { label: 'Истекла', className: 'bg-amber-100 text-amber-700' }
  }
  return { label: 'Активна', className: 'bg-green-100 text-green-700' }
}

function getPayoutModeLabel(mode: ReferralPayoutMode): { label: string; className: string } {
  if (mode === 'EXTERNAL') {
    return { label: 'К выплате', className: 'bg-orange-100 text-orange-700' }
  }
  return { label: 'На баланс', className: 'bg-sky-100 text-sky-700' }
}

function ownerName(link: AdminReferralLink): string {
  return link.user.firstName || link.user.username || link.user.id.slice(0, 8)
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeOptionalDate(value: string): string | null {
  return value ? value : null
}

function parseBonusPercentInput(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 100) {
    return null
  }
  return parsed
}

// ── Component ──────────────────────────────────────────────────────

export default function ReferralLinks() {
  const toast = useToast()

  // State
  const [links, setLinks] = useState<AdminReferralLink[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [formOpen, setFormOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<AdminReferralLink | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsData, setStatsData] = useState<AdminReferralLinkStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const statsRequestIdRef = useRef(0)

  // Copy
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────

  const load = useCallback(async (p: number) => {
    try {
      setError(null)
      const { data } = await referralLinksApi.getAll({ page: p, limit: 20 })
      setLinks(data.data)
      setMeta(data.meta)
    } catch (e) {
      if (isUnauthorizedError(e)) return
      setError('Не удалось загрузить ссылки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(page)
  }, [load, page])

  // ── Copy ──────────────────────────────────────────────────────────

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.info('Скопировано')
    setTimeout(() => setCopiedId(null), 1500)
  }

  // ── Stats ─────────────────────────────────────────────────────────

  const openStats = async (link: AdminReferralLink) => {
    setStatsOpen(true)
    setStatsLoading(true)
    setStatsData(null)
    const requestId = ++statsRequestIdRef.current
    let isLatestRequest = true
    try {
      const { data } = await referralLinksApi.getStats(link.id)
      if (statsRequestIdRef.current !== requestId) return
      setStatsData(data)
    } catch (e) {
      if (statsRequestIdRef.current !== requestId) return
      toast.error(getErrorMessage(e, 'Не удалось загрузить статистику'))
    } finally {
      isLatestRequest = statsRequestIdRef.current === requestId
      if (isLatestRequest) {
        setStatsLoading(false)
      }
    }
  }

  const closeStats = useCallback(() => {
    statsRequestIdRef.current += 1
    setStatsOpen(false)
    setStatsLoading(false)
    setStatsData(null)
  }, [])

  // ── Edit ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingLink(null)
    setFormOpen(true)
  }

  const openEdit = (link: AdminReferralLink) => {
    setEditingLink(link)
    setFormOpen(true)
  }

  const handleFormSave = async () => {
    await load(page)
    setFormOpen(false)
    setEditingLink(null)
  }

  // ── Render ────────────────────────────────────────────────────────

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
        <h2 className="text-2xl font-bold text-slate-900">Не удалось загрузить</h2>
        <p className="mt-2 text-slate-600">{error}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={() => load(page)}>Повторить</Button>
        </div>
      </div>
    )
  }

  const totalRegistrations = links.reduce((s, l) => s + l._count.referredUsers, 0)

  return (
    <div>
      {/* Header */}
      <div className="glass-card p-6 flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Партнёрские ссылки</h2>
          <p className="text-sm text-slate-500 mt-1">
            Всего: {meta?.total ?? links.length} · Активных:{' '}
            {links.filter((l) => getLinkStatus(l).label === 'Активна').length} · Регистраций:{' '}
            {totalRegistrations}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Изменение промокода или процента у ссылки сразу влияет на ещё не купивших пользователей, уже завершённые заказы и начисления не пересчитываются.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={18} />
          Создать
        </Button>
      </div>

      {/* Table */}
      {links.length === 0 ? (
        <div className="glass-card p-8 text-center text-slate-500">
          Нет партнёрских ссылок. Нажмите «Создать» чтобы добавить.
        </div>
      ) : (
        <div className="glass-card glass-card--static overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow className="bg-slate-50/50">
                  <TableHeaderCell className="px-6">Код</TableHeaderCell>
                  <TableHeaderCell className="px-6">Владелец</TableHeaderCell>
                  <TableHeaderCell className="px-6">Бонус</TableHeaderCell>
                  <TableHeaderCell className="px-6">Выплата</TableHeaderCell>
                  <TableHeaderCell className="px-6">Промокод</TableHeaderCell>
                  <TableHeaderCell className="px-6">Статус</TableHeaderCell>
                  <TableHeaderCell className="px-6">Регистрации</TableHeaderCell>
                  <TableHeaderCell className="px-6">Транзакции</TableHeaderCell>
                  <TableHeaderCell className="px-6 text-right">Действия</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-slate-100">
                {links.map((link) => {
                  const status = getLinkStatus(link)
                  return (
                    <TableRow key={link.id} className="hover:bg-slate-50/50">
                      <TableCell className="px-6 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono font-bold text-slate-800">
                            {link.code}
                          </span>
                          {link.label && (
                            <span className="text-xs text-slate-400">{link.label}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600">
                        {ownerName(link)}
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                          {num(link.bonusPercent)}%
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        {(() => {
                          const pm = getPayoutModeLabel(link.payoutMode ?? 'BALANCE')
                          return (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${pm.className}`}
                            >
                              {pm.label}
                            </span>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600 font-mono text-xs">
                        {link.promoCode?.code ?? '—'}
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600">
                        {link._count.referredUsers}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-slate-600">
                        {link._count.transactions}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Copy Telegram link */}
                          <Button
                            onClick={() =>
                              handleCopy(
                                `https://t.me/${BOT_USERNAME}?startapp=ref_${link.code}`,
                                `tg-${link.id}`,
                              )
                            }
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Скопировать Telegram ссылку"
                            className="text-slate-400 hover:text-[#2AABEE]"
                          >
                            {copiedId === `tg-${link.id}` ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <MessageCircle size={14} />
                            )}
                          </Button>
                          {/* Copy Web link */}
                          <Button
                            onClick={() =>
                              handleCopy(
                                `${CLIENT_URL}/ref/${link.code}`,
                                `web-${link.id}`,
                              )
                            }
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Скопировать Web ссылку"
                            className="text-slate-400 hover:text-blue-600"
                          >
                            {copiedId === `web-${link.id}` ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Globe size={14} />
                            )}
                          </Button>
                          {/* Edit */}
                          <Button
                            onClick={() => openEdit(link)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Редактировать"
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <Pencil size={14} />
                          </Button>
                          {/* Stats */}
                          <Button
                            onClick={() => openStats(link)}
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label="Статистика"
                            className="text-slate-400 hover:text-purple-600"
                          >
                            <BarChart3 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {meta && meta.totalPages > 1 && (
            <div className="p-4 border-t border-slate-100">
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
      {/* Create / Edit Modal */}
      {formOpen && (
        <LinkFormModal
          link={editingLink}
          onClose={() => {
            setFormOpen(false)
            setEditingLink(null)
          }}
          onSave={handleFormSave}
        />
      )}

      {/* Stats Modal */}
      {statsOpen && (
        <StatsModal
          data={statsData}
          loading={statsLoading}
          onClose={closeStats}
        />
      )}
    </div>
  )
}

// ── Link Form Modal ────────────────────────────────────────────────

interface LinkFormModalProps {
  link: AdminReferralLink | null
  onClose: () => void
  onSave: () => Promise<void>
}

function LinkFormModal({ link, onClose, onSave }: LinkFormModalProps) {
  const toast = useToast()
  const isEdit = !!link

  const [code, setCode] = useState(link?.code ?? '')
  const [userId, setUserId] = useState(link?.userId ?? '')
  const [bonusPercent, setBonusPercent] = useState(link ? String(num(link.bonusPercent)) : '10')
  const [label, setLabel] = useState(link?.label ?? '')
  const [promoCodeId, setPromoCodeId] = useState(link?.promoCode?.id ?? '')
  const [isActive, setIsActive] = useState(link?.isActive ?? true)
  const [expiresAt, setExpiresAt] = useState(
    link?.expiresAt ? link.expiresAt.slice(0, 10) : '',
  )
  const [payoutMode, setPayoutMode] = useState<ReferralPayoutMode>(
    link?.payoutMode ?? 'BALANCE',
  )
  const [saving, setSaving] = useState(false)

  const parsedBonusPercent = parseBonusPercentInput(bonusPercent)
  const canSubmit = Boolean(
    code.trim() &&
    (isEdit || userId.trim()) &&
    parsedBonusPercent !== null,
  )

  const handleSubmit = async () => {
    if (!canSubmit || parsedBonusPercent === null) {
      toast.error('Укажите корректный bonusPercent от 0.01 до 100')
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        const dto: UpdateReferralLinkDto = {
          code: code.trim() || undefined,
          bonusPercent: parsedBonusPercent,
          payoutMode,
          label: normalizeOptionalText(label),
          promoCodeId: normalizeOptionalText(promoCodeId),
          isActive,
          expiresAt: normalizeOptionalDate(expiresAt),
        }
        await referralLinksApi.update(link!.id, dto)
        toast.success('Ссылка обновлена')
      } else {
        const dto: CreateReferralLinkDto = {
          code: code.trim(),
          userId: userId.trim(),
          bonusPercent: parsedBonusPercent,
          payoutMode,
          isActive,
        }
        if (label.trim()) dto.label = label.trim()
        if (promoCodeId.trim()) dto.promoCodeId = promoCodeId.trim()
        if (expiresAt) dto.expiresAt = expiresAt
        await referralLinksApi.create(dto)
        toast.success('Ссылка создана')
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
      title={isEdit ? 'Редактировать ссылку' : 'Новая партнёрская ссылка'}
      onClose={onClose}
      contentClassName="max-w-lg"
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
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Код (уникальный)
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PARTNER2025"
            className={`${inputCls} font-mono`}
            data-autofocus
          />
        </div>

        {!isEdit && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Владелец
            </label>
            <UserPicker
              value={userId}
              onChange={setUserId}
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Бонус, %
          </label>
          <input
            type="number"
            min={0.01}
            max={100}
            step={0.01}
            value={bonusPercent}
            onChange={(e) => setBonusPercent(e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">
            Введите значение от 0.01 до 100.
          </p>
          {bonusPercent.trim() && parsedBonusPercent === null && (
            <p className="mt-1 text-xs text-red-600">
              Некорректный bonusPercent. Допустимый диапазон: 0.01–100.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Метка (label)
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="YouTube Campaign Q1"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Промокод (необязательно)
          </label>
          <PromoSelect
            value={promoCodeId}
            onChange={setPromoCodeId}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Действует до
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Режим выплаты
          </label>
          <select
            value={payoutMode}
            onChange={(e) => setPayoutMode(e.target.value as ReferralPayoutMode)}
            className={inputCls}
          >
            <option value="BALANCE">На баланс — бонус зачисляется на счёт партнёра</option>
            <option value="EXTERNAL">К выплате — только статистика, деньги вне системы</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {payoutMode === 'EXTERNAL'
              ? 'Бонус не зачисляется на баланс. Сумма к выплате видна в статистике.'
              : 'Бонус зачисляется на bonusBalance партнёра автоматически.'}
          </p>
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
            />
            Активна
          </label>
        </div>
      </div>
    </Modal>
  )
}

// ── Stats Modal ────────────────────────────────────────────────────

interface StatsModalProps {
  data: AdminReferralLinkStats | null
  loading: boolean
  onClose: () => void
}

function StatsModal({ data, loading, onClose }: StatsModalProps) {
  if (loading) {
    return (
      <Modal title="Загрузка статистики…" onClose={onClose} contentClassName="max-w-2xl">
        <Spinner centered />
      </Modal>
    )
  }

  if (!data) return null

  const { stats, referredUsers, link } = data

  return (
    <Modal
      title={`Статистика: ${link.code}`}
      description={link.label || undefined}
      onClose={onClose}
      contentClassName="max-w-2xl"
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Регистрации" value={stats.registrations} />
        <StatCard label="Покупки" value={stats.ordersCount} />
        <StatCard
          label="Выручка (primary)"
          value={`${num(stats.commissionableRevenue).toFixed(2)} ₽`}
        />
        <StatCard
          label="Заработок партнёра"
          value={`${num(stats.totalReferrerEarnings).toFixed(2)} ₽`}
        />
      </div>

      {/* Payout mode badge */}
      {link.payoutMode === 'EXTERNAL' && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">
          Режим выплаты: <strong>к выплате вне системы</strong> — бонус не зачисляется на баланс, сумма выше — это сколько нужно выплатить деньгами.
        </div>
      )}

      {/* Referred users */}
      {referredUsers.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">
            Привлечённые пользователи ({referredUsers.length})
          </h4>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-100">
            <Table>
              <TableHead>
                <TableRow className="bg-slate-50/50">
                  <TableHeaderCell>Имя</TableHeaderCell>
                  <TableHeaderCell>Дата</TableHeaderCell>
                  <TableHeaderCell>Заказы</TableHeaderCell>
                  <TableHeaderCell>Потрачено</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-slate-100">
                {referredUsers.map((u) => (
                  <TableRow key={u.id} className="hover:bg-slate-50/50">
                    <TableCell className="text-sm text-slate-700">{u.name}</TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(u.joinedAt).toLocaleDateString('ru-RU')}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{u.totalOrders}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {num(u.totalSpent).toFixed(2)} ₽
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {referredUsers.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-4">
          Пока нет привлечённых пользователей
        </p>
      )}
    </Modal>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center">
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
