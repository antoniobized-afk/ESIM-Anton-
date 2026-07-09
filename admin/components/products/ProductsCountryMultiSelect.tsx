'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { getCountryFilterLabel, isMultiCountryValue } from '@shared/country-display'

type CountryFilterOption = {
  value: string
  label: string
  isMultiCountry: boolean
}

interface ProductsCountryMultiSelectProps {
  countries: string[]
  selectedCountries: string[]
  onChange: (value: string[]) => void
}

function normalizeCountryValues(values: string[]) {
  const normalized: string[] = []

  values.forEach((value) => {
    const country = value.trim()
    if (country && !normalized.includes(country)) normalized.push(country)
  })

  return normalized
}

function buildCountryOption(country: string): CountryFilterOption {
  return {
    value: country,
    label: getCountryFilterLabel(country),
    isMultiCountry: isMultiCountryValue(country),
  }
}

export default function ProductsCountryMultiSelect({
  countries,
  selectedCountries,
  onChange,
}: ProductsCountryMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const generatedId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerId = `${generatedId}-trigger`
  const panelId = `${generatedId}-panel`
  const selectedValues = useMemo(() => normalizeCountryValues(selectedCountries), [selectedCountries])
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const countryOptions = useMemo(
    () => countries.map(buildCountryOption).sort((left, right) => left.label.localeCompare(right.label, 'ru')),
    [countries],
  )
  const optionsByValue = useMemo(
    () => new Map(countryOptions.map((option) => [option.value, option])),
    [countryOptions],
  )
  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return countryOptions

    return countryOptions.filter((option) =>
      option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query),
    )
  }, [countryOptions, searchQuery])
  const singleCountryOptions = filteredOptions.filter((option) => !option.isMultiCountry)
  const multiCountryOptions = filteredOptions.filter((option) => option.isMultiCountry)
  const selectedOptions = selectedValues.map((value) => optionsByValue.get(value) ?? buildCountryOption(value))
  const primarySelected = selectedOptions[0]
  const extraSelectedCount = Math.max(0, selectedOptions.length - 1)
  const selectedLabel = primarySelected
    ? `${primarySelected.label}${extraSelectedCount > 0 ? ` + ${extraSelectedCount}` : ''}`
    : `Все направления (${countries.length})`

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) setSearchQuery('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    searchInputRef.current?.focus()
  }, [isOpen])

  const toggleCountry = (country: string) => {
    if (selectedSet.has(country)) {
      onChange(selectedValues.filter((value) => value !== country))
      return
    }

    onChange([...selectedValues, country])
  }

  const renderOption = (option: CountryFilterOption, index: number, groupKey: string) => {
    const selected = selectedSet.has(option.value)
    const optionId = `${generatedId}-${groupKey}-${index}`

    return (
      <label
        key={option.value}
        htmlFor={optionId}
        className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
          selected
            ? 'bg-blue-50 font-semibold text-blue-700'
            : 'text-slate-700 hover:bg-slate-50'
        }`}
      >
        <input
          id={optionId}
          type="checkbox"
          checked={selected}
          onChange={() => toggleCountry(option.value)}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="whitespace-nowrap">{option.label}</span>
      </label>
    )
  }

  const renderGroup = (label: string, groupKey: string, options: CountryFilterOption[]) => {
    if (options.length === 0) return null

    return (
      <fieldset>
        <legend className="px-4 pb-1 pt-3 text-xs font-semibold uppercase text-slate-400">
          {label} ({options.length})
        </legend>
        {options.map((option, index) => renderOption(option, index, groupKey))}
      </fieldset>
    )
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={`Фильтр направлений: ${selectedLabel}`}
        onClick={() => setIsOpen((open) => !open)}
        className={`flex min-h-[46px] w-full cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 transition-all ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-200'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {primarySelected ? (
          <>
            <span className="flex min-w-0 max-w-[70%] items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-700">
              <span className="truncate">{primarySelected.label}</span>
            </span>
            {extraSelectedCount > 0 && (
              <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
                + {extraSelectedCount}
              </span>
            )}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
            Все направления ({countries.length})
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          aria-labelledby={triggerId}
          className="absolute left-0 z-50 mt-2 max-h-80 w-max min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:min-w-[22rem]"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selectedValues.length === 0}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors`}
          >
            <span className="whitespace-nowrap">Все направления ({countries.length})</span>
            {selectedValues.length > 0 && <X className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>
          <div className="sticky top-0 z-10 border-y border-slate-100 bg-white p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Найти направление"
                placeholder="Найти направление"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>
          {renderGroup('Страны', 'countries', singleCountryOptions)}
          {renderGroup('Мультистраны', 'multi-countries', multiCountryOptions)}
          {filteredOptions.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500" aria-live="polite">
              Нет направлений
            </div>
          )}
        </div>
      )}
    </div>
  )
}
