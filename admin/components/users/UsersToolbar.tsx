import { FormEvent } from 'react'
import { RefreshCw, Search, X } from 'lucide-react'
import Button from '@/components/ui/Button'

interface UsersToolbarProps {
  totalCount: number
  searchValue: string
  onSearchValueChange: (value: string) => void
  onSearchSubmit: () => void
  onSearchClear: () => void
  onRefresh: () => void
}

export default function UsersToolbar({
  totalCount,
  searchValue,
  onSearchValueChange,
  onSearchSubmit,
  onSearchClear,
  onRefresh,
}: UsersToolbarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearchSubmit()
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">
        Пользователи
        <span className="ml-2 text-base font-normal text-slate-500">({totalCount})</span>
      </h2>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <form onSubmit={handleSubmit} className="flex min-w-[260px] max-w-xl flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
              placeholder="ID, email, username, телефон"
              className="w-full rounded-lg border border-slate-200 bg-white/80 py-2 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {searchValue ? (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={onSearchClear}
                className="absolute right-2 top-1/2 rounded p-1 text-slate-400 transition-colors -translate-y-1/2 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <Button type="submit" variant="secondary" size="sm">
            <Search className="h-4 w-4" />
            Найти
          </Button>
        </form>

        <Button onClick={onRefresh} variant="ghost" size="sm" className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-700">
          <RefreshCw className="h-4 w-4" />
          Обновить
        </Button>
      </div>
    </div>
  )
}
