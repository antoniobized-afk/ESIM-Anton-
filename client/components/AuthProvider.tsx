'use client'

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { AuthUser, getToken, setToken as saveToken, getStoredUser, setStoredUser, clearToken, isTelegramEnvironment, hasTelegramLaunchParams } from '@/lib/auth'
import { api, referralsApi } from '@/lib/api'

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isBootstrapped: boolean
  isTelegram: boolean
  isTelegramReady: boolean
  authError: 'telegram-auth-required' | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  isBootstrapped: false,
  isTelegram: false,
  isTelegramReady: false,
  authError: null,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
})

const PENDING_REFERRAL_KEY = 'pendingReferralCode'

export function AuthProvider({ children }: { children: any }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [isTelegram, setIsTelegram] = useState(false)
  const [isTelegramReady, setIsTelegramReady] = useState(false)
  const [authError, setAuthError] = useState<'telegram-auth-required' | null>(null)

  useEffect(() => {
    const updateTelegramReady = () => {
      setIsTelegramReady(Boolean((window as any).Telegram?.WebApp))
    }

    updateTelegramReady()
    window.addEventListener('mojo:telegram-sdk-ready', updateTelegramReady)

    return () => {
      window.removeEventListener('mojo:telegram-sdk-ready', updateTelegramReady)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const tgEnv = isTelegramEnvironment()
        setIsTelegram(tgEnv)
        setAuthError(null)
        const shouldWaitForTelegram = tgEnv || hasTelegramLaunchParams()

        // Шаг 1: сразу восстанавливаем сессию из localStorage — UI показывается мгновенно
        const storedToken = getToken()
        const storedUser = getStoredUser()
        if (storedToken && storedUser) {
          setToken(storedToken)
          setUser(storedUser)
        }

        // Шаг 2: фоновая верификация / обновление токена
        if (shouldWaitForTelegram) {
          // Ждём загрузки Telegram SDK (async скрипт), max 2s
          let tgApp = (window as any).Telegram?.WebApp
          if (!tgApp?.initData) {
            tgApp = await new Promise<any | null>((resolve) => {
              let settled = false

              const finish = (value: any | null) => {
                if (settled) return
                settled = true
                cleanup()
                resolve(value)
              }

              const handleReady = () => {
                const nextApp = (window as any).Telegram?.WebApp
                if (nextApp?.initData) {
                  finish(nextApp)
                }
              }

              const cleanup = () => {
                clearTimeout(timeout)
                window.removeEventListener('mojo:telegram-sdk-ready', handleReady)
              }

              const timeout = setTimeout(() => {
                finish((window as any).Telegram?.WebApp?.initData ? (window as any).Telegram.WebApp : null)
              }, 2000)

              window.addEventListener('mojo:telegram-sdk-ready', handleReady)
              handleReady()
            })
          }

          if (tgApp?.initData) {
            try {
              const { data } = await api.post('/auth/telegram/webapp', { initData: tgApp.initData })
              const jwt = data.access_token
              saveToken(jwt)
              setToken(jwt)
              setAuthError(null)
              const { data: me } = await api.get('/auth/me', {
                headers: { Authorization: `Bearer ${jwt}` }
              })
              setUser(me)
              setStoredUser(me)
            } catch (e) {
              console.error('Telegram WebApp auth failed:', e)
              if (!storedToken) {
                setToken(null)
                setUser(null)
                setAuthError('telegram-auth-required')
              }
            }
          }
          setIsLoading(false)
        } else if (storedToken) {
          setIsLoading(false)
          // Тихая фоновая верификация токена
          try {
            const { data } = await api.get('/auth/me', {
              headers: { Authorization: `Bearer ${storedToken}` }
            })
            setUser(data)
            setStoredUser(data)
          } catch (e: any) {
            const status = e?.response?.status
            if (status === 401 || status === 403) {
              clearToken()
              setToken(null)
              setUser(null)
            }
          }
        } else {
          setIsLoading(false)
        }
      } finally {
        setIsBootstrapped(true)
      }
    }

    init()
  }, [])

  // One-shot: отправить pending referral code после авторизации
  const referralAttemptedRef = useRef(false)
  useEffect(() => {
    if (!isBootstrapped || !user || referralAttemptedRef.current) return
    const pendingCode = typeof window !== 'undefined'
      ? localStorage.getItem(PENDING_REFERRAL_KEY)
      : null
    if (!pendingCode) return
    referralAttemptedRef.current = true
    referralsApi
      .registerWebReferral(pendingCode)
      .then(() => {
        localStorage.removeItem(PENDING_REFERRAL_KEY)
        return refreshUser()
      })
      .catch(() => {
        // При transient ошибке сохраняем код для retry после следующего auth/bootstrap pass.
        referralAttemptedRef.current = false
      })
  }, [isBootstrapped, user])

  const login = (newToken: string, newUser: AuthUser) => {
    setToken(newToken)
    setUser(newUser)
    saveToken(newToken)
    setStoredUser(newUser)
  }

  const logout = () => {
    clearToken()
    setToken(null)
    setUser(null)
  }

  const refreshUser = async () => {
    const currentToken = token || getToken()
    if (!currentToken) return
    try {
      const { data } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${currentToken}` }
      })
      setUser(data)
      setStoredUser(data)
    } catch (e) {
      console.error('Failed to refresh user:', e)
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isBootstrapped, isTelegram, isTelegramReady, authError, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
