'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usersApi } from '@/lib/api'
import type { AdminUser } from '@/lib/types'
import { getAdminUserDisplayName, getAdminUserHint } from '@/components/users/user-formatting'
import { Search, X } from 'lucide-react'

interface UserPickerProps {
  value: string // userId
  onChange: (userId: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function UserPicker({
  value,
  onChange,
  placeholder = 'Начните вводить имя, email или username…',
  disabled,
  className,
}: UserPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminUser[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AdminUser | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Resolve current value → display name
  useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }

    let cancelled = false
    usersApi
      .getById(value)
      .then(({ data }) => {
        if (!cancelled) setSelected(data)
      })
      .catch(() => {
        if (!cancelled) setSelected(null)
      })

    return () => {
      cancelled = true
    }
  }, [value])

  // Debounced search
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await usersApi.getAll({ page: 1, limit: 10, search: q.trim() })
        setResults(data.data || [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  // Click outside → close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (user: AdminUser) => {
    setSelected(user)
    onChange(user.id)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    setSelected(null)
    onChange('')
    setQuery('')
  }

  const inputCls =
    'w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'

  // Selected state
  if (selected) {
    const selectedHint = getAdminUserHint(selected)

    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white/80 text-sm ${className ?? ''}`}
      >
        <div className="flex-1 min-w-0">
          <span className="font-medium text-slate-800">{getAdminUserDisplayName(selected)}</span>
          {selectedHint ? <span className="ml-2 text-xs text-slate-400">{selectedHint}</span> : null}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  // Search state
  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            search(e.target.value)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={inputCls}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((u) => {
            const hint = getAdminUserHint(u)

            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(u)}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-800">{getAdminUserDisplayName(u)}</div>
                  {hint ? <div className="text-xs text-slate-400 truncate">{hint}</div> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && results.length === 0 && query.trim() && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-center text-sm text-slate-400">
          Пользователь не найден
        </div>
      )}
    </div>
  )
}
