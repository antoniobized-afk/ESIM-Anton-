'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Bell, Check, Globe, Monitor, Moon, Sun, X } from '@/components/icons'
import { MenuItem, ProfileSection, SectionDivider } from './ProfileSection'
import type { EmailLinkStep, Language, ThemePreference } from './types'

interface SettingsSectionProps {
  language: Language
  theme: ThemePreference
  notifications: boolean
  onLanguageClick: () => void
  onThemeClick: () => void
  onNotificationsClick: () => void
}

interface BottomSheetProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

interface EmailLinkModalProps {
  step: EmailLinkStep
  email: string
  code: string
  identityAction: string | null
  onClose: () => void
  onStepChange: Dispatch<SetStateAction<EmailLinkStep>>
  onEmailChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSendCode: () => void
  onVerify: () => void
}

export function SettingsSection({
  language,
  theme,
  notifications,
  onLanguageClick,
  onThemeClick,
  onNotificationsClick,
}: SettingsSectionProps) {
  const themeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <ProfileSection title="Настройки">
      <MenuItem
        icon={Globe}
        label="Язык"
        onClick={onLanguageClick}
        value={<span className="text-gray-400 text-sm mr-1">{language === 'ru' ? 'Русский' : 'English'}</span>}
        iconWrapClassName="bg-orange-100"
      />
      <SectionDivider />
      <MenuItem
        icon={themeIcon}
        label="Тема"
        onClick={onThemeClick}
        value={<span className="text-gray-400 text-sm mr-1">{theme === 'light' ? 'Светлая' : theme === 'dark' ? 'Тёмная' : 'Авто'}</span>}
        iconClassName="text-white"
        iconWrapClassName="bg-gray-800"
      />
      <SectionDivider />
      <MenuItem
        icon={Bell}
        label="Уведомления"
        onClick={onNotificationsClick}
        value={<span className={`text-sm mr-1 ${notifications ? 'text-green-500' : 'text-gray-400'}`}>{notifications ? 'Вкл' : 'Выкл'}</span>}
        iconWrapClassName="bg-orange-100"
      />
    </ProfileSection>
  )
}

export function EmailLinkModal({
  step,
  email,
  code,
  identityAction,
  onClose,
  onStepChange,
  onEmailChange,
  onCodeChange,
  onSendCode,
  onVerify,
}: EmailLinkModalProps) {
  return (
    <BottomSheet title="Привязать email" onClose={onClose}>
      {step === 'email' && (
        <div className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value.trim())}
            placeholder="your@email.com"
            className="w-full px-4 py-3 rounded-xl soft-input text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f77430]"
          />
          <button
            onClick={onSendCode}
            disabled={identityAction === 'email'}
            className="w-full rounded-xl bg-[#f77430] py-3 font-semibold text-white disabled:opacity-50"
          >
            {identityAction === 'email' ? 'Отправляем...' : 'Получить код'}
          </button>
        </div>
      )}

      {step === 'code' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Код отправлен на {email}</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-4 py-3 rounded-xl soft-input text-center text-2xl font-bold tracking-[0.3em] text-gray-900 dark:text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#f77430]"
          />
          <button
            onClick={onVerify}
            disabled={identityAction === 'email' || code.length !== 6}
            className="w-full rounded-xl bg-[#f77430] py-3 font-semibold text-white disabled:opacity-50"
          >
            {identityAction === 'email' ? 'Проверяем...' : 'Привязать email'}
          </button>
          <button
            onClick={() => onStepChange('email')}
            className="w-full rounded-xl py-2 text-sm font-medium text-gray-500"
          >
            Изменить email
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

export function LanguageModal({ language, onClose, onChange }: {
  language: Language
  onClose: () => void
  onChange: (language: Language) => void
}) {
  return (
    <BottomSheet title="Выбор языка" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <LanguageOption active={language === 'ru'} label="Русский" flag="🇷🇺" onClick={() => onChange('ru')} />
        <LanguageOption active={language === 'en'} label="English" flag="🇬🇧" onClick={() => onChange('en')} />
      </div>
    </BottomSheet>
  )
}

export function ThemeModal({ theme, onClose, onChange }: {
  theme: ThemePreference
  onClose: () => void
  onChange: (theme: ThemePreference) => void
}) {
  return (
    <BottomSheet title="Выбор темы" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <ThemeOption active={theme === 'light'} label="Светлая" icon={<Sun className="text-yellow-500" size={24} />} onClick={() => onChange('light')} />
        <ThemeOption active={theme === 'dark'} label="Тёмная" icon={<Moon className="text-[#f29b41]" size={24} />} onClick={() => onChange('dark')} />
        <ThemeOption active={theme === 'system'} label="Как в системе" icon={<Monitor className="text-gray-500" size={24} />} onClick={() => onChange('system')} />
      </div>
    </BottomSheet>
  )
}

export function NotificationsModal({ notifications, onClose, onToggle }: {
  notifications: boolean
  onClose: () => void
  onToggle: () => void
}) {
  return (
    <BottomSheet title="Уведомления" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-4 py-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Push-уведомления</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Статус заказов, акции</p>
          </div>
          <button
            onClick={onToggle}
            className={`w-14 h-8 rounded-full transition-colors relative ${notifications ? 'bg-[#f77430]' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${notifications ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
        <p className="text-sm text-gray-500 text-center">
          Мы будем отправлять только важные уведомления о ваших заказах и специальных предложениях
        </p>
      </div>
    </BottomSheet>
  )
}

function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-2">
            <X className="text-gray-400" size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function LanguageOption({ active, flag, label, onClick }: {
  active: boolean
  flag: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${active ? 'bg-orange-50 dark:bg-[#f77430]/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{flag}</span>
        <span className="font-medium text-gray-900 dark:text-white">{label}</span>
      </div>
      {active && <Check className="text-[#f77430]" size={20} />}
    </button>
  )
}

function ThemeOption({ active, icon, label, onClick }: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors ${active ? 'bg-orange-50 dark:bg-[#f77430]/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-medium text-gray-900 dark:text-white">{label}</span>
      </div>
      {active && <Check className="text-[#f77430]" size={20} />}
    </button>
  )
}
