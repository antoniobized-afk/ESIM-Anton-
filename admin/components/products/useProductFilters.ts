'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { AdminProduct } from '@/lib/types'
import type { DataUnitFilter, TariffFilter } from './useProducts'

function getDataUnitFilter(value: string | null): DataUnitFilter {
  const normalized = value?.toUpperCase()
  return normalized === 'MB' || normalized === 'GB' ? normalized : 'all'
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

  const selectedCountry = searchParams.get('country') || ''
  const activeParam = searchParams.get('active')
  const showActiveOnly = activeParam === 'active' ? true : activeParam === 'inactive' ? false : null
  const typeParam = searchParams.get('type')
  const unlimitedParam = searchParams.get('unlimited')
  const tariffType: TariffFilter =
    typeParam === 'standard' || typeParam === 'unlimited'
      ? typeParam
      : unlimitedParam === 'true'
        ? 'unlimited'
        : unlimitedParam === 'false'
          ? 'standard'
          : 'all'
  const urlSearch = searchParams.get('search') || ''
  const urlDataAmount = normalizeDataAmountQuery(searchParams.get('data') || '')
  const dataUnit = getDataUnitFilter(searchParams.get('unit'))
  const urlDurationDays = normalizeDurationDaysQuery(searchParams.get('duration') || '')
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
    if (tariffType !== 'all') normalized.set('type', tariffType)
    if (searchQuery.trim()) normalized.set('search', searchQuery.trim())
    if (normalizedDataAmount) normalized.set('data', normalizedDataAmount)
    if (dataUnit !== 'all') normalized.set('unit', dataUnit)
    if (normalizedDurationDays) normalized.set('duration', normalizedDurationDays)
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
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [
    dataAmountQuery,
    dataUnit,
    durationDaysQuery,
    page,
    pathname,
    router,
    searchParams,
    searchQuery,
    selectedCountry,
    showActiveOnly,
    tariffType,
    urlDataAmount,
    urlDurationDays,
    urlSearch,
  ])

  const replaceParams = (mutate: (params: URLSearchParams) => void) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    mutate(nextParams)
    nextParams.delete('unlimited')
    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setDataAmountQuery('')
    setDurationDaysQuery('')
    router.replace(pathname)
  }

  return {
    page,
    appliedSearchQuery: urlSearch,
    selectedCountry,
    showActiveOnly,
    tariffType,
    dataAmountQuery,
    dataUnit,
    durationDaysQuery,
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
    setTariffType: (value: TariffFilter) => replaceParams((params) => {
      if (value === 'all') params.delete('type')
      else params.set('type', value)
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
    clearFilters,
  }
}
