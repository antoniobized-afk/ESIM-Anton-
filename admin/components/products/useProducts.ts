'use client'

import { useCallback, useEffect, useState } from 'react'
import { productsApi, systemSettingsApi } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/auth'
import type { AdminProduct, EditableProduct } from '@/lib/types'
import { getErrorMessage } from '@/lib/errors'
import { useToast } from '@/components/ui/ToastProvider'
import { createEmptyProduct, getMarkupPercent, getProviderPriceUSD } from './products.helpers'
import { useProductFilters } from './useProductFilters'
export type TariffFilter = 'all' | 'standard' | 'unlimited'
export type DataUnitFilter = 'all' | 'MB' | 'GB'
export function useProducts() {
  const toast = useToast()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [countries, setCountries] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<EditableProduct | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkBadgeModal, setShowBulkBadgeModal] = useState(false)
  const [showBulkMarkupModal, setShowBulkMarkupModal] = useState(false)
  const [bulkBadge, setBulkBadge] = useState('')
  const [bulkBadgeColor, setBulkBadgeColor] = useState('')
  const [bulkMarkup, setBulkMarkup] = useState(30)
  const [exchangeRate, setExchangeRate] = useState(95)
  const [editingProviderPriceUsd, setEditingProviderPriceUsd] = useState('0.00')
  const [editingMarkupPercent, setEditingMarkupPercent] = useState('0')
  const [viewingProduct, setViewingProduct] = useState<AdminProduct | null>(null)
  const filters = useProductFilters(products)
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const durationDays = Number(filters.appliedDurationDaysQuery)
      const response = await productsApi.getAll({
        country: filters.selectedCountry || undefined,
        isActive: filters.showActiveOnly ?? undefined,
        search: filters.appliedSearchQuery.trim() || undefined,
        tariffType: filters.tariffType === 'all' ? undefined : filters.tariffType,
        dataAmount: filters.appliedDataAmountQuery.trim() || undefined,
        dataUnit: filters.dataUnit === 'all' ? undefined : filters.dataUnit,
        durationDays: Number.isInteger(durationDays) && durationDays > 0 ? durationDays : undefined,
        page: filters.page,
        limit: 50,
      })
      setProducts(response.data.data)
      setTotalProducts(response.data.meta.total)
      setTotalPages(response.data.meta.totalPages)
      setLoadedOnce(true)
    } catch (error) {
      if (isUnauthorizedError(error)) return
      setError(`Ошибка: ${getErrorMessage(error, 'Ошибка загрузки')}`)
      console.error('Ошибка загрузки продуктов:', error)
    } finally {
      setLoading(false)
    }
  }, [
    filters.appliedDataAmountQuery,
    filters.appliedDurationDaysQuery,
    filters.appliedSearchQuery,
    filters.dataUnit,
    filters.page,
    filters.selectedCountry,
    filters.showActiveOnly,
    filters.tariffType,
  ])
  const loadCountries = async () => {
    try {
      const response = await productsApi.getCountries()
      setCountries(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      if (isUnauthorizedError(error)) return
      console.error('Ошибка загрузки стран:', error)
    }
  }
  const loadPricingSettings = async () => {
    try {
      const response = await systemSettingsApi.getPricingSettings()
      if (response.data?.exchangeRate) setExchangeRate(Number(response.data.exchangeRate))
    } catch (error) {
      if (isUnauthorizedError(error)) return
      console.error('Ошибка загрузки настроек ценообразования:', error)
    }
  }
  useEffect(() => {
    void loadCountries()
    void loadPricingSettings()
  }, [])
  useEffect(() => {
    void loadProducts()
  }, [loadProducts])
  const closeEditor = () => {
    setEditingProduct(null)
    setIsCreating(false)
    setEditingProviderPriceUsd('0.00')
    setEditingMarkupPercent('0')
  }
  const handleCreate = () => {
    setEditingProduct(createEmptyProduct())
    setEditingProviderPriceUsd('0.00')
    setEditingMarkupPercent('0')
    setIsCreating(true)
  }
  const handleEdit = (product: AdminProduct) => {
    setEditingProduct({ ...product })
    setEditingProviderPriceUsd(getProviderPriceUSD(product.providerPrice).toFixed(2))
    setEditingMarkupPercent(Math.round(getMarkupPercent(product.providerPrice, product.ourPrice, exchangeRate)).toString())
    setIsCreating(false)
  }
  const handleSync = async () => {
    try {
      setSyncing(true)
      const response = await productsApi.sync()
      toast.success(response.data.message || 'Синхронизация завершена')
      await Promise.all([loadProducts(), loadCountries()])
    } catch (error) {
      toast.error(`Ошибка синхронизации: ${getErrorMessage(error, 'Неизвестная ошибка')}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleSave = async () => {
    if (!editingProduct) return
    try {
      if (isCreating) {
        await productsApi.create(editingProduct)
        toast.success('Продукт создан')
      } else {
        if (!editingProduct.id) throw new Error('Не найден идентификатор продукта')
        await productsApi.update(editingProduct.id, editingProduct)
        toast.success('Продукт обновлен')
      }
      closeEditor()
      await loadProducts()
    } catch (error) {
      console.error('Ошибка сохранения:', error)
      toast.error('Ошибка сохранения продукта')
    }
  }

  const handleToggleActive = async (product: AdminProduct) => {
    try {
      await productsApi.update(product.id, { isActive: !product.isActive })
      await loadProducts()
    } catch (error) {
      console.error('Ошибка обновления статуса:', error)
    }
  }

  const resetSelection = () => setSelectedIds(new Set())
  useEffect(() => {
    resetSelection()
  }, [
    filters.appliedDataAmountQuery,
    filters.appliedDurationDaysQuery,
    filters.appliedSearchQuery,
    filters.dataUnit,
    filters.page,
    filters.selectedCountry,
    filters.showActiveOnly,
    filters.tariffType,
  ])

  const handleSelectAll = () => {
    if (selectedIds.size === products.length) return resetSelection()
    setSelectedIds(new Set(products.map((product) => product.id)))
  }

  const handleSelectOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return {
    products,
    totalProducts,
    totalPages,
    page: filters.page,
    countries,
    loading,
    loadedOnce,
    syncing,
    error,
    editingProduct,
    isCreating,
    selectedCountry: filters.selectedCountry,
    showActiveOnly: filters.showActiveOnly,
    tariffType: filters.tariffType,
    dataAmountQuery: filters.dataAmountQuery,
    dataUnit: filters.dataUnit,
    durationDaysQuery: filters.durationDaysQuery,
    searchQuery: filters.searchQuery,
    selectedIds,
    showBulkBadgeModal,
    showBulkMarkupModal,
    bulkBadge,
    bulkBadgeColor,
    bulkMarkup,
    exchangeRate,
    editingProviderPriceUsd,
    editingMarkupPercent,
    viewingProduct,
    filteredProducts: filters.filteredProducts,
    getProviderPriceUSD,
    getMarkupPercent: (providerPrice: number | string, ourPrice: number | string) =>
      getMarkupPercent(providerPrice, ourPrice, exchangeRate),
    setSelectedCountry: filters.setSelectedCountry,
    setShowActiveOnly: filters.setShowActiveOnly,
    setTariffType: filters.setTariffType,
    setDataAmountQuery: filters.setDataAmountQuery,
    setDataUnit: filters.setDataUnit,
    setDurationDaysQuery: filters.setDurationDaysQuery,
    setPage: filters.setPage,
    setSearchQuery: filters.setSearchQuery,
    setShowBulkBadgeModal,
    setShowBulkMarkupModal,
    setBulkBadge,
    setBulkBadgeColor,
    setBulkMarkup,
    setEditingProduct,
    setEditingProviderPriceUsd,
    setEditingMarkupPercent,
    setViewingProduct,
    loadProducts,
    handleSync,
    handleCreate,
    handleEdit,
    handleSave,
    handleToggleActive,
    handleSelectAll,
    handleSelectOne,
    closeEditor,
    clearFilters: filters.clearFilters,
    clearSelection: resetSelection,
  }
}

export type UseProductsResult = ReturnType<typeof useProducts>
