'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ordersApi, userApi } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { useAuth } from '@/components/AuthProvider'

const LAST_NOTIFIED_ORDER_KEY = 'last_notified_order_id'

export default function TelegramRedirectHandler() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const { user, isBootstrapped, isTelegram, isTelegramReady } = useAuth()

  useEffect(() => {
    if (checked) return
    if (!isBootstrapped) return
    if (isTelegram && !isTelegramReady) return

    const checkForNewOrders = async () => {
      const tg = (window as any).Telegram?.WebApp
      if (!tg) {
        setChecked(true)
        return
      }

      // Expand app
      tg.expand()

      // Проверяем параметр startapp для редиректа
      const startParam = tg.initDataUnsafe?.start_param
      
      if (startParam === 'my-esim') {
        router.push('/my-esim')
        setChecked(true)
        return
      }

      try {
        const token = getToken()
        if (!token) {
          setChecked(true)
          return
        }

        const currentUser = user ?? await userApi.getMe()
        
        // Проверяем новые заказы
        const { hasNewOrders, latestOrder } = await ordersApi.checkNew(currentUser.id)
        
        if (hasNewOrders && latestOrder) {
          // Проверяем, показывали ли мы уже уведомление для этого заказа
          const lastNotifiedOrderId = localStorage.getItem(LAST_NOTIFIED_ORDER_KEY)
          
          if (lastNotifiedOrderId !== latestOrder.id) {
            // Сохраняем ID заказа, чтобы не показывать уведомление повторно
            localStorage.setItem(LAST_NOTIFIED_ORDER_KEY, latestOrder.id)
            
            // Показываем уведомление
            const isReady = latestOrder.status === 'COMPLETED'
            const message = isReady
              ? `✅ Заказ готов!\n\neSIM для ${latestOrder.product.country}\n${latestOrder.product.dataAmount} доступна в приложении`
              : `✅ Оплата принята!\n\nЗаказ для ${latestOrder.product.country} сейчас обрабатывается. Статус можно посмотреть в приложении.`

            if (tg.showAlert) {
              tg.showAlert(message, () => {
                router.push(isReady ? '/my-esim' : `/order/${latestOrder.id}`)
              })
            } else {
              alert(message)
              router.push(isReady ? '/my-esim' : `/order/${latestOrder.id}`)
            }
          }
        }
      } catch (error) {
        console.error('Telegram order check failed:', error)
      } finally {
        setChecked(true)
      }
    }

    void checkForNewOrders()
  }, [router, checked, user, isBootstrapped, isTelegram, isTelegramReady])

  return null
}
