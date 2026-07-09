import type { AdminUserIdentityProvider } from '@/lib/types'

interface IdentityProvidersCellProps {
  providers: AdminUserIdentityProvider[]
}

export default function IdentityProvidersCell({ providers }: IdentityProvidersCellProps) {
  if (providers.length === 0) {
    return <span className="text-sm text-slate-400">—</span>
  }

  return (
    <div className="flex max-w-[13rem] flex-wrap gap-1.5">
      {providers.map((provider) => (
        <span
          key={provider.id}
          className="inline-flex max-w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
          title={provider.email || provider.displayName || provider.label}
        >
          <span className="truncate">{provider.label}</span>
        </span>
      ))}
    </div>
  )
}
