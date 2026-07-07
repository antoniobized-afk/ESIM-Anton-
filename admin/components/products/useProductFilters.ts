'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { AdminProduct, ProductSortField } from '@/lib/types'
import { DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE, normalizeProductDataTypeSelector } from '@shared/product-data-type'
import {
  DEFAULT_PRODUCT_SORT_FIELD,
  getDefaultProductSortOrder,
  normalizeProductSortField,
  normalizeProductSortOrder,
} from '@shared/product-sorting'
import type { DataUnitFilter, ProductDataTypeFilter } from './useProducts'

function getDataUnitFilter(value: string | null): DataUnitFilter {
  const normalized = value?.toUpperCase()
  return normalized === 'MB' || normalized === 'GB' ? normalized : 'all'
}

function getProductDataTypeFilter(value: string | null): ProductDataTypeFilter {
  const normalized = normalizeProductDataTypeSelector(value)
  if (normalized === DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE) return DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE

  return normalized ? `${normalized}` : 'all'
}

function getLegacyProductDataTypeFilter(typeParam: string | null, unlimitedParam: string | null): ProductDataTypeFilter {
  if (typeParam === 'standard' || unlimitedParam === 'false') return '1'
  if (typeParam === 'unlimited' || unlimitedParam === 'true') return DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE
  return 'all'
}

const editableDataAmountPattern = /^\d*(?:[.,]\d*)?$/
const completeDataAmountPattern = /^\d+(?:[.,]\d+)?$/
const durationDaysPattern = /^[1-9]\d*$/

function normalizeDataAmountQuery(value: string) {
  const trimmed = value.trim()
  if (!completeDataAmountPattern.test(trimmed)) return ''

  const normalized = trimmed.replace(',', '.')
  return Number(normalized) > 0 ? normalized : ''
}

function normalizeDurationDaysQuery(value: string) {
  const trimmed = value.trim()
  return durationDaysPattern.test(trimmed) ? trimmed : ''
}

function isPendingDataAmountInput(value: string) {
  const trimmed = value.trim()
  return trimmed !== '' && editableDataAmountPattern.test(trimmed) && !normalizeDataAmountQuery(trimmed)
}

export function useProductFilters(products: AdminProduct[]) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const replaceWithoutScroll = useCallback((href: string) => {
    router.replace(href, { scroll: false })
  }, [router])

  const selectedCountry = searchParams.get('country') || ''
  const activeParam = searchParams.get('active')
  const showActiveOnly = activeParam === 'active' ? true : activeParam === 'inactive' ? false : null
  const dataTypeParam = searchParams.get('dataType')
  const typeParam = searchParams.get('type')
  const unlimitedParam = searchParams.get('unlimited')
  const dataType =
    getProductDataTypeFilter(dataTypeParam) !== 'all'
      ? getProductDataTypeFilter(dataTypeParam)
      : getLegacyProductDataTypeFilter(typeParam, unlimitedParam)
  const urlSearch = searchParams.get('search') || ''
  const urlDataAmount = normalizeDataAmountQuery(searchParams.get('data') || '')
  const dataUnit = getDataUnitFilter(searchParams.get('unit'))
  const urlDurationDays = normalizeDurationDaysQuery(searchParams.get('duration') || '')
  const sortBy = normalizeProductSortField(searchParams.get('sortBy'))
  const sortOrder = normalizeProductSortOrder(searchParams.get('sortOrder'), sortBy)
  const rawPage = Number(searchParams.get('page') || '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const [searchQuery, setSearchQuery] = useState(urlSearch)
  const [dataAmountQuery, setDataAmountQuery] = useState(urlDataAmount)
  const [durationDaysQuery, setDurationDaysQuery] = useState(urlDurationDays)

  useEffect(() => {
    setSearchQuery(urlSearch)
  }, [urlSearch])

  useEffect(() => {
    setDataAmountQuery(urlDataAmount)
  }, [urlDataAmount])

  useEffect(() => {
    setDurationDaysQuery(urlDurationDays)
  }, [urlDurationDays])

  useEffect(() => {
    if (isPendingDataAmountInput(dataAmountQuery)) return

    const normalized = new URLSearchParams()
    const normalizedDataAmount = normalizeDataAmountQuery(dataAmountQuery)
    const normalizedDurationDays = normalizeDurationDaysQuery(durationDaysQuery)
    if (selectedCountry) normalized.set('country', selectedCountry)
    if (showActiveOnly === true) normalized.set('active', 'active')
    if (showActiveOnly === false) normalized.set('active', 'inactive')
    if (dataType !== 'all') normalized.set('dataType', dataType)
    if (searchQuery.trim()) normalized.set('search', searchQuery.trim())
    if (normalizedDataAmount) normalized.set('data', normalizedDataAmount)
    if (dataUnit !== 'all') normalized.set('unit', dataUnit)
    if (normalizedDurationDays) normalized.set('duration', normalizedDurationDays)
    if (sortBy !== DEFAULT_PRODUCT_SORT_FIELD) normalized.set('sortBy', sortBy)
    if (sortOrder !== getDefaultProductSortOrder(sortBy)) normalized.set('sortOrder', sortOrder)
    if (
      page > 1 &&
      searchQuery.trim() === urlSearch &&
      normalizedDataAmount === urlDataAmount &&
      normalizedDurationDays === urlDurationDays
    ) {
      normalized.set('page', String(page))
    }

    if (normalized.toString() === searchParams.toString()) return

    const timeoutId = window.setTimeout(() => {
      const nextQuery = normalized.toString()
      replaceWithoutScroll(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [
    dataAmountQuery,
    dataUnit,
    durationDaysQuery,
    page,
    pathname,
    replaceWithoutScroll,
    searchParams,
    searchQuery,
    selectedCountry,
    showActiveOnly,
    dataType,
    sortBy,
    sortOrder,
    urlDataAmount,
    urlDurationDays,
    urlSearch,
  ])

  const replaceParams = (mutate: (params: URLSearchParams) => void) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    mutate(nextParams)
    nextParams.delete('type')
    nextParams.delete('unlimited')
    const nextQuery = nextParams.toString()
    replaceWithoutScroll(nextQuery ? `${pathname}?${nextQuery}` : pathname)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setDataAmountQuery('')
    setDurationDaysQuery('')
    replaceWithoutScroll(pathname)
  }

  return {
    page,
    appliedSearchQuery: urlSearch,
    selectedCountry,
    showActiveOnly,
    dataType,
    dataAmountQuery,
    dataUnit,
    durationDaysQuery,
    sortBy,
    sortOrder,
    searchQuery,
    appliedDataAmountQuery: urlDataAmount,
    appliedDurationDaysQuery: urlDurationDays,
    filteredProducts: products,
    setSelectedCountry: (value: string) => replaceParams((params) => {
      if (value) params.set('country', value)
      else params.delete('country')
      params.delete('page')
    }),
    setShowActiveOnly: (value: boolean | null) => replaceParams((params) => {
      if (value === true) params.set('active', 'active')
      else if (value === false) params.set('active', 'inactive')
      else params.delete('active')
      params.delete('page')
    }),
    setDataType: (value: ProductDataTypeFilter) => replaceParams((params) => {
      if (value === 'all') params.delete('dataType')
      else params.set('dataType', value)
      params.delete('type')
      params.delete('page')
    }),
    setDataUnit: (value: DataUnitFilter) => replaceParams((params) => {
      if (value === 'all') params.delete('unit')
      else params.set('unit', value)
      params.delete('page')
    }),
    setPage: (value: number) => replaceParams((params) => {
      if (value > 1) params.set('page', String(value))
      else params.delete('page')
    }),
    setSearchQuery,
    setDataAmountQuery: (value: string) => {
      if (editableDataAmountPattern.test(value)) setDataAmountQuery(value)
    },
    setDurationDaysQuery: (value: string) => {
      if (value === '' || durationDaysPattern.test(value)) setDurationDaysQuery(value)
    },
    setSort: (field: ProductSortField) => replaceParams((params) => {
      const nextOrder = sortBy === field
        ? sortOrder === 'asc' ? 'desc' : 'asc'
        : getDefaultProductSortOrder(field)

      if (field === DEFAULT_PRODUCT_SORT_FIELD) params.delete('sortBy')
      else params.set('sortBy', field)

      if (nextOrder === getDefaultProductSortOrder(field)) params.delete('sortOrder')
      else params.set('sortOrder', nextOrder)

      params.delete('page')
    }),
    clearFilters,
  }
}
