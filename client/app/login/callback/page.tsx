'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle } from '@/components/icons'
import { api } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import { sanitizeRedirect } from '@/lib/security'
import { Suspense } from 'react'

function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const safeReturnTo = sanitizeRedirect(searchParams.get('returnTo'), '/')
    const error = searchParams.get('error')

    if (error) {
      setErrorMsg(decodeURIComponent(error))
      setStatus('error')
      setTimeout(() => router.replace('/login'), 3000)
      return
    }

    if (!token) {
      setErrorMsg('Токен не получен')
      setStatus('error')
      setTimeout(() => router.replace('/login'), 3000)
      return
    }

    const finish = async () => {
      try {
        const { data: user } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        login(token, user)
        setStatus('success')
        setTimeout(() => router.replace(safeReturnTo), 800)
      } catch {
        setErrorMsg('Не удалось получить данные пользователя')
        setStatus('error')
        setTimeout(() => router.replace('/login'), 3000)
      }
    }

    finish()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg-gradient)' }}>
      <div className="glass-card text-center max-w-sm w-full">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="animate-spin text-accent mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-primary">Входим в аккаунт...</h2>
            <p className="text-secondary text-sm mt-1">Подождите секунду</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-primary">Вход выполнен!</h2>
            <p className="text-secondary text-sm mt-1">Перенаправляем...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-primary">Ошибка входа</h2>
            <p className="text-secondary text-sm mt-2">{errorMsg}</p>
            <p className="text-muted text-xs mt-2">Возвращаем на страницу входа...</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={48} className="animate-spin text-accent" />
      </div>
    }>
      <CallbackInner />
    </Suspense>
  )
}
