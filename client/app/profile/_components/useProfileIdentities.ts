'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  authIdentitiesApi,
  type AuthIdentityProvider,
  type UserIdentitySummary,
} from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import {
  LINKABLE_PROVIDER_ORDER,
  type EmailLinkStep,
  type IdentityMessage,
  type UserProfile,
} from './types'

export function useProfileIdentities(user: UserProfile | null) {
  const { user: authUser, token, isLoading: authLoading, refreshUser } = useAuth()
  const [identities, setIdentities] = useState<UserIdentitySummary[]>([])
  const [availableIdentityProviders, setAvailableIdentityProviders] = useState<AuthIdentityProvider[]>([])
  const [identitiesLoading, setIdentitiesLoading] = useState(false)
  const [identityAction, setIdentityAction] = useState<string | null>(null)
  const [identityMessage, setIdentityMessage] = useState<IdentityMessage | null>(null)
  const [showEmailLinkModal, setShowEmailLinkModal] = useState(false)
  const [emailLinkStep, setEmailLinkStep] = useState<EmailLinkStep>('email')
  const [emailLinkValue, setEmailLinkValue] = useState('')
  const [emailLinkCode, setEmailLinkCode] = useState('')
  const [telegramWebAppAvailable, setTelegramWebAppAvailable] = useState(false)

  const loadIdentities = useCallback(async () => {
    try {
      setIdentitiesLoading(true)
      const result = await authIdentitiesApi.getMine()
      setIdentities(result.identities)
      setAvailableIdentityProviders(result.availableProviders)
    } catch (e) {
      console.error('Identities load error:', e)
      setIdentities([])
      setAvailableIdentityProviders([])
    } finally {
      setIdentitiesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!token && !authUser) return

    void loadIdentities()
  }, [authLoading, authUser, loadIdentities, token])

  useEffect(() => {
    setTelegramWebAppAvailable(Boolean((window as any).Telegram?.WebApp?.initData))
  }, [])

  useEffect(() => {
    const profileWindow = window as any

    profileWindow.onTelegramIdentityLink = async (userData: Record<string, string>) => {
      setIdentityAction('telegram')
      setIdentityMessage(null)
      try {
        const result = await authIdentitiesApi.linkTelegramWidget(userData)
        setIdentityMessage({
          type: 'success',
          text: result.status === 'already_linked'
            ? 'Telegram уже привязан.'
            : 'Telegram привязан.',
        })
        await Promise.all([loadIdentities(), refreshUser()])
      } catch (e: any) {
        setIdentityMessage({
          type: 'error',
          text: e?.response?.data?.message || 'Не удалось привязать Telegram.',
        })
      } finally {
        setIdentityAction(null)
      }
    }

    return () => {
      delete profileWindow.onTelegramIdentityLink
    }
  }, [loadIdentities, refreshUser])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linkStatus = params.get('identityLink')
    const linkError = params.get('identityError')
    if (!linkStatus) return

    setIdentityMessage({
      type: linkStatus === 'linked' || linkStatus === 'already_linked' ? 'success' : 'error',
      text: linkStatus === 'already_linked'
        ? 'Этот способ входа уже был привязан.'
        : linkStatus === 'linked'
          ? 'Способ входа привязан.'
          : linkError || 'Не удалось привязать способ входа.',
    })
    window.history.replaceState(null, '', '/profile')
    void loadIdentities()
    void refreshUser()
  }, [loadIdentities, refreshUser])

  const handleOAuthLink = useCallback(async (provider: 'google' | 'yandex') => {
    setIdentityAction(provider)
    setIdentityMessage(null)
    try {
      const { url } = await authIdentitiesApi.startOAuthLink(provider, '/profile')
      window.location.href = url
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось начать привязку.',
      })
      setIdentityAction(null)
    }
  }, [])

  const handleTelegramLink = useCallback(async () => {
    const initData = (window as any).Telegram?.WebApp?.initData
    if (!initData) {
      setIdentityMessage({
        type: 'error',
        text: 'Telegram можно привязать из Mini App.',
      })
      return
    }

    setIdentityAction('telegram')
    setIdentityMessage(null)
    try {
      const result = await authIdentitiesApi.linkTelegramWebApp(initData)
      setIdentityMessage({
        type: 'success',
        text: result.status === 'already_linked'
          ? 'Telegram уже привязан.'
          : 'Telegram привязан.',
      })
      await Promise.all([loadIdentities(), refreshUser()])
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось привязать Telegram.',
      })
    } finally {
      setIdentityAction(null)
    }
  }, [loadIdentities, refreshUser])

  const openEmailLinkModal = useCallback(() => {
    setEmailLinkValue(user?.email || '')
    setEmailLinkCode('')
    setEmailLinkStep('email')
    setShowEmailLinkModal(true)
  }, [user?.email])

  const sendEmailLinkCode = useCallback(async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLinkValue)) {
      setIdentityMessage({ type: 'error', text: 'Введите корректный email.' })
      return
    }

    setIdentityAction('email')
    setIdentityMessage(null)
    try {
      await authIdentitiesApi.sendEmailLinkCode(emailLinkValue)
      setEmailLinkStep('code')
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось отправить код.',
      })
    } finally {
      setIdentityAction(null)
    }
  }, [emailLinkValue])

  const verifyEmailLink = useCallback(async () => {
    if (emailLinkCode.length !== 6) {
      setIdentityMessage({ type: 'error', text: 'Введите 6-значный код.' })
      return
    }

    setIdentityAction('email')
    setIdentityMessage(null)
    try {
      const result = await authIdentitiesApi.verifyEmailLink(emailLinkValue, emailLinkCode)
      setIdentityMessage({
        type: 'success',
        text: result.status === 'already_linked'
          ? 'Email уже был привязан.'
          : 'Email привязан.',
      })
      setShowEmailLinkModal(false)
      setEmailLinkStep('email')
      setEmailLinkCode('')
      await Promise.all([loadIdentities(), refreshUser()])
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось привязать email.',
      })
    } finally {
      setIdentityAction(null)
    }
  }, [emailLinkCode, emailLinkValue, loadIdentities, refreshUser])

  const unlinkIdentity = useCallback(async (identity: UserIdentitySummary) => {
    if (!identity.canUnlink) {
      setIdentityMessage({ type: 'error', text: 'Нельзя удалить последний способ входа.' })
      return
    }
    if (!window.confirm(`Отвязать ${identity.label}?`)) return

    setIdentityAction(identity.id)
    setIdentityMessage(null)
    try {
      await authIdentitiesApi.unlink(identity.id)
      setIdentityMessage({ type: 'success', text: `${identity.label} отвязан.` })
      await Promise.all([loadIdentities(), refreshUser()])
    } catch (e: any) {
      setIdentityMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Не удалось отвязать способ входа.',
      })
    } finally {
      setIdentityAction(null)
    }
  }, [loadIdentities, refreshUser])

  const linkableProviders = useMemo(() => {
    const linkedProviders = new Set(identities.map((identity) => identity.provider))
    return LINKABLE_PROVIDER_ORDER.filter((provider) =>
      availableIdentityProviders.includes(provider) && !linkedProviders.has(provider)
    )
  }, [availableIdentityProviders, identities])

  return {
    identities,
    identitiesLoading,
    identityAction,
    identityMessage,
    linkableProviders,
    telegramWebAppAvailable,
    showEmailLinkModal,
    emailLinkStep,
    emailLinkValue,
    emailLinkCode,
    setShowEmailLinkModal,
    setEmailLinkStep,
    setEmailLinkValue,
    setEmailLinkCode,
    openEmailLinkModal,
    handleOAuthLink,
    handleTelegramLink,
    sendEmailLinkCode,
    verifyEmailLink,
    unlinkIdentity,
  }
}
