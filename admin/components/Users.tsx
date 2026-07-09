'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { usersApi } from '@/lib/api'
import { getAdminRoleFromToken, isUnauthorizedError } from '@/lib/auth'
import { getErrorMessage } from '@/lib/errors'
import type {
  AdminRole,
  AdminUser,
  AdminUserAttributionBucket,
  AdminUserDeleteBlocker,
} from '@/lib/types'
import Button from '@/components/ui/Button'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { useToast } from '@/components/ui/ToastProvider'
import { Loader2, Trash2, Users as UsersIcon } from 'lucide-react'

export default function Users() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)

  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const canDeleteUsers = adminRole === 'SUPER_ADMIN'

  useEffect(() => {
    setAdminRole(getAdminRoleFromToken())
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await usersApi.getAll(page, 20)
      
      if (response.data) {
        setUsers(response.data.data || [])
        setTotalPages(response.data.meta?.totalPages || 1)
      }
    } catch (error) {
      if (isUnauthorizedError(error)) return
      console.error('Ошибка загрузки пользователей:', error)
      setError('Не удалось загрузить пользователей')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    const normalized = new URLSearchParams(searchParams.toString())
    normalized.set('page', String(page))
    if (normalized.toString() !== searchParams.toString()) {
      router.replace(`${pathname}?${normalized.toString()}`)
    }
  }, [page, pathname, router, searchParams])

  const handlePageChange = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('page', String(nextPage))
    router.replace(`${pathname}?${nextParams.toString()}`)
  }

  const userDisplayName = (user: AdminUser) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    return fullName || user.username || user.email || `#${user.id.slice(0, 8)}`
  }

  const identitySummary = (user: AdminUser) => {
    const identities = user.identityProviders ?? []
    if (identities.length === 0) return '—'
    return identities.map((identity) => identity.label).join(', ')
  }

  const attributionBucketText = (bucket: AdminUserAttributionBucket) => {
    if (bucket.kind === 'referral') {
      const parts = [
        bucket.referralLinkCode ? `#${bucket.referralLinkCode}` : null,
        bucket.referrer?.displayName ?? null,
      ].filter(Boolean)
      return parts.length > 0 ? `${bucket.label}: ${parts.join(' / ')}` : bucket.label
    }

    if (bucket.kind === 'utm') {
      const parts = [bucket.source, bucket.medium, bucket.campaign].filter(Boolean)
      return parts.length > 0 ? `${bucket.label}: ${parts.join(' / ')}` : bucket.label
    }

    return bucket.label
  }

  const attributionSummary = (user: AdminUser) => {
    const buckets = user.attributionSummary?.buckets ?? []
    if (buckets.length === 0) return '—'
    return buckets.map(attributionBucketText).join(' · ')
  }

  const deleteErrorMessage = (error: unknown) => {
    const data = (error as { response?: { data?: { message?: string; blockers?: AdminUserDeleteBlocker[] } } })
      .response?.data
    if (data?.blockers?.length) {
      return `${data.message || 'Удаление заблокировано'} ${data.blockers.map((item) => item.message).join(' ')}`
    }
    return getErrorMessage(error, 'Не удалось удалить пользователя')
  }

  const handleDeleteUser = async (user: AdminUser) => {
    const confirmed = await confirmDialog({
      title: 'Удаление пользователя',
      description:
        `Удалить ${userDisplayName(user)}? Если у пользователя есть заказы, платежи, карты, баланс или партнёрские связи, backend заблокирует удаление.`,
      confirmLabel: 'Удалить',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      setDeletingUserId(user.id)
      const { data } = await usersApi.delete(user.id)
      setUsers((current) => current.filter((item) => item.id !== data.deletedUserId))
      toast.success('Пользователь удален')
    } catch (e) {
      toast.error(deleteErrorMessage(e))
    } finally {
      setDeletingUserId(null)
    }
  }

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
        <h2 className="text-2xl font-bold text-slate-900">Не удалось загрузить пользователей</h2>
        <p className="mt-2 text-slate-600">{error}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={loadUsers}>Повторить</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card glass-card--static p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Пользователи</h2>
        <Button onClick={loadUsers} variant="ghost" size="sm" className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-700">
          Обновить
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <UsersIcon className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg">Пока нет пользователей</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow className="border-b border-slate-200">
                  <TableHeaderCell>ID</TableHeaderCell>
                  <TableHeaderCell>Имя</TableHeaderCell>
                  <TableHeaderCell>Telegram</TableHeaderCell>
                  <TableHeaderCell>Вход</TableHeaderCell>
                  <TableHeaderCell>Атрибуция</TableHeaderCell>
                  <TableHeaderCell>Баланс</TableHeaderCell>
                  <TableHeaderCell>Потрачено</TableHeaderCell>
                  <TableHeaderCell>Уровень</TableHeaderCell>
                  <TableHeaderCell>Дата</TableHeaderCell>
                  {canDeleteUsers && <TableHeaderCell className="text-right">Действия</TableHeaderCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-b border-slate-100 hover:bg-white/50 transition-colors"
                  >
                    <TableCell className="font-mono text-sm">
                      #{user.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {user.firstName || user.username || 'Без имени'}
                      {user.lastName && ` ${user.lastName}`}
                    </TableCell>
                    <TableCell className="text-blue-600">
                      {user.username ? `@${user.username}` : user.telegramId}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {identitySummary(user)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="text-slate-700">{attributionSummary(user)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>₽{Number(user.balance || 0).toLocaleString()}</div>
                        <div className="text-green-600">
                          +₽{Number(user.bonusBalance || 0).toLocaleString()} бонусов
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-bold">
                      ₽{Number(user.totalSpent || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700">
                        {user.loyaltyLevel?.name || 'Новичок'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                    </TableCell>
                    {canDeleteUsers && (
                      <TableCell className="text-right">
                        <Button
                          onClick={() => handleDeleteUser(user)}
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Удалить пользователя"
                          disabled={Boolean(deletingUserId)}
                          className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                        >
                          {deletingUserId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
        </>
      )}
    </div>
  )
}
