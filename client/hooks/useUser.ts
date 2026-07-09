'use client'

import { useState, useEffect } from 'react'
import { userApi } from '@/lib/api'
import { isTelegramWebApp, getTelegramUserId, getToken, getStoredUser } from '@/lib/auth'

export interface AppUser {
  id: string
  telegramId?: string
  username?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  balance: number
  bonusBalance: number
  referralCode: string
  totalSpent: number
}

export function useUser() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    setLoading(true)
    setError(null)
    try {
      if (isTelegramWebApp()) {
        // Telegram Mini App flow
        const telegramId = getTelegramUserId()
        if (telegramId) {
          const userData = await userApi.getMe(telegramId)
          setUser(userData)
        }
      } else {
        // PWA / Browser flow - use JWT
        const token = getToken()
        if (token) {
          // Try stored user first for speed
          const stored = getStoredUser()
          if (stored) setUser(stored)

          // Then refresh from server
          const { api } = await import('@/lib/api')
          const { data } = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          })
          setUser(data)
        } else {
          // Not logged in - redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
        }
      }
    } catch (e: any) {
      console.error('useUser error:', e)
      setError(e.message || 'Ошибка загрузки пользователя')
    } finally {
      setLoading(false)
    }
  }

  return { user, loading, error, refreshUser: loadUser }
}
