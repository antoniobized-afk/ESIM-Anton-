'use client'

import Link from 'next/link'
import { ChevronRight } from '@/components/icons'
import type { ComponentType, ReactNode } from 'react'

type ProfileIcon = ComponentType<{ className?: string; size?: string | number }>

interface ProfileSectionProps {
  title: string
  children: ReactNode
}

interface MenuItemProps {
  icon: ProfileIcon
  label: string
  href?: string
  onClick?: () => void
  value?: ReactNode
  iconClassName?: string
  iconWrapClassName?: string
}

export function ProfileSection({ title, children }: ProfileSectionProps) {
  return (
    <section className="mb-6">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 px-1">{title}</p>
      <div className="card-neutral overflow-hidden">{children}</div>
    </section>
  )
}

export function SectionDivider() {
  return <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />
}

export function MenuItem({
  icon: Icon,
  label,
  href,
  onClick,
  value,
  iconClassName = 'text-[#f77430]',
  iconWrapClassName = 'bg-orange-100 dark:bg-orange-900/30',
}: MenuItemProps) {
  const content = (
    <>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconWrapClassName}`}>
        <Icon className={iconClassName} size={20} />
      </div>
      <span className="flex-1 font-medium text-gray-900 dark:text-white text-left">{label}</span>
      {value}
      <ChevronRight className="text-gray-400" size={20} />
    </>
  )

  if (href) {
    return (
      <Link href={href}>
        <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
          {content}
        </div>
      </Link>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      {content}
    </button>
  )
}
