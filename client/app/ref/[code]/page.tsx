'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { referralsApi } from '@/lib/api'

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'mojo_mobile_bot'
const PENDING_REFERRAL_KEY = 'pendingReferralCode'
const WEB_REFERRAL_RETURN_TO = '/'

export default function ReferralLandingPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const code = params.code

  const [loading, setLoading] = useState(true)
  const [isValid, setIsValid] = useState(false)
  const [promoCode, setPromoCode] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!code) return

    referralsApi
      .getPublicLinkInfo(code)
      .then((info) => {
        setIsValid(info.isValid)
        setPromoCode(info.promoCode)
        if (info.isValid) {
          localStorage.setItem(PENDING_REFERRAL_KEY, code)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [code])

  const telegramLink = `https://t.me/${BOT_USERNAME}?startapp=ref_${code}`

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <div className="w-10 h-10 border-4 border-[#f77430] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Error / Invalid ────────────────────────────────────────────────
  if (error || !isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-gradient)' }}>
        <div className="w-full max-w-sm text-center">
          <div className="glass-card p-8">
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 mx-auto mb-4 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-primary mb-2">Ссылка недействительна</h1>
            <p className="text-sm text-secondary mb-6">
              Эта реферальная ссылка больше не активна или не существует.
            </p>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-2xl bg-[#f77430] text-white font-semibold hover:bg-[#f2622a] transition-colors"
            >
              Перейти в каталог
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Valid link ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#f2622a] to-[#f7b64f] mx-auto mb-4 flex items-center justify-center shadow-2xl overflow-hidden">
            <img src="/logo-mark.png" alt="Mojo mobile" className="w-full h-full object-cover rounded-2xl scale-110" />
          </div>
          <h1 className="text-2xl font-bold text-primary">Mojo mobile</h1>
          <p className="text-secondary text-sm mt-1">Вас пригласили в Mojo mobile!</p>
        </div>

        {/* Invite card */}
        <div className="card-accent p-5 mb-4 overflow-hidden relative animate-slide-up">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#f77430]/25 to-[#f9d17f]/25 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" />
                  <polyline points="12 15 12 3" />
                  <polyline points="8 7 12 3 16 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-white">Персональное приглашение</p>
                <p className="text-sm text-white/85">Покупайте eSIM для путешествий</p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral offer */}
        {promoCode && (
          <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <p className="text-sm font-medium text-primary">
              По этому приглашению скидка применится автоматически к вашей первой покупке.
            </p>
            <p className="mt-2 text-xs text-secondary">
              Ничего копировать и вводить вручную не нужно. Сначала войдите или зарегистрируйтесь.
            </p>
          </div>
        )}

        {!promoCode && (
          <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <p className="text-sm text-primary">
              Чтобы активировать условия по приглашению, сначала войдите или зарегистрируйтесь.
            </p>
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <a
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-[#2AABEE] text-white font-semibold shadow-md hover:bg-[#229ED9] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M9.9 15.2 9.5 20c.6 0 .9-.3 1.3-.6l3.1-3 6.4 4.7c1.2.7 2 .3 2.3-1.1l4.1-19.3c.4-1.7-.6-2.4-1.8-2L1.2 8.8C-.4 9.4-.4 10.3.9 10.7l6.5 2 15-9.5c.7-.4 1.3-.2.8.3" />
            </svg>
            Открыть в Telegram
          </a>

          <button
            onClick={() =>
              router.push(`/login?returnTo=${encodeURIComponent(WEB_REFERRAL_RETURN_TO)}`)
            }
            className="w-full py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 text-primary font-semibold hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
          >
            Войти и активировать скидку
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted mt-6">
          eSIM для путешествий в 100+ странах мира
        </p>
      </div>
    </div>
  )
}
