import { Suspense } from 'react'
import Spinner from '@/components/ui/Spinner'
import MarketingAttributionWorkspace from './_components/MarketingAttributionWorkspace'

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="glass-card p-8"><Spinner centered /></div>}>
      <MarketingAttributionWorkspace />
    </Suspense>
  )
}
