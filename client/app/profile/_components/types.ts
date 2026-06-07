'use client'

import type { AuthIdentityProvider } from '@/lib/api'
import { Globe, Mail, MessageCircle, Shield } from '@/components/icons'

export interface UserProfile {
  id: string
  firstName: string
  lastName?: string
  username?: string
  email?: string
  photoUrl?: string
  balance: number
  bonusBalance: number
  referralCode: string
}

export type Language = 'ru' | 'en'
export type ThemePreference = 'light' | 'dark' | 'system'
export type IdentityMessage = { type: 'success' | 'error'; text: string }
export type EmailLinkStep = 'email' | 'code'

export const LINKABLE_PROVIDER_ORDER: AuthIdentityProvider[] = ['EMAIL', 'TELEGRAM', 'GOOGLE', 'YANDEX']
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'mojo_mobile_bot'

export const IDENTITY_PROVIDER_META: Record<AuthIdentityProvider, {
  label: string
  description: string
  tone: string
}> = {
  EMAIL: {
    label: 'Email',
    description: 'Вход по одноразовому коду',
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
  },
  TELEGRAM: {
    label: 'Telegram',
    description: 'Вход через Telegram',
    tone: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30',
  },
  GOOGLE: {
    label: 'Google',
    description: 'OAuth вход',
    tone: 'bg-red-100 text-red-600 dark:bg-red-900/30',
  },
  YANDEX: {
    label: 'Яндекс',
    description: 'OAuth вход',
    tone: 'bg-orange-100 text-[#f77430] dark:bg-orange-900/30',
  },
  VK: {
    label: 'VK',
    description: 'OAuth вход',
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
  },
}

export function providerIcon(provider: AuthIdentityProvider) {
  if (provider === 'EMAIL') return Mail
  if (provider === 'TELEGRAM') return MessageCircle
  if (provider === 'GOOGLE' || provider === 'YANDEX') return Shield
  return Globe
}
