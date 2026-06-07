'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Loader2 } from '@/components/icons'

type TelegramLoginWidgetButtonProps = {
  botUsername: string
  onAuthFunctionName: string
  title?: string
  subtitle?: string
  loading?: boolean
  disabled?: boolean
  localhostTitle?: string
  localhostDescription?: string
  fallbackText?: string
  fallbackCta?: string
  fallbackStart?: string
}

export default function TelegramLoginWidgetButton({
  botUsername,
  onAuthFunctionName,
  title = 'Telegram',
  subtitle = 'Войти через Telegram',
  loading = false,
  disabled = false,
  localhostTitle = 'Telegram вход работает на домене, не на localhost',
  localhostDescription = 'Откройте production-домен после деплоя',
  fallbackText = 'Для входа через Telegram откройте приложение через бота',
  fallbackCta = 'Открыть в Telegram',
  fallbackStart = 'login',
}: TelegramLoginWidgetButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLocalhost, setIsLocalhost] = useState(false)
  const [widgetFailed, setWidgetFailed] = useState(false)

  useEffect(() => {
    setIsLocalhost(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1',
    )
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    if (isLocalhost || disabled) return
    containerRef.current.innerHTML = ''
    setWidgetFailed(false)

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'medium')
    script.setAttribute('data-onauth', `${onAuthFunctionName}(user)`)
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-radius', '12')
    script.onerror = () => setWidgetFailed(true)
    script.async = true
    containerRef.current.appendChild(script)

    const timeout = setTimeout(() => {
      const hasIframe = Boolean(containerRef.current?.querySelector('iframe'))
      if (!hasIframe) setWidgetFailed(true)
    }, 3500)

    return () => clearTimeout(timeout)
  }, [botUsername, disabled, isLocalhost, onAuthFunctionName])

  if (isLocalhost) {
    return (
      <div className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-center">
        <p className="text-xs font-medium text-[#f2622a]">{localhostTitle}</p>
        <p className="mt-1 text-[11px] text-orange-700">{localhostDescription}</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="relative">
        <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 transition-all ${disabled ? 'opacity-60' : 'hover:bg-white/80 dark:hover:bg-white/10'}`}>
          <div className="w-10 h-10 rounded-xl bg-[#E9F4FF] flex items-center justify-center shrink-0">
            {loading ? (
              <Loader2 size={18} className="animate-spin text-[#2AABEE]" />
            ) : (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="#2AABEE" aria-hidden="true">
                <path d="M9.9 15.2 9.5 20c.6 0 .9-.3 1.3-.6l3.1-3 6.4 4.7c1.2.7 2 .3 2.3-1.1l4.1-19.3c.4-1.7-.6-2.4-1.8-2L1.2 8.8C-.4 9.4-.4 10.3.9 10.7l6.5 2 15-9.5c.7-.4 1.3-.2.8.3" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate font-medium text-primary text-sm">{title}</p>
            <p className="truncate text-xs text-secondary">{subtitle}</p>
          </div>
          <ArrowRight size={16} className="text-muted" />
        </div>

        {!disabled && (
          <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center opacity-0 cursor-pointer"
            aria-hidden="true"
          />
        )}
      </div>

      {widgetFailed && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] text-amber-800 text-center">{fallbackText}</p>
          <a
            href={`https://t.me/${botUsername}?start=${encodeURIComponent(fallbackStart)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block w-full rounded-lg bg-[#2AABEE] py-2.5 text-center text-xs font-semibold text-white"
          >
            {fallbackCta}
          </a>
        </div>
      )}
    </div>
  )
}
