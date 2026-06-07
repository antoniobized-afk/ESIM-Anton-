'use client'

import type { AuthIdentityProvider, UserIdentitySummary } from '@/lib/api'
import TelegramLoginWidgetButton from '@/components/TelegramLoginWidgetButton'
import { AlertCircle, Check, Loader2 } from '@/components/icons'
import {
  BOT_USERNAME,
  IDENTITY_PROVIDER_META,
  providerIcon,
  type IdentityMessage,
} from './types'

interface IdentitySectionProps {
  identities: UserIdentitySummary[]
  identitiesLoading: boolean
  identityAction: string | null
  identityMessage: IdentityMessage | null
  linkableProviders: AuthIdentityProvider[]
  telegramWebAppAvailable: boolean
  onOpenEmailLink: () => void
  onTelegramLink: () => void
  onOAuthLink: (provider: 'google' | 'yandex') => void
  onUnlink: (identity: UserIdentitySummary) => void
}

export function IdentitySection({
  identities,
  identitiesLoading,
  identityAction,
  identityMessage,
  linkableProviders,
  telegramWebAppAvailable,
  onOpenEmailLink,
  onTelegramLink,
  onOAuthLink,
  onUnlink,
}: IdentitySectionProps) {
  return (
    <section className="mb-6">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">Способы входа</p>
      <div className="card-neutral overflow-hidden">
        {identityMessage && (
          <div className={`mx-4 mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            identityMessage.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
          }`}>
            {identityMessage.type === 'success'
              ? <Check size={16} className="mt-0.5 shrink-0" />
              : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{identityMessage.text}</span>
          </div>
        )}

        {identitiesLoading && (
          <div className="flex items-center gap-3 px-4 py-4 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            Загружаем способы входа
          </div>
        )}

        {!identitiesLoading && identities.map((identity, index) => (
          <IdentityRow
            key={identity.id}
            identity={identity}
            showDivider={index > 0}
            identityAction={identityAction}
            onUnlink={onUnlink}
          />
        ))}

        {linkableProviders.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-800">
            <div className="grid grid-cols-2 gap-2">
              {linkableProviders.map((provider) => (
                <LinkProviderButton
                  key={provider}
                  provider={provider}
                  identityAction={identityAction}
                  telegramWebAppAvailable={telegramWebAppAvailable}
                  onOpenEmailLink={onOpenEmailLink}
                  onTelegramLink={onTelegramLink}
                  onOAuthLink={onOAuthLink}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function IdentityRow({
  identity,
  showDivider,
  identityAction,
  onUnlink,
}: {
  identity: UserIdentitySummary
  showDivider: boolean
  identityAction: string | null
  onUnlink: (identity: UserIdentitySummary) => void
}) {
  const meta = IDENTITY_PROVIDER_META[identity.provider]
  const Icon = providerIcon(identity.provider)

  return (
    <div>
      {showDivider && <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />}
      <div className="flex items-center gap-4 px-4 py-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.tone}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white">{identity.label}</p>
            {identity.emailVerified && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:bg-green-900/20 dark:text-green-300">
                подтвержден
              </span>
            )}
          </div>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {identity.email || identity.displayName || meta.description}
          </p>
        </div>
        <button
          onClick={() => onUnlink(identity)}
          disabled={!identity.canUnlink || identityAction === identity.id}
          className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {identityAction === identity.id ? <Loader2 size={16} className="animate-spin" /> : 'Отвязать'}
        </button>
      </div>
    </div>
  )
}

function LinkProviderButton({
  provider,
  identityAction,
  telegramWebAppAvailable,
  onOpenEmailLink,
  onTelegramLink,
  onOAuthLink,
}: {
  provider: AuthIdentityProvider
  identityAction: string | null
  telegramWebAppAvailable: boolean
  onOpenEmailLink: () => void
  onTelegramLink: () => void
  onOAuthLink: (provider: 'google' | 'yandex') => void
}) {
  const meta = IDENTITY_PROVIDER_META[provider]
  const Icon = providerIcon(provider)
  const loadingProvider = identityAction === provider.toLowerCase()

  if (provider === 'TELEGRAM' && !telegramWebAppAvailable) {
    return (
      <TelegramLoginWidgetButton
        botUsername={BOT_USERNAME}
        onAuthFunctionName="onTelegramIdentityLink"
        title={meta.label}
        subtitle="Привязать"
        loading={loadingProvider}
        disabled={Boolean(identityAction)}
        fallbackText="Для привязки Telegram откройте приложение через бота"
        fallbackCta="Открыть в Telegram"
        fallbackStart="link"
      />
    )
  }

  return (
    <button
      onClick={() => {
        if (provider === 'EMAIL') {
          onOpenEmailLink()
        } else if (provider === 'TELEGRAM') {
          onTelegramLink()
        } else if (provider === 'GOOGLE') {
          onOAuthLink('google')
        } else if (provider === 'YANDEX') {
          onOAuthLink('yandex')
        }
      }}
      disabled={Boolean(identityAction)}
      className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:hover:bg-gray-800"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.tone}`}>
        {loadingProvider ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{meta.label}</p>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">Привязать</p>
      </div>
    </button>
  )
}
