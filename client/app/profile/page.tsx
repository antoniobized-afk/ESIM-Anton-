'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import BottomNav from '@/components/BottomNav'
import packageJson from '@/package.json'
import { BalanceCard, ProfileHeader, PromoCodeCard, ReferralBanner } from './_components/ProfileCards'
import { IdentitySection } from './_components/IdentitySection'
import {
  EmailLinkModal,
  LanguageModal,
  NotificationsModal,
  SettingsSection,
  ThemeModal,
} from './_components/SettingsAndModals'
import { OtherLinksSection, ProfileLinksSection } from './_components/StaticSections'
import { useProfileData } from './_components/useProfileData'
import { useProfileIdentities } from './_components/useProfileIdentities'
import { useProfilePreferences } from './_components/useProfilePreferences'

export default function ProfilePage() {
  const [promoCode, setPromoCode] = useState('')
  const { user, referralStats, loading } = useProfileData()
  const preferences = useProfilePreferences()
  const identities = useProfileIdentities(user)

  const applyPromoCode = () => {
    if (promoCode.trim()) {
      alert('Промокод применён!')
      setPromoCode('')
    }
  }

  const shareReferral = () => {
    if (!referralStats?.enabled || !referralStats.referralLink) {
      window.location.href = '/referrals'
      return
    }

    const shareTitle = 'Mojo mobile'
    const shareText = [
      'Подключай eSIM в Mojo mobile по моей ссылке.',
      `Реферальные бонусы по программе рекомендаций: ${referralStats.referralPercent}%.`,
      `Ссылка: ${referralStats.referralLink}`,
    ].join('\n\n')
    const tg = (window as any).Telegram?.WebApp
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(referralStats.referralLink)}&text=${encodeURIComponent(shareText)}`
      )
    } else if (navigator.share) {
      navigator.share({ title: shareTitle, text: shareText, url: referralStats.referralLink }).catch(() => { })
    } else {
      navigator.clipboard?.writeText(`${shareText}\n`)
      alert('Ссылка скопирована!')
    }
  }

  const handleLogout = async () => {
    const { isTelegramWebApp, clearToken } = await import('@/lib/auth')
    if (isTelegramWebApp()) {
      alert('В Telegram Mini App выход не требуется. Для смены аккаунта используйте другой Telegram аккаунт.')
      return
    }
    clearToken()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
        <div className="skeleton h-8 w-32 mb-6" />
        <div className="skeleton h-20 w-full rounded-2xl mb-4" />
        <div className="skeleton h-14 w-full rounded-2xl mb-4" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      <ProfileHeader onLogout={handleLogout} />
      <BalanceCard user={user} />
      <PromoCodeCard promoCode={promoCode} onPromoCodeChange={setPromoCode} onApply={applyPromoCode} />
      <ReferralBanner referralStats={referralStats} onShare={shareReferral} />
      <ProfileLinksSection />
      <IdentitySection
        identities={identities.identities}
        identitiesLoading={identities.identitiesLoading}
        identityAction={identities.identityAction}
        identityMessage={identities.identityMessage}
        linkableProviders={identities.linkableProviders}
        telegramWebAppAvailable={identities.telegramWebAppAvailable}
        onOpenEmailLink={identities.openEmailLinkModal}
        onTelegramLink={identities.handleTelegramLink}
        onOAuthLink={identities.handleOAuthLink}
        onUnlink={identities.unlinkIdentity}
      />
      <SettingsSection
        language={preferences.language}
        theme={preferences.theme}
        notifications={preferences.notifications}
        onLanguageClick={() => preferences.setShowLanguageModal(true)}
        onThemeClick={() => preferences.setShowThemeModal(true)}
        onNotificationsClick={() => preferences.setShowNotificationsModal(true)}
      />
      <OtherLinksSection />

      <p className="text-center text-gray-400 dark:text-gray-600 text-sm">
        Версия {packageJson.version}
      </p>

      {identities.showEmailLinkModal && (
        <EmailLinkModal
          step={identities.emailLinkStep}
          email={identities.emailLinkValue}
          code={identities.emailLinkCode}
          identityAction={identities.identityAction}
          onClose={() => identities.setShowEmailLinkModal(false)}
          onStepChange={identities.setEmailLinkStep}
          onEmailChange={identities.setEmailLinkValue}
          onCodeChange={identities.setEmailLinkCode}
          onSendCode={identities.sendEmailLinkCode}
          onVerify={identities.verifyEmailLink}
        />
      )}

      {preferences.showLanguageModal && (
        <LanguageModal
          language={preferences.language}
          onClose={() => preferences.setShowLanguageModal(false)}
          onChange={preferences.changeLanguage}
        />
      )}

      {preferences.showThemeModal && (
        <ThemeModal
          theme={preferences.theme}
          onClose={() => preferences.setShowThemeModal(false)}
          onChange={preferences.changeTheme}
        />
      )}

      {preferences.showNotificationsModal && (
        <NotificationsModal
          notifications={preferences.notifications}
          onClose={() => preferences.setShowNotificationsModal(false)}
          onToggle={preferences.toggleNotifications}
        />
      )}

      <BottomNav />
    </div>
  )
}
