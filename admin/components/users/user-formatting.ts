import type { AdminUser, AdminUserAttributionBucket, NumericLike } from '@/lib/types'

type UserNameSource = Pick<AdminUser, 'id' | 'firstName' | 'lastName' | 'username' | 'email'> & {
  phone?: AdminUser['phone']
}

export function getAdminUserDisplayName(user: UserNameSource): string {
  const fullName = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  return fullName || user.username || user.email || user.phone || `#${user.id.slice(0, 8)}`
}

export function getAdminUserHint(user: Pick<AdminUser, 'id' | 'email' | 'phone' | 'username' | 'telegramId'>): string {
  const parts: string[] = []

  if (user.email) parts.push(user.email)
  if (user.phone) parts.push(user.phone)
  if (user.username) parts.push(`@${user.username}`)
  if (user.telegramId) parts.push(`tg:${user.telegramId}`)

  return parts.join(' · ')
}

export function formatUserShortId(id: string): string {
  return `#${id.slice(0, 8)}`
}

export function formatUserMoney(value: NumericLike | null | undefined): string {
  return `₽${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`
}

export function formatUserDate(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('ru-RU')
}

export function formatUserDateTime(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('ru-RU')
}

export function formatAttributionBucket(bucket: AdminUserAttributionBucket): string {
  if (bucket.kind === 'referral') {
    const parts = [
      bucket.referralLinkCode ? `#${bucket.referralLinkCode}` : null,
      bucket.referralLinkLabel,
      bucket.referrer?.displayName,
    ].filter(Boolean)

    return parts.length > 0 ? `${bucket.label}: ${parts.join(' / ')}` : bucket.label
  }

  const parts = [bucket.source, bucket.medium, bucket.campaign].filter(Boolean)
  return parts.length > 0 ? `${bucket.label}: ${parts.join(' / ')}` : bucket.label
}
