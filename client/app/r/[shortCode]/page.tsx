'use client'

import { useEffect } from 'react'
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import { marketingAttributionApi } from '@/lib/api'
import {
  getOrCreateMarketingLaunch,
  getOrCreateMarketingVisitorToken,
  MARKETING_ATTRIBUTION_CAPTURED_EVENT,
  saveMarketingLaunchTarget,
} from '@/lib/marketing-attribution'
import { sanitizeRedirect } from '@/lib/security'

export default function MarketingCampaignLandingPage() {
  const params = useParams<{ shortCode: string }>()
  const router = useRouter()
  const shortCode = params.shortCode

  useEffect(() => {
    if (!shortCode) {
      router.replace('/')
      return
    }

    const capture = async () => {
      const visitorToken = getOrCreateMarketingVisitorToken()
      const launch = getOrCreateMarketingLaunch(shortCode)

      try {
        const result = await marketingAttributionApi.captureWebTouch({
          campaignCode: shortCode,
          visitorToken,
          launchKey: launch.launchKey,
        })
        if (!result.accepted || !result.targetPath) {
          router.replace('/')
          return
        }

        saveMarketingLaunchTarget(shortCode, result.targetPath)
        window.dispatchEvent(new Event(MARKETING_ATTRIBUTION_CAPTURED_EVENT))
        router.replace(sanitizeRedirect(result.targetPath, '/'))
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 409 && launch.targetPath) {
          router.replace(sanitizeRedirect(launch.targetPath, '/'))
          return
        }
        router.replace('/')
      }
    }

    void capture()
  }, [router, shortCode])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-10 h-10 border-4 border-[#f77430] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
