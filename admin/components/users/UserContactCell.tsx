import { Copy } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { AdminUser } from '@/lib/types'
import { formatUserShortId, getAdminUserDisplayName, getAdminUserHint } from './user-formatting'

interface UserContactCellProps {
  user: AdminUser
  onCopyId: (id: string) => void
}

export default function UserContactCell({ user, onCopyId }: UserContactCellProps) {
  const hint = getAdminUserHint(user)

  return (
    <div className="min-w-[14rem]">
      <div className="font-medium text-slate-900">{getAdminUserDisplayName(user)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        <span className="font-mono">{formatUserShortId(user.id)}</span>
        <Button
          onClick={() => onCopyId(user.id)}
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Скопировать ID пользователя"
          className="h-6 w-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {hint ? (
        <div className="mt-1 max-w-[17rem] truncate text-xs text-slate-500" title={hint}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}
