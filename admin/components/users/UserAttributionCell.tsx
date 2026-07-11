import type { AdminUserAttributionBucket } from '@/lib/types'
import { formatAttributionBucket } from './user-formatting'

interface UserAttributionCellProps {
  buckets: AdminUserAttributionBucket[]
}

function bucketClassName(bucket: AdminUserAttributionBucket): string {
  if (bucket.kind === 'referral') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

export default function UserAttributionCell({ buckets }: UserAttributionCellProps) {
  if (buckets.length === 0) {
    return <span className="text-sm text-slate-400">—</span>
  }

  return (
    <div className="flex max-w-[18rem] flex-wrap gap-1.5">
      {buckets.map((bucket, index) => {
        const label = formatAttributionBucket(bucket)

        return (
          <span
            key={`${bucket.kind}-${index}`}
            className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-medium ${bucketClassName(bucket)}`}
            title={label}
          >
            <span className="truncate">{label}</span>
          </span>
        )
      })}
    </div>
  )
}
