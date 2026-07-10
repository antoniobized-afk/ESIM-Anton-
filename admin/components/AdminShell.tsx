'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Link2,
  Package,
  Settings as SettingsIcon,
  ShoppingBag,
  Ticket,
  Users as UsersIcon,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import AuthGuard from '@/components/AuthGuard'
import Button from '@/components/ui/Button'

const navigation = [
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/orders', label: 'Заказы', icon: Package },
  { href: '/users', label: 'Пользователи', icon: UsersIcon },
  { href: '/products', label: 'Продукты', icon: ShoppingBag },
  { href: '/promo', label: 'Промокоды', icon: Ticket },
  { href: '/referral-links', label: 'Партнёрские ссылки', icon: Link2 },
  { href: '/payments', label: 'Платежи', icon: CreditCard },
  { href: '/analytics', label: 'Источники трафика', icon: BarChart3 },
  { href: '/settings', label: 'Настройки', icon: SettingsIcon },
]

export default function AdminShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.focus()
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const schedulePrefetch = () => {
      navigation.forEach((item) => {
        if (item.href !== pathname) {
          router.prefetch(item.href)
        }
      })
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(schedulePrefetch)
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(schedulePrefetch, 0)
    return () => globalThis.clearTimeout(timeoutId)
  }, [pathname, router])

  return (
    <AuthGuard>
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-[1800px]">
          <header className="mb-8 animate-fade-in">
            <div className="glass-card p-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Mojo Mobile Admin
                </h1>
                <p className="mt-1 text-slate-600">Управление сервисом Mojo mobile</p>
              </div>
              <Button variant="secondary" onClick={logout}>
                Выйти
              </Button>
            </div>
          </header>

          <nav className="mb-8 animate-slide-up">
            <div className="glass-card p-2">
              <div className="flex gap-2 overflow-x-auto">
                {navigation.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => router.prefetch(item.href)}
                      className={[
                        'flex items-center gap-2 whitespace-nowrap rounded-xl px-6 py-3 font-medium transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                          : 'text-slate-700 hover:bg-white/50',
                      ].join(' ')}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </nav>

          <main
            ref={mainRef}
            tabIndex={-1}
            className="animate-slide-up outline-none"
            style={{ animationDelay: '0.1s' }}
          >
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
