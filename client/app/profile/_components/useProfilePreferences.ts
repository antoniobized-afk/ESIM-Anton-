'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import type { Language, ThemePreference } from './types'

export function useProfilePreferences() {
  const { theme, setTheme } = useTheme()
  const [language, setLanguage] = useState<Language>('ru')
  const [notifications, setNotifications] = useState(true)
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const [showNotificationsModal, setShowNotificationsModal] = useState(false)

  useEffect(() => {
    const savedLang = localStorage.getItem('language') as Language
    const savedNotifications = localStorage.getItem('notifications')

    if (savedLang) setLanguage(savedLang)
    if (savedNotifications !== null) setNotifications(savedNotifications === 'true')
  }, [])

  const changeLanguage = useCallback((lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
    setShowLanguageModal(false)
  }, [])

  const changeTheme = useCallback((newTheme: ThemePreference) => {
    setTheme(newTheme)
    setShowThemeModal(false)
  }, [setTheme])

  const toggleNotifications = useCallback(() => {
    setNotifications((current) => {
      const newValue = !current
      localStorage.setItem('notifications', String(newValue))
      return newValue
    })
  }, [])

  return {
    theme,
    language,
    notifications,
    showThemeModal,
    showLanguageModal,
    showNotificationsModal,
    setShowThemeModal,
    setShowLanguageModal,
    setShowNotificationsModal,
    changeLanguage,
    changeTheme,
    toggleNotifications,
  }
}
