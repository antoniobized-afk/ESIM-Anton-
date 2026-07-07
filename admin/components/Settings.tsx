'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Save, Plus, Edit2, Trash2, DollarSign, RefreshCw, Activity } from 'lucide-react'
import { systemSettingsApi, loyaltyApi, productsApi, trafficMonitorApi } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/auth'
import Button from '@/components/ui/Button'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/Table'
import { useToast } from '@/components/ui/ToastProvider'
import { getErrorMessage } from '@/lib/errors'
import type {
  EditableLoyaltyLevel,
  LoyaltyLevel,
  PricingSettings,
  ReferralSettings,
} from '@/lib/types'

export default function Settings() {
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: 'pricing' | 'referrals' | 'loyalty' | 'monitoring' =
    rawTab === 'pricing' || rawTab === 'referrals' || rawTab === 'loyalty' || rawTab === 'monitoring'
      ? rawTab
      : 'pricing'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [repricing, setRepricing] = useState(false)
  const [updatingRate, setUpdatingRate] = useState(false)
  const [autoUpdateRate, setAutoUpdateRate] = useState(false)
  
  // Мониторинг
  const [triggeringTraffic, setTriggeringTraffic] = useState(false)
  const [triggeringExpiry, setTriggeringExpiry] = useState(false)

  // Настройки ценообразования
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>({
    exchangeRate: 95,
    defaultMarkupPercent: 30,
  })
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null)

  // Реферальная программа
  const [referralSettings, setReferralSettings] = useState<ReferralSettings>({
    bonusPercent: 5,
    minPayout: 500,
    enabled: true,
  })

  // Уровни лояльности
  const [loyaltyLevels, setLoyaltyLevels] = useState<LoyaltyLevel[]>([])
  const [editingLevel, setEditingLevel] = useState<EditableLoyaltyLevel | null>(null)
  const requestIdRef = useRef(0)
  const activeTabRef = useRef(activeTab)

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    if (searchParams.get('tab') === activeTab) return
    router.replace(`${pathname}?tab=${activeTab}`)
  }, [activeTab, pathname, router, searchParams])

  useEffect(() => {
    void loadData(activeTab)
  }, [activeTab])

  const loadData = async (targetTab: 'pricing' | 'referrals' | 'loyalty' | 'monitoring') => {
    const nextRequestId = requestIdRef.current + 1
    requestIdRef.current = nextRequestId

    try {
      setLoading(true)
      setError(null)

      if (targetTab === 'pricing') {
        const [pricingResponse, rateInfoResponse] = await Promise.all([
          systemSettingsApi.getPricingSettings(),
          systemSettingsApi.getExchangeRateInfo(),
        ])
        if (nextRequestId !== requestIdRef.current || targetTab !== activeTabRef.current) return
        if (pricingResponse.data) {
          setPricingSettings(pricingResponse.data)
        }
        if (rateInfoResponse.data?.updatedAt) {
          setRateUpdatedAt(rateInfoResponse.data.updatedAt)
        }
        setAutoUpdateRate(Boolean(rateInfoResponse.data?.autoUpdate))
      } else if (targetTab === 'referrals') {
        const response = await systemSettingsApi.getReferralSettings()
        if (nextRequestId !== requestIdRef.current || targetTab !== activeTabRef.current) return
        if (response.data) {
          setReferralSettings(response.data)
        }
      } else if (targetTab === 'loyalty') {
        const response = await loyaltyApi.getLevels()
        if (nextRequestId !== requestIdRef.current || targetTab !== activeTabRef.current) return
        if (response.data) {
          setLoyaltyLevels(response.data)
        }
      } else if (targetTab === 'monitoring') {
        // Нет данных для загрузки, просто сброс загрузки
      }
    } catch (error) {
      if (isUnauthorizedError(error)) return
      console.error('Ошибка загрузки настроек:', error)
      if (targetTab === activeTabRef.current) {
        setError('Не удалось загрузить данные текущей вкладки')
      }
    } finally {
      if (targetTab === activeTabRef.current) {
        setLoading(false)
      }
    }
  }

  const setActiveTabInUrl = (tab: 'pricing' | 'referrals' | 'loyalty' | 'monitoring') => {
    router.replace(`${pathname}?tab=${tab}`)
  }

  const handleSavePricingSettings = async () => {
    try {
      await systemSettingsApi.updatePricingSettings(pricingSettings)
      toast.success('Настройки ценообразования сохранены')
    } catch (error) {
      console.error('Ошибка сохранения:', error)
      toast.error('Ошибка сохранения настроек')
    }
  }

  const handleSyncProducts = async () => {
    try {
      setSyncing(true)
      const response = await productsApi.sync()
      const message = response.data.message || 'Синхронизация завершена'
      if (!response.data.success || response.data.errors > 0 || (response.data.providerErrors ?? 0) > 0) {
        toast.error(message)
      } else {
        toast.success(message)
      }
    } catch (error: unknown) {
      console.error('Ошибка синхронизации:', error)
      toast.error(getErrorMessage(error, 'Ошибка синхронизации'))
    } finally {
      setSyncing(false)
    }
  }

  const handleRepriceProducts = async () => {
    try {
      setRepricing(true)
      const response = await productsApi.repriceAll()
      toast.success(response.data.message || 'Пересчет цен завершен')
    } catch (error: unknown) {
      console.error('Ошибка пересчета цен:', error)
      toast.error(getErrorMessage(error, 'Ошибка пересчета цен'))
    } finally {
      setRepricing(false)
    }
  }

  const handleUpdateRateFromCBR = async () => {
    try {
      setUpdatingRate(true)
      const response = await systemSettingsApi.updateExchangeRateFromCBR()
      if (response.data.success) {
        setPricingSettings(prev => ({ ...prev, exchangeRate: response.data.rate }))
        setRateUpdatedAt(new Date().toISOString())
        toast.success(`Курс обновлен: ${response.data.rate}₽ за $1 (ЦБ РФ)`)
      } else {
        toast.error('Не удалось получить курс с ЦБ РФ')
      }
    } catch (error: unknown) {
      console.error('Ошибка обновления курса:', error)
      toast.error(getErrorMessage(error, 'Ошибка обновления курса'))
    } finally {
      setUpdatingRate(false)
    }
  }

  const handleToggleAutoUpdateRate = async (enabled: boolean) => {
    try {
      setAutoUpdateRate(enabled)
      const response = await systemSettingsApi.setExchangeRateAutoUpdate(enabled)
      toast.success(response.data.message || 'Настройка автообновления сохранена')
    } catch (error: unknown) {
      console.error('Ошибка переключения автообновления курса:', error)
      setAutoUpdateRate(!enabled)
      toast.error(getErrorMessage(error, 'Ошибка переключения автообновления'))
    }
  }

  const handleSaveReferralSettings = async () => {
    try {
      await systemSettingsApi.updateReferralSettings(referralSettings)
      toast.success('Настройки реферальной программы сохранены')
    } catch (error) {
      console.error('Ошибка сохранения:', error)
      toast.error('Ошибка сохранения настроек')
    }
  }

  const handleSaveLoyaltyLevel = async () => {
    if (!editingLevel) return

    const payload = {
      name: editingLevel.name.trim(),
      minSpent: Number(editingLevel.minSpent),
      cashbackPercent: Number(editingLevel.cashbackPercent),
      discount: Number(editingLevel.discount),
    }

    try {
      if (editingLevel.id) {
        await loyaltyApi.updateLevel(editingLevel.id, payload)
        toast.success('Уровень лояльности обновлен')
      } else {
        await loyaltyApi.createLevel(payload)
        toast.success('Уровень лояльности создан')
      }
      
      setEditingLevel(null)
      loadData(activeTab)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Ошибка сохранения уровня'))
    }
  }

  const handleDeleteLevel = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Удаление уровня',
      description: 'Удалить этот уровень?',
      confirmLabel: 'Удалить',
      variant: 'destructive',
    })
    if (!confirmed) return
    
    try {
      await loyaltyApi.deleteLevel(id)
      toast.success('Уровень удален')
      loadData(activeTab)
    } catch (error) {
      console.error('Ошибка удаления:', error)
      toast.error('Ошибка удаления уровня')
    }
  }

  const handleTriggerTraffic = async () => {
    try {
      setTriggeringTraffic(true)
      const res = await trafficMonitorApi.triggerTraffic()
      toast.success(res.data.message)
    } catch (error) {
      console.error('Ошибка запуска:', error)
      toast.error(getErrorMessage(error, 'Ошибка запуска задачи'))
    } finally {
      setTriggeringTraffic(false)
    }
  }

  const handleTriggerExpiry = async () => {
    try {
      setTriggeringExpiry(true)
      const res = await trafficMonitorApi.triggerExpiry()
      toast.success(res.data.message)
    } catch (error) {
      console.error('Ошибка запуска:', error)
      toast.error(getErrorMessage(error, 'Ошибка запуска задачи'))
    } finally {
      setTriggeringExpiry(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-8">
        <Spinner centered />
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card glass-card--static p-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Не удалось загрузить настройки</h2>
        <p className="mt-2 text-slate-600">{error}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={() => loadData(activeTab)}>Повторить</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="glass-card p-2">
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => setActiveTabInUrl('pricing')}
            variant="ghost"
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-medium
              transition-all duration-200
              ${
                activeTab === 'pricing'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                  : 'hover:bg-white/50 text-slate-700'
              }
            `}
          >
            💰 Ценообразование
          </Button>
          <Button
            onClick={() => setActiveTabInUrl('referrals')}
            variant="ghost"
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-medium
              transition-all duration-200
              ${
                activeTab === 'referrals'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                  : 'hover:bg-white/50 text-slate-700'
              }
            `}
          >
            🎁 Реферальная программа
          </Button>
          <Button
            onClick={() => setActiveTabInUrl('loyalty')}
            variant="ghost"
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-medium
              transition-all duration-200
              ${
                activeTab === 'loyalty'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                  : 'hover:bg-white/50 text-slate-700'
              }
            `}
          >
            🏆 Система лояльности
          </Button>
          <Button
            onClick={() => setActiveTabInUrl('monitoring')}
            variant="ghost"
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-medium
              transition-all duration-200
              ${
                activeTab === 'monitoring'
                  ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                  : 'hover:bg-white/50 text-slate-700'
              }
            `}
          >
            <Activity className="w-5 h-5" />
            Мониторинг
          </Button>
        </div>
      </div>

      {/* Ценообразование */}
      {activeTab === 'pricing' && (
        <div className="glass-card p-8">
          <h2 className="text-2xl font-bold mb-6">Настройки ценообразования</h2>
          
          <div className="space-y-6 max-w-2xl">
            {/* Курс доллара */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Курс USD/RUB
              </label>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="number"
                    value={pricingSettings.exchangeRate}
                    onChange={(e) => setPricingSettings({ ...pricingSettings, exchangeRate: +e.target.value })}
                    className="w-40 pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-xl font-bold"
                    min="1"
                    max="500"
                    step="0.5"
                  />
                </div>
                <span className="text-lg font-bold text-slate-700">₽ за $1</span>
                <Button
                  onClick={handleUpdateRateFromCBR}
                  disabled={updatingRate}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg hover:shadow-xl"
                >
                  <RefreshCw className={`w-4 h-4 ${updatingRate ? 'animate-spin' : ''}`} />
                  {updatingRate ? 'Загрузка...' : 'Обновить с ЦБ РФ'}
                </Button>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Используется для пересчета цен от поставщика (в $) в рубли
              </p>
              {rateUpdatedAt && (
                <p className="text-xs text-green-600 mt-1">
                  ✅ Последнее обновление: {new Date(rateUpdatedAt).toLocaleString('ru-RU')}
                </p>
              )}
              <label className="flex items-center gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoUpdateRate}
                  onChange={(e) => handleToggleAutoUpdateRate(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm font-medium text-slate-700">
                  Автоматически обновлять курс раз в сутки в 9:00
                </span>
              </label>
            </div>

            {/* Наценка по умолчанию */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Наценка по умолчанию при синхронизации
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={pricingSettings.defaultMarkupPercent}
                  onChange={(e) => setPricingSettings({ ...pricingSettings, defaultMarkupPercent: +e.target.value })}
                  className="w-32 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-xl font-bold text-center"
                  min="0"
                  max="500"
                  step="5"
                />
                <span className="text-lg font-bold text-slate-700">%</span>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {[10, 20, 30, 50, 75, 100].map((val) => (
                  <Button
                    key={val}
                    onClick={() => setPricingSettings({ ...pricingSettings, defaultMarkupPercent: val })}
                    variant="secondary"
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      pricingSettings.defaultMarkupPercent === val 
                        ? 'bg-green-500 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    +{val}%
                  </Button>
                ))}
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Применяется для новых тарифов и при полном пересчете цен
              </p>
            </div>

            {/* Пример расчета */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h4 className="font-semibold text-slate-700 mb-2">📊 Пример расчета цены:</h4>
              <div className="text-sm text-slate-600 space-y-1">
                <p>Цена у поставщика: <strong>$5.00</strong></p>
                <p>+ Наценка {pricingSettings.defaultMarkupPercent}%: <strong>${(5 * (1 + pricingSettings.defaultMarkupPercent / 100)).toFixed(2)}</strong></p>
                <p>× Курс {pricingSettings.exchangeRate}₽/$: <strong className="text-green-600">₽{Math.round(5 * (1 + pricingSettings.defaultMarkupPercent / 100) * pricingSettings.exchangeRate)}</strong></p>
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3 pt-4 flex-wrap">
              <Button
                onClick={handleSavePricingSettings}
                className="bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg hover:shadow-xl"
              >
                <Save className="w-5 h-5" />
                Сохранить настройки
              </Button>
              <Button
                onClick={handleRepriceProducts}
                disabled={repricing}
                className="bg-gradient-to-r from-blue-500 to-cyan-500 shadow-lg hover:shadow-xl"
              >
                <RefreshCw className={`w-5 h-5 ${repricing ? 'animate-spin' : ''}`} />
                {repricing ? 'Пересчет...' : 'Применить к текущим товарам'}
              </Button>
              <Button
                onClick={handleSyncProducts}
                disabled={syncing}
                className="bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg hover:shadow-xl"
              >
                <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Синхронизация...' : 'Синхронизировать тарифы'}
              </Button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Важно:</strong> После изменения курса или наценки нажмите &quot;Применить к текущим товарам&quot;, чтобы пересчитать уже существующие цены. Кнопка синхронизации только подтягивает пакеты от провайдера.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Реферальная программа */}
      {activeTab === 'referrals' && (
        <div className="glass-card p-8">
          <h2 className="text-2xl font-bold mb-6">Настройки реферальной программы</h2>
          
          <div className="space-y-6 max-w-2xl">
            {/* Включить/выключить */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={referralSettings.enabled}
                  onChange={(e) => setReferralSettings({ ...referralSettings, enabled: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="font-medium text-lg">Включить реферальную программу</span>
              </label>
            </div>

            {/* Процент бонуса */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Процент бонуса рефереру (от покупки реферала)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={referralSettings.bonusPercent}
                  onChange={(e) => setReferralSettings({ ...referralSettings, bonusPercent: +e.target.value })}
                  className="w-32 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  min="0"
                  max="100"
                  disabled={!referralSettings.enabled}
                />
                <span className="text-lg font-bold text-slate-700">%</span>
                <div className="text-sm text-slate-500">
                  Пример: реферал купил eSIM за ₽1,000 → реферер получит ₽{(1000 * referralSettings.bonusPercent / 100).toFixed(0)}
                </div>
              </div>
            </div>

            {/* Минимальная сумма вывода */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Минимальная сумма для использования бонусов
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={referralSettings.minPayout}
                  onChange={(e) => setReferralSettings({ ...referralSettings, minPayout: +e.target.value })}
                  className="w-32 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  min="0"
                  step="100"
                  disabled={!referralSettings.enabled}
                />
                <span className="text-lg font-bold text-slate-700">₽</span>
                <div className="text-sm text-slate-500">
                  Пользователь сможет использовать бонусы после накопления этой суммы
                </div>
              </div>
            </div>

            {/* Кнопка сохранить */}
            <div className="pt-4">
              <Button
                onClick={handleSaveReferralSettings}
                className="bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg hover:shadow-xl"
              >
                <Save className="w-5 h-5" />
                Сохранить настройки
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Система лояльности */}
      {activeTab === 'loyalty' && (
        <div className="space-y-6">
          {/* Кнопка добавить */}
          <div className="glass-card p-6">
            <Button
              onClick={() => setEditingLevel({ name: '', minSpent: 0, cashbackPercent: 0, discount: 0 })}
              className="bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg hover:shadow-xl"
            >
              <Plus className="w-5 h-5" />
              Добавить уровень
            </Button>
          </div>

          {/* Таблица уровней */}
          <div className="glass-card glass-card--static p-6">
            <h2 className="text-2xl font-bold mb-6">Уровни лояльности</h2>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow className="border-b border-slate-200">
                    <TableHeaderCell>Название</TableHeaderCell>
                    <TableHeaderCell>Минимальная сумма</TableHeaderCell>
                    <TableHeaderCell>Кэшбэк (%)</TableHeaderCell>
                    <TableHeaderCell>Скидка (%)</TableHeaderCell>
                    <TableHeaderCell>Действия</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loyaltyLevels.map((level) => (
                    <TableRow
                      key={level.id}
                      className="border-b border-slate-100 hover:bg-white/50 transition-colors"
                    >
                      <TableCell className="font-medium">{level.name}</TableCell>
                      <TableCell>₽{Number(level.minSpent).toLocaleString()}</TableCell>
                      <TableCell>{Number(level.cashbackPercent)}%</TableCell>
                      <TableCell>{Number(level.discount)}%</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" iconOnly aria-label="Редактировать уровень" onClick={() => setEditingLevel(level)} className="hover:bg-blue-100">
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" iconOnly aria-label="Удалить уровень" onClick={() => handleDeleteLevel(level.id)} className="hover:bg-red-100">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Форма редактирования */}
          {editingLevel && (
            <Modal
              title={editingLevel.id ? 'Редактировать уровень' : 'Создать уровень'}
              onClose={() => setEditingLevel(null)}
              contentClassName="max-w-2xl"
            >
                <div className="space-y-4">
                  {/* Название */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Название уровня
                    </label>
                    <input
                      type="text"
                      value={editingLevel.name}
                      onChange={(e) => setEditingLevel({ ...editingLevel, name: e.target.value })}
                      placeholder="Например: Золото"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    />
                  </div>

                  {/* Минимальная сумма */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Минимальная сумма покупок (₽)
                    </label>
                    <input
                      type="number"
                      value={editingLevel.minSpent}
                      onChange={(e) => setEditingLevel({ ...editingLevel, minSpent: +e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                      min="0"
                      step="1000"
                    />
                    <p className="text-sm text-slate-500 mt-1">
                      Пользователь получит этот уровень после покупок на эту сумму
                    </p>
                  </div>

                  {/* Кэшбэк */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Процент кэшбэка (%)
                    </label>
                    <input
                      type="number"
                      value={editingLevel.cashbackPercent}
                      onChange={(e) => setEditingLevel({ ...editingLevel, cashbackPercent: +e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                      min="0"
                      max="100"
                      step="0.5"
                    />
                    <p className="text-sm text-slate-500 mt-1">
                      Например: 5% → при покупке на ₽1,000 вернется ₽50 бонусов
                    </p>
                  </div>

                  {/* Скидка */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Скидка на покупки (%)
                    </label>
                    <input
                      type="number"
                      value={editingLevel.discount}
                      onChange={(e) => setEditingLevel({ ...editingLevel, discount: +e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                      min="0"
                      max="100"
                      step="1"
                    />
                    <p className="text-sm text-slate-500 mt-1">
                      Например: 10% → товар за ₽1,000 будет стоить ₽900
                    </p>
                  </div>

                  {/* Кнопки */}
                  <div className="flex gap-3 pt-4">
                    <Button onClick={handleSaveLoyaltyLevel} className="flex-1">
                      <Save className="w-5 h-5" />
                      Сохранить
                    </Button>
                    <Button onClick={() => setEditingLevel(null)} variant="secondary">
                      Отмена
                    </Button>
                  </div>
                </div>
            </Modal>
          )}
        </div>
      )}

      {/* Мониторинг и Задачи */}
      {activeTab === 'monitoring' && (
        <div className="glass-card p-8">
          <h2 className="text-2xl font-bold mb-6">Фоновые задачи и Мониторинг</h2>
          <div className="space-y-6 max-w-2xl">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Проверка остатков трафика</h3>
              <p className="text-sm text-slate-600 mb-4">
                Запускает опрос провайдера по активным eSIM для обновления остатка трафика. 
                В норме эта задача выполняется автоматически по крону каждый час.
              </p>
              <Button
                onClick={handleTriggerTraffic}
                disabled={triggeringTraffic}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`w-4 h-4 ${triggeringTraffic ? 'animate-spin' : ''}`} />
                {triggeringTraffic ? 'Запуск...' : 'Принудительная проверка трафика'}
              </Button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Мониторинг истечения сроков</h3>
              <p className="text-sm text-slate-600 mb-4">
                Запускает проверку eSIM, срок действия которых скоро истекает (через 3, 2 или 1 день).
                Пользователям будут разосланы уведомления в Telegram. В норме выполняется по крону каждый час.
              </p>
              <Button
                onClick={handleTriggerExpiry}
                disabled={triggeringExpiry}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <RefreshCw className={`w-4 h-4 ${triggeringExpiry ? 'animate-spin' : ''}`} />
                {triggeringExpiry ? 'Запуск...' : 'Принудительная проверка сроков'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
