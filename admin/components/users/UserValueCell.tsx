import type { AdminUser } from '@/lib/types'
import LoyaltyLevelBadge from './LoyaltyLevelBadge'
import { formatUserMoney } from './user-formatting'

interface UserBalanceCellProps {
  user: AdminUser
}

export function UserBalanceCell({ user }: UserBalanceCellProps) {
  return (
    <div className="min-w-[9rem] text-sm">
      <div className="font-medium text-slate-900">{formatUserMoney(user.balance)}</div>
      <div className="mt-1 text-xs text-emerald-600">{formatUserMoney(user.bonusBalance)} бонусов</div>
    </div>
  )
}

export function UserValueCell({ user }: UserBalanceCellProps) {
  return (
    <div className="min-w-[10rem] text-sm">
      <div className="font-semibold text-slate-900">{formatUserMoney(user.totalSpent)}</div>
      <div className="mt-1">
        <LoyaltyLevelBadge level={user.loyaltyLevel} />
      </div>
    </div>
  )
}
