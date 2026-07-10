'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { usersApi } from '@/lib/api'
import type { AdminUser } from '@/lib/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import UserMarketingTimeline from '@/components/marketing-attribution/UserMarketingTimeline'
import IdentityProvidersCell from './IdentityProvidersCell'
import UserAttributionCell from './UserAttributionCell'
import { UserBalanceCell, UserValueCell } from './UserValueCell'
import {
  formatUserDateTime,
  formatUserShortId,
  getAdminUserDisplayName,
  getAdminUserHint,
} from './user-formatting'

interface UserDetailsModalProps {
  userId: string
  onClose: () => void
  onCopyId: (id: string) => void
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-3 sm:grid-cols-[11rem,1fr]">
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-800">{value || '—'}</dd>
    </div>
  )
}

export default function UserDetailsModal({ userId, onClose, onCopyId }: UserDetailsModalProps) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUser = useCallback(async (isCancelled?: () => boolean) => {
    try {
      setLoading(true)
      setError(null)
      const { data } = await usersApi.getById(userId)
      if (isCancelled?.()) return
      setUser(data)
    } catch (error) {
      if (isCancelled?.()) return
      console.error('Ошибка загрузки карточки пользователя:', error)
      setError('Не удалось загрузить карточку пользователя')
    } finally {
      if (!isCancelled?.()) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false

    void loadUser(() => cancelled)

    return () => {
      cancelled = true
    }
  }, [loadUser])

  const title = user ? getAdminUserDisplayName(user) : 'Пользователь'

  return (
    <Modal
      title={title}
      description={user ? `${formatUserShortId(user.id)} · ${getAdminUserHint(user)}` : undefined}
      onClose={onClose}
      contentClassName="max-w-4xl !bg-white"
      footer={
        user ? (
          <>
            <Button variant="secondary" onClick={() => onCopyId(user.id)}>
              <Copy className="h-4 w-4" />
              Скопировать ID
            </Button>
            <Button variant="ghost" onClick={onClose}>Закрыть</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
        )
      }
    >
      {loading ? (
        <div className="py-10">
          <Spinner centered />
        </div>
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-600">{error}</p>
          <div className="mt-4 flex justify-center">
            <Button onClick={() => loadUser()} variant="secondary">Повторить</Button>
          </div>
        </div>
      ) : user ? (
        <div className="space-y-8">
          <section>
            <h4 className="text-sm font-semibold uppercase text-slate-500">Контакты</h4>
            <dl className="mt-3">
              <DetailRow label="ID" value={user.id} />
              <DetailRow label="Email" value={user.email || ''} />
              <DetailRow label="Телефон" value={user.phone || ''} />
              <DetailRow label="Username" value={user.username ? `@${user.username}` : ''} />
              <DetailRow label="Telegram ID" value={user.telegramId || ''} />
              <DetailRow label="Статус" value={user.isBlocked ? 'Заблокирован' : 'Активен'} />
            </dl>
          </section>

          <section>
            <h4 className="text-sm font-semibold uppercase text-slate-500">Вход</h4>
            <div className="mt-3">
              <IdentityProvidersCell providers={user.identityProviders} />
            </div>
            {user.identityProviders.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                      <th className="py-2 pr-4 font-medium">Провайдер</th>
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Имя</th>
                      <th className="py-2 pr-4 font-medium">Привязан</th>
                      <th className="py-2 font-medium">Последний вход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.identityProviders.map((identity) => (
                      <tr key={identity.id} className="border-b border-slate-50">
                        <td className="py-2 pr-4 text-slate-800">{identity.label}</td>
                        <td className="py-2 pr-4 text-slate-700">
                          {identity.email || '—'}
                          {identity.email ? (
                            <span className="ml-2 text-xs text-slate-400">
                              {identity.emailVerified ? 'подтвержден' : 'не подтвержден'}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">{identity.displayName || '—'}</td>
                        <td className="py-2 pr-4 text-slate-700">{formatUserDateTime(identity.linkedAt)}</td>
                        <td className="py-2 text-slate-700">{formatUserDateTime(identity.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section>
            <h4 className="text-sm font-semibold uppercase text-slate-500">Атрибуция и ценность</h4>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-slate-400">Атрибуция</div>
                <UserAttributionCell buckets={user.attributionSummary.buckets} />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-slate-400">Баланс</div>
                <UserBalanceCell user={user} />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-slate-400">Ценность</div>
                <UserValueCell user={user} />
              </div>
            </div>
            <dl className="mt-3">
              <DetailRow label="Реферальный код" value={user.referralCode} />
              <DetailRow label="Создан" value={formatUserDateTime(user.createdAt)} />
              <DetailRow label="Обновлен" value={formatUserDateTime(user.updatedAt)} />
            </dl>
            <UserMarketingTimeline userId={user.id} />
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
