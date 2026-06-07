'use client'

import { Check, ChevronRight, FileText, Gift, HelpCircle, MessageCircle, ShoppingBag, Smartphone } from '@/components/icons'
import { MenuItem, ProfileSection, SectionDivider } from './ProfileSection'

export function ProfileLinksSection() {
  return (
    <ProfileSection title="Профиль">
      <MenuItem href="/my-esim" icon={Smartphone} label="Мои eSIM" iconWrapClassName="bg-orange-100" />
      <SectionDivider />
      <MenuItem href="/orders" icon={ShoppingBag} label="Заказы" />
      <SectionDivider />
      <MenuItem href="/referrals" icon={Gift} label="Реферальная программа" />
      <SectionDivider />
      <MenuItem href="/loyalty" icon={Check} label="Система лояльности" />
    </ProfileSection>
  )
}

export function OtherLinksSection() {
  return (
    <ProfileSection title="Другое">
      <MenuItem href="/help" icon={HelpCircle} label="Помощь" iconWrapClassName="bg-orange-100" />
      <SectionDivider />
      <a href="mailto:mojomobile@yandex.ru" target="_blank" rel="noopener noreferrer">
        <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <MessageCircle className="text-[#f77430]" size={20} />
          </div>
          <span className="flex-1 font-medium text-gray-900 dark:text-white">Поддержка</span>
          <ChevronRight className="text-gray-400" size={20} />
        </div>
      </a>
      <SectionDivider />
      <MenuItem
        href="/offer"
        icon={FileText}
        label="Публичная оферта"
        iconClassName="text-gray-600 dark:text-gray-400"
        iconWrapClassName="bg-gray-100 dark:bg-gray-800"
      />
      <SectionDivider />
      <MenuItem
        href="/agreement"
        icon={FileText}
        label="Пользовательское соглашение"
        iconClassName="text-gray-600 dark:text-gray-400"
        iconWrapClassName="bg-gray-100 dark:bg-gray-800"
      />
    </ProfileSection>
  )
}
