'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, ChevronLeft, Loader2, Shield, AlertCircle } from '@/components/icons'
import { api } from '@/lib/api'
import { isTelegramWebApp, getToken } from '@/lib/auth'
import { useAuth } from '@/components/AuthProvider'
import TelegramLoginWidgetButton from '@/components/TelegramLoginWidgetButton'
import { sanitizeRedirect } from '@/lib/security'
import { Suspense } from 'react'

type Step = 'choose' | 'email' | 'code'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'mojo_mobile_bot'

const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google', color: '#EA4335', bg: '#EA433515', icon: GoogleIcon, visible: false },
  { id: 'yandex', label: 'Яндекс', color: '#FC3F1D', bg: '#FC3F1D15', icon: YandexIcon },
]
const VISIBLE_OAUTH_PROVIDERS = OAUTH_PROVIDERS.filter(({ visible }) => visible !== false)

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [step, setStep] = useState<Step>('choose')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isTelegramWebApp()) {
      const safeReturnTo = sanitizeRedirect(searchParams.get('returnTo'), '/')
      router.replace(safeReturnTo)
      return
    }

    const existingToken = getToken()
    if (existingToken) {
      const safeReturnTo = sanitizeRedirect(searchParams.get('returnTo'), '/')
      router.replace(safeReturnTo)
      return
    }

    const err = searchParams.get('error')
    if (err) setError(decodeURIComponent(err))
  }, [router, searchParams])

  useEffect(() => {
    if (step === 'code') {
      codeInputRef.current?.focus()
      startCountdown()
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [step])

  // Telegram Login Widget callback — вызывается виджетом Telegram
  useEffect(() => {
    (window as any).onTelegramAuth = async (userData: Record<string, string>) => {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.post('/auth/telegram', userData)
        const { data: user } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${data.access_token}` }
        })
        login(data.access_token, user)
        const safeReturnTo = sanitizeRedirect(new URLSearchParams(window.location.search).get('returnTo'), '/')
        router.replace(safeReturnTo)
      } catch (e: any) {
        setError(e.response?.data?.message || 'Ошибка входа через Telegram')
        setLoading(false)
      }
    }
    return () => { delete (window as any).onTelegramAuth }
  }, [router])

  const startCountdown = () => {
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Введите корректный email'); return
    }
    setError(''); setLoading(true)
    try {
      await api.post('/auth/email/send-code', { email })
      setStep('code')
    } catch (e: any) {
      setError(e.response?.data?.message || 'Не удалось отправить код')
    } finally { setLoading(false) }
  }

  const handleVerifyCode = async () => {
    if (code.length !== 6) { setError('Введите 6-значный код'); return }
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/email/verify', { email, code })
      const { data: user } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      })
      login(data.access_token, user)
      router.replace(sanitizeRedirect(searchParams.get('returnTo'), '/'))
    } catch (e: any) {
      setError(e.response?.data?.message || 'Неверный код')
    } finally { setLoading(false) }
  }

  const handleOAuth = (provider: string) => {
    const safeReturnTo = sanitizeRedirect(searchParams.get('returnTo'), '/')
    const state = encodeURIComponent(safeReturnTo)
    window.location.href = `${BACKEND_URL}/auth/oauth/${provider}/redirect?state=${state}`
  }



  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-full max-w-sm">

        {/* Лого */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#f2622a] to-[#f7b64f] mx-auto mb-4 flex items-center justify-center shadow-2xl overflow-hidden">
            <img src="/logo-mark.png" alt="Mojo mobile" className="w-full h-full object-cover rounded-2xl scale-110" />
          </div>
          <h1 className="text-2xl font-bold text-primary">Mojo mobile</h1>
          <p className="text-secondary text-sm mt-1">eSIM для путешествий по всему миру</p>
        </div>

        {/* Шаг 1: выбор способа */}
        {step === 'choose' && (
          <div className="glass-card flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-primary mb-4">Войти или создать аккаунт</h2>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl text-red-600 text-sm">
                <AlertCircle size={16} />{error}
              </div>
            )}

            {/* Email */}
            <button onClick={() => { setError(''); setStep('email') }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-all text-left">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Mail size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-primary text-sm">По email</p>
                <p className="text-xs text-secondary">Код придёт на почту</p>
              </div>
              <ArrowRight size={16} className="text-muted" />
            </button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs text-muted"><span className="bg-white/80 dark:bg-gray-800/80 px-3 rounded">или войти через</span></div>
            </div>

            {/* OAuth кнопки */}
            {VISIBLE_OAUTH_PROVIDERS.map(({ id, label, color, bg, icon: Icon }) => (
              <button key={id} onClick={() => handleOAuth(id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-all">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon color={color} />
                </div>
                <span className="font-medium text-primary text-sm flex-1 text-left">{label}</span>
                <ArrowRight size={16} className="text-muted" />
              </button>
            ))}

            {/* Telegram Login Widget */}
            <div className="flex justify-center pt-1">
              <TelegramLoginWidgetButton
                botUsername={BOT_USERNAME}
                onAuthFunctionName="onTelegramAuth"
                localhostDescription="Откройте production-домен после деплоя"
              />
            </div>

            {loading && (
              <div className="flex justify-center pt-2">
                <Loader2 size={20} className="animate-spin text-accent" />
              </div>
            )}

            <p className="text-xs text-center text-muted pt-2">
              Продолжая, вы принимаете{' '}
              <a href="/offer" className="text-accent underline">публичную оферту</a>
              {' '}и{' '}
              <a href="/agreement" className="text-accent underline">пользовательское соглашение</a>
            </p>
          </div>
        )}

        {/* Шаг 2: ввод email */}
        {step === 'email' && (
          <div className="glass-card">
            <button onClick={() => { setError(''); setStep('choose') }}
              className="flex items-center gap-1 text-accent text-sm mb-5">
              <ChevronLeft size={18} /> Назад
            </button>
            <h2 className="text-lg font-semibold text-primary mb-1">Введите email</h2>
            <p className="text-secondary text-sm mb-5">Отправим код подтверждения на почту</p>

            <input type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder="your@email.com"
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-white/5 text-primary placeholder-gray-400 focus:outline-none focus:border-[#f29b41] text-base font-medium mb-3"
            />

            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

            <button onClick={handleSendCode}
              disabled={loading || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
              className="w-full py-3.5 rounded-2xl bg-[#f77430] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#f2622a] transition-colors">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Получить код →'}
            </button>
          </div>
        )}

        {/* Шаг 3: ввод кода */}
        {step === 'code' && (
          <div className="glass-card">
            <button onClick={() => { setError(''); setStep('email') }}
              className="flex items-center gap-1 text-accent text-sm mb-5">
              <ChevronLeft size={18} /> Назад
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Shield size={22} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Введите код из email</h2>
                <p className="text-secondary text-xs">Отправили на {email}</p>
              </div>
            </div>

            <input ref={codeInputRef}
              type="text" inputMode="numeric" maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • • • •"
              className="w-full text-center text-3xl font-bold tracking-[0.4em] px-4 py-4 rounded-2xl border border-gray-200 bg-white/80 text-primary placeholder-gray-300 focus:outline-none focus:border-[#f29b41] mb-3"
            />

            {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}

            <button onClick={handleVerifyCode}
              disabled={loading || code.length !== 6}
              className="w-full py-3.5 rounded-2xl bg-[#f77430] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#f2622a] transition-colors mb-3">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Войти →'}
            </button>

            <div className="text-center">
              {countdown > 0
                ? <p className="text-secondary text-sm">Повторить через {countdown} сек</p>
                : <button onClick={handleSendCode} className="text-accent text-sm font-medium hover:underline">Отправить снова</button>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SVG Icons ─────────────────────────────────────────────────────────────
function GoogleIcon({ color: _color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function YandexIcon({ color: c }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={c}>
      <path d="M14.341 21h-2.744V8.215H10.32c-2.047 0-3.123 1.023-3.123 2.537 0 1.74.755 2.55 2.336 3.598L11.2 15.59 8.217 21H5.27l3.28-5.191c-1.906-1.348-2.985-2.67-2.985-4.972C5.285 7.898 7.16 6 10.293 6H14.34V21h.001z" />
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={48} className="animate-spin text-[#f77430]" />
      </div>
    }>
      <LoginInner />
    </Suspense>
  )
}
