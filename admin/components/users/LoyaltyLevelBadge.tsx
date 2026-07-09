import type {
  LoyaltyLevelPresentationInput,
  LoyaltyLevelPresentationVariant,
} from '@shared/loyalty-level-presentation'
import { resolveLoyaltyLevelPresentation } from '@shared/loyalty-level-presentation'
import { cn } from '@/lib/utils'

const VARIANT_CLASS_NAMES: Record<LoyaltyLevelPresentationVariant, string> = {
  none: 'border-slate-200 bg-slate-50 text-slate-500',
  slate: 'border-slate-200 bg-slate-100 text-slate-700',
  bronze: 'border-orange-200 bg-orange-50 text-orange-700',
  silver: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  gold: 'border-amber-200 bg-amber-50 text-amber-700',
  platinum: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  teal: 'border-teal-200 bg-teal-50 text-teal-700',
}

interface LoyaltyLevelBadgeProps {
  level: LoyaltyLevelPresentationInput | null | undefined
  className?: string
}

export default function LoyaltyLevelBadge({ level, className }: LoyaltyLevelBadgeProps) {
  const presentation = resolveLoyaltyLevelPresentation(level)

  return (
    <span
      title={presentation.label}
      className={cn(
        'inline-flex max-w-[9rem] items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold leading-tight',
        VARIANT_CLASS_NAMES[presentation.variant],
        className,
      )}
    >
      <span className="block min-w-0 truncate">{presentation.label}</span>
    </span>
  )
}
