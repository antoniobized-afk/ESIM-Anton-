import { Eye, Loader2, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { AdminUser } from '@/lib/types'

interface UserActionsCellProps {
  user: AdminUser
  canDelete: boolean
  deleting: boolean
  deletingDisabled: boolean
  onOpenDetails: (userId: string) => void
  onDelete: (user: AdminUser) => void
}

export default function UserActionsCell({
  user,
  canDelete,
  deleting,
  deletingDisabled,
  onOpenDetails,
  onDelete,
}: UserActionsCellProps) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button
        onClick={() => onOpenDetails(user.id)}
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Открыть карточку пользователя"
        className="text-slate-500 hover:bg-blue-50 hover:text-blue-600"
      >
        <Eye className="h-4 w-4" />
      </Button>

      {canDelete ? (
        <Button
          onClick={() => onDelete(user)}
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Удалить пользователя"
          disabled={deletingDisabled}
          className="text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      ) : null}
    </div>
  )
}
