'use client'

import { useCallback, useEffect, useState } from 'react'
import { referralsApi, type ReferralStats } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import type { UserProfile } from './types'

export function useProfileData() {
  const { user: authUser, isLoading: authLoading } = useAuth()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUserData = useCallback(async () => {
    let redirectedToLogin = false
    try {
      if (authUser) {
        setUser({
          id: authUser.id,
          firstName: authUser.firstName || 'Пользователь',
          lastName: authUser.lastName,
          username: authUser.username,
          email: authUser.email,
          balance: Number(authUser.balance) || 0,
          bonusBalance: Number(authUser.bonusBalance) || 0,
          referralCode: authUser.referralCode,
        })
      } else {
        const { getToken } = await import('@/lib/auth')
        const token = getToken()
        if (token) {
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          setUser({
            id: data.id,
            firstName: data.firstName || 'Пользователь',
            lastName: data.lastName,
            username: data.username,
            email: data.email,
            balance: Number(data.balance) || 0,
            bonusBalance: Number(data.bonusBalance) || 0,
            referralCode: data.referralCode,
          })
        } else {
          redirectedToLogin = true
          window.location.replace('/login')
          return
        }
      }
    } catch (e: any) {
      console.error('Profile load error:', e)
      const status = e?.response?.status
      if (status === 401 || status === 403) {
        redirectedToLogin = true
        const { clearToken } = await import('@/lib/auth')
        clearToken()
        window.location.replace('/login')
      }
    } finally {
      if (!redirectedToLogin) {
        setLoading(false)
      }
    }
  }, [authUser])

  const loadReferralStats = useCallback(async () => {
    try {
      const stats = await referralsApi.getStats()
      setReferralStats(stats)
    } catch (e) {
      console.error('Referral stats load error:', e)
      setReferralStats(null)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void loadUserData()
    void loadReferralStats()
  }, [authLoading, loadReferralStats, loadUserData])

  return { user, referralStats, loading }
}
