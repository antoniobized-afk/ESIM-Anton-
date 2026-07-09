'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  DEFAULT_USER_SORT_FIELD,
  getDefaultUserSortOrder,
  isUserSortField,
  normalizeUserSortField,
  normalizeUserSortOrder,
  type UserSortField,
} from '@shared/user-sorting'
import { usersApi } from '@/lib/api'
import { getAdminRoleFromToken, isUnauthorizedError } from '@/lib/auth'
import { getErrorMessage } from '@/lib/errors'
import type {
  AdminRole,
  AdminUser,
  AdminUserDeleteBlocker,
  UsersQueryParams,
} from '@/lib/types'
import Button from '@/components/ui/Button'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { SortableHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { useToast } from '@/components/ui/ToastProvider'
import { Users as UsersIcon } from 'lucide-react'
import IdentityProvidersCell from '@/components/users/IdentityProvidersCell'
import UserActionsCell from '@/components/users/UserActionsCell'
import UserAttributionCell from '@/components/users/UserAttributionCell'
import UserContactCell from '@/components/users/UserContactCell'
import UserDetailsModal from '@/components/users/UserDetailsModal'
import UsersToolbar from '@/components/users/UsersToolbar'
import { UserBalanceCell, UserValueCell } from '@/components/users/UserValueCell'
import { formatUserDate, getAdminUserDisplayName } from '@/components/users/user-formatting'

const USERS_PAGE_SIZE = 20

function normalizeSearchParam(value: string | null): string {
  return value?.trim() ?? ''
}

function appendSortParams(params: URLSearchParams, sortBy: UserSortField, sortOrder: 'asc' | 'desc') {
  const defaultOrder = getDefaultUserSortOrder(sortBy)

  if (sortBy === DEFAULT_USER_SORT_FIELD && sortOrder === defaultOrder) return

  params.set('sortBy', sortBy)
  if (sortOrder !== defaultOrder) params.set('sortOrder', sortOrder)
}

function appendPageParam(params: URLSearchParams, page: number) {
  if (page > 1) params.set('page', String(page))
}

function getUsersHref(pathname: string, params: URLSearchParams) {
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export default function Users() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const appliedSearch = normalizeSearchParam(searchParams.get('search'))
  const [searchDraft, setSearchDraft] = useState(appliedSearch)

  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const rawSortBy = searchParams.get('sortBy')
  const sortBy = normalizeUserSortField(rawSortBy)
  const rawSortOrder = searchParams.get('sortOrder')
  const hasInvalidSortField = rawSortBy !== null && !isUserSortField(rawSortBy)
  const sortOrder = hasInvalidSortField
    ? getDefaultUserSortOrder(sortBy)
    : normalizeUserSortOrder(rawSortOrder, sortBy)
  const canDeleteUsers = adminRole === 'SUPER_ADMIN'
  searchParamsRef.current = searchParams

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const nextParams = new URLSearchParams(searchParamsRef.current.toString())
    mutate(nextParams)
    router.replace(getUsersHref(pathname, nextParams), { scroll: false })
  }, [pathname, router])

  useEffect(() => {
    setAdminRole(getAdminRoleFromToken())
  }, [])

  useEffect(() => {
    setSearchDraft(appliedSearch)
  }, [appliedSearch])

  useEffect(() => {
    const normalized = new URLSearchParams()
    appendPageParam(normalized, page)
    if (appliedSearch) normalized.set('search', appliedSearch)
    appendSortParams(normalized, sortBy, sortOrder)

    if (normalized.toString() !== searchParams.toString()) {
      router.replace(getUsersHref(pathname, normalized), { scroll: false })
    }
  }, [appliedSearch, page, pathname, router, searchParams, sortBy, sortOrder])

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params: UsersQueryParams = {
        page,
        limit: USERS_PAGE_SIZE,
        sortBy,
        sortOrder,
      }
      if (appliedSearch) params.search = appliedSearch

      const response = await usersApi.getAll(params)

      if (response.data) {
        const nextTotalPages = Math.max(1, response.data.meta?.totalPages || 1)
        setUsers(response.data.data || [])
        setTotalPages(nextTotalPages)
        setTotalCount(response.data.meta?.total || 0)
        setLoadedOnce(true)

        if (page > nextTotalPages) {
          replaceParams((params) => {
            params.delete('page')
            appendPageParam(params, nextTotalPages)
          })
        }
      }
    } catch (error) {
      if (isUnauthorizedError(error)) return
      console.error('Ошибка загрузки пользователей:', error)
      setError('Не удалось загрузить пользователей')
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, page, replaceParams, sortBy, sortOrder])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handlePageChange = (nextPage: number) => {
    replaceParams((params) => {
      params.delete('page')
      appendPageParam(params, nextPage)
    })
  }

  const handleSearchSubmit = () => {
    const nextSearch = searchDraft.trim()
    replaceParams((params) => {
      if (nextSearch) params.set('search', nextSearch)
      else params.delete('search')
      params.delete('page')
    })
  }

  const handleSearchClear = () => {
    setSearchDraft('')
    replaceParams((params) => {
      params.delete('search')
      params.delete('page')
    })
  }

  const handleSort = (field: UserSortField) => {
    replaceParams((params) => {
      const nextOrder = sortBy === field
        ? sortOrder === 'asc' ? 'desc' : 'asc'
        : getDefaultUserSortOrder(field)

      params.delete('page')
      if (field === DEFAULT_USER_SORT_FIELD && nextOrder === getDefaultUserSortOrder(field)) {
        params.delete('sortBy')
        params.delete('sortOrder')
        return
      }

      params.set('sortBy', field)
      if (nextOrder === getDefaultUserSortOrder(field)) params.delete('sortOrder')
      else params.set('sortOrder', nextOrder)
    })
  }

  const handleCopyUserId = async (userId: string) => {
    try {
      await navigator.clipboard.writeText(userId)
      toast.success('ID скопирован')
    } catch {
      toast.error('Не удалось скопировать ID')
    }
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
        `Удалить ${getAdminUserDisplayName(user)}? Если у пользователя есть заказы, платежи, карты, баланс или партнёрские связи, backend заблокирует удаление.`,
      confirmLabel: 'Удалить',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      setDeletingUserId(user.id)
      await usersApi.delete(user.id)
      toast.success('Пользователь удален')
      await loadUsers()
    } catch (error) {
      toast.error(deleteErrorMessage(error))
    } finally {
      setDeletingUserId(null)
    }
  }

  if (loading && !loadedOnce) {
    return (
      <div className="glass-card p-8">
        <Spinner centered />
      </div>
    )
  }

  if (error && !loadedOnce) {
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
    <div className="glass-card glass-card--static p-6" aria-busy={loading}>
      <UsersToolbar
        totalCount={totalCount}
        searchValue={searchDraft}
        onSearchValueChange={setSearchDraft}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={handleSearchClear}
        onRefresh={loadUsers}
      />

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {users.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <UsersIcon className="mx-auto mb-3 h-16 w-16 opacity-30" />
          <p className="text-lg">{appliedSearch ? 'Пользователи не найдены' : 'Пока нет пользователей'}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow className="border-b border-slate-200">
                  <TableHeaderCell>Пользователь</TableHeaderCell>
                  <TableHeaderCell>Вход</TableHeaderCell>
                  <TableHeaderCell>Атрибуция</TableHeaderCell>
                  <SortableHeader active={sortBy === 'balance'} direction={sortOrder} onClick={() => handleSort('balance')}>
                    Баланс
                  </SortableHeader>
                  <SortableHeader active={sortBy === 'totalSpent'} direction={sortOrder} onClick={() => handleSort('totalSpent')}>
                    Ценность
                  </SortableHeader>
                  <SortableHeader active={sortBy === 'createdAt'} direction={sortOrder} onClick={() => handleSort('createdAt')}>
                    Дата
                  </SortableHeader>
                  <TableHeaderCell className="text-right">Действия</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-b border-slate-100 transition-colors hover:bg-white/50"
                  >
                    <TableCell>
                      <UserContactCell user={user} onCopyId={handleCopyUserId} />
                    </TableCell>
                    <TableCell>
                      <IdentityProvidersCell providers={user.identityProviders} />
                    </TableCell>
                    <TableCell>
                      <UserAttributionCell buckets={user.attributionSummary.buckets} />
                    </TableCell>
                    <TableCell>
                      <UserBalanceCell user={user} />
                    </TableCell>
                    <TableCell>
                      <UserValueCell user={user} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {formatUserDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActionsCell
                        user={user}
                        canDelete={canDeleteUsers}
                        deleting={deletingUserId === user.id}
                        deletingDisabled={Boolean(deletingUserId)}
                        onOpenDetails={setSelectedUserId}
                        onDelete={handleDeleteUser}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
        </>
      )}

      {selectedUserId ? (
        <UserDetailsModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onCopyId={handleCopyUserId}
        />
      ) : null}
    </div>
  )
}
