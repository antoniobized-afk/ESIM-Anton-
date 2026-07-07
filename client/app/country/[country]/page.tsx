'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { ArrowLeft } from '@/components/icons'
import { useSmartBack } from '@/lib/useSmartBack'
import { productsApi, type Product } from '@/lib/api'
import { formatPrice, formatDataAmount, getFlagUrl, getCountryName, getAfterLimitNote } from '@/lib/utils'
import {
  getCoverageCount,
  getCoverageItems,
  getCoverageScopeLabel,
  getCoverageSummary,
  isGlobalProduct,
  isMultiProduct,
} from '@/lib/productCoverage'


function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  )
}

export default function CountryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f5f7] dark:bg-gray-950" />}>
      <CountryPageInner />
    </Suspense>
  )
}

function CountryPageInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const country = decodeURIComponent(params.country as string)
  const initialTab = searchParams.get('tab') === 'unlimited' ? 'unlimited' : 'standard'
  const handleBack = useSmartBack('/')
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'standard' | 'unlimited'>(initialTab)

  // Фильтрация по типу тарифа (используем поле isUnlimited из API)
  const products = allProducts.filter(p =>
    activeTab === 'unlimited' ? p.isUnlimited : !p.isUnlimited
  )



  const firstProd = products[0] || null
  const selectedCoverageItems = firstProd ? getCoverageItems(firstProd).map(getCountryName) : []
  const selectedCoverageCount = firstProd ? getCoverageCount(firstProd) : 1
  const showRegionCoverage = Boolean(
    firstProd &&
    (isMultiProduct(firstProd) || isGlobalProduct(firstProd)) &&
    selectedCoverageItems.length > 1
  )

  useEffect(() => {
    const tabFromQuery = searchParams.get('tab')

    if (tabFromQuery === 'standard' || tabFromQuery === 'unlimited') {
      setActiveTab(tabFromQuery)
    }
  }, [searchParams])

  const loadProducts = useCallback(async () => {
    try {
      const fetchedProducts = await productsApi.getAll({ isActive: true })
      const countryProducts = fetchedProducts.filter(p => p.country === country)
      // Сортируем по цене
      countryProducts.sort((a, b) => a.ourPrice - b.ourPrice)
      setAllProducts(countryProducts)
    } catch (error) {
      console.error('Ошибка загрузки:', error)
    } finally {
      setLoading(false)
    }
  }, [country])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `eSIM для ${country}`,
        text: `Купи eSIM для ${country} от ₽${products[0]?.ourPrice || 0}`,
        url: window.location.href,
      })
    }
  }

  return (
    <div className="container animate-fade-in bg-[#f4f5f7] dark:bg-gray-950 pb-20">
      {/* Header */}
      <div className="header-back sticky top-0 z-40 bg-[#f4f5f7]/90 dark:bg-gray-950/90 backdrop-blur-xl border-b border-gray-200/70 dark:border-gray-800 -mx-5 px-5 pt-3 pb-3 mb-4">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-gray-600 dark:text-gray-400"
            aria-label="Назад"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            {getFlagUrl(country) ? (
              <img src={getFlagUrl(country)} alt={getCountryName(country)} className="w-8 h-auto rounded shadow-sm" onError={(e) => { (e.target as HTMLImageElement).src = '/logo-mark.png'; (e.target as HTMLImageElement).className = 'w-8 h-8 rounded-lg object-contain'; }} />
            ) : (
              <img src="/logo-mark.png" alt="Mojo mobile" className="w-8 h-8 rounded-lg object-contain" />
            )}
            <span className="font-semibold text-lg dark:text-white">{getCountryName(country)}</span>
          </div>
          <button
            onClick={handleShare}
            className="p-2 -mr-2 text-gray-600 dark:text-gray-400"
            aria-label="Поделиться"
          >
            <ShareIcon />
          </button>
        </div>
      </div>
      {firstProd && (isMultiProduct(firstProd) || isGlobalProduct(firstProd)) && (
        <div className="card-neutral p-4 mb-4 animate-slide-up">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {getCoverageScopeLabel(firstProd)}
          </p>
          <p className="text-base font-semibold text-gray-900 dark:text-white">
            Покрывает {getCoverageSummary(firstProd)}
          </p>
        </div>
      )}

      {showRegionCoverage && firstProd && (
        <div className="card-neutral p-4 mb-4 animate-slide-up" style={{ animationDelay: '0.04s' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Страны в пакете
              </p>
              <p className="text-base font-semibold text-gray-900">
                {getCoverageSummary(firstProd)}
              </p>
            </div>
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-[#f77430]">
              {selectedCoverageCount} стран
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {selectedCoverageItems.map(item => (
              <div
                key={item}
                className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700"
              >
                {item}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Перед покупкой сразу видно, какие страны входят в этот региональный пакет.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('standard')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'standard'
              ? 'bg-[#f77430] text-white shadow-md shadow-orange-200 dark:shadow-orange-900/30'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
        >
          Стандартные
        </button>
        <button
          onClick={() => setActiveTab('unlimited')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'unlimited'
              ? 'bg-[#f77430] text-white shadow-md shadow-orange-200 dark:shadow-orange-900/30'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
        >
          Безлимитные
        </button>
      </div>

      {/* Products List */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-neutral p-4">
              <div className="flex justify-between items-center">
                <div className="skeleton h-5 w-24" />
                <div className="skeleton h-5 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card-neutral text-center py-10">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-600 font-medium">Тарифы не найдены</p>
        </div>
      ) : (
        <div className="card-neutral overflow-hidden">
          {products.map((product, index) => (
            <div
              key={product.id}
              onClick={() => router.push(`/product/${product.id}?returnTo=${encodeURIComponent(
                `/country/${encodeURIComponent(country)}?tab=${activeTab}`
              )}`)}
              className={`
                  flex items-center justify-between px-4 py-3 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-800
                  ${index !== products.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}
                `}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatDataAmount(product.dataAmount)}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {product.isUnlimited
                      ? `в день`
                      : `на ${product.validityDays} дн.`
                    }
                  </span>
                  {/* Бейдж */}
                  {product.badge && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${product.badgeColor === 'red' ? 'bg-red-500' :
                        product.badgeColor === 'green' ? 'bg-green-500' :
                          product.badgeColor === 'blue' ? 'bg-[#f77430]' :
                            product.badgeColor === 'orange' ? 'bg-orange-500' :
                              'bg-[#f29b41]'
                      }`}>
                      {product.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {product.isUnlimited
                    ? 'Ежедневный пакет интернета'
                    : 'Весь объём интернета на срок тарифа'}
                </p>
                {/* Покрытие для мульти/глобальных пакетов */}
                {(isMultiProduct(product) || isGlobalProduct(product)) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {getCoverageScopeLabel(product)}: {getCoverageSummary(product)}
                  </p>
                )}
                {/* Теги тарифа (Материковый Китай, Не гонконгский IP, 5G и т.д.) */}
                {(product.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(product.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Метка о возможности пополнения (top-up) */}
                {product.supportTopup && (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50">
                      ↻ Можно пополнить
                    </span>
                  </div>
                )}
                {/* Поведение daily-тарифа после исчерпания дневного лимита */}
                {(() => {
                  const afterLimitNote = getAfterLimitNote(product)
                  return afterLimitNote ? (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {afterLimitNote}
                    </p>
                  ) : null
                })()}
                {/* Примечание из админки */}
                {product.notes && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {product.notes}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900 dark:text-white">
                  {formatPrice(product.ourPrice)} ₽
                </span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
