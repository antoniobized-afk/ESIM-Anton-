'use client'

import { productsApi } from '@/lib/api'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import BulkBadgeModal from './BulkBadgeModal'
import BulkMarkupModal from './BulkMarkupModal'
import ProductEditModal from './ProductEditModal'
import ProductViewModal from './ProductViewModal'
import ProductsBulkActions from './ProductsBulkActions'
import ProductsFilters from './ProductsFilters'
import ProductsTable from './ProductsTable'
import ProductsToolbar from './ProductsToolbar'
import { useProducts } from './useProducts'

export default function ProductsPage() {
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const products = useProducts()

  const handleBulkActivate = async () => {
    if (products.selectedIds.size === 0) return
    try {
      const response = await productsApi.bulkToggleActive(Array.from(products.selectedIds), true)
      toast.success(response.data.message || 'Выбранные тарифы активированы')
      products.clearSelection()
      await products.loadProducts()
    } catch {
      toast.error('Не удалось активировать выбранные тарифы')
    }
  }

  const handleBulkDeactivate = async () => {
    if (products.selectedIds.size === 0) return
    try {
      const response = await productsApi.bulkToggleActive(Array.from(products.selectedIds), false)
      toast.success(response.data.message || 'Выбранные тарифы деактивированы')
      products.clearSelection()
      await products.loadProducts()
    } catch {
      toast.error('Не удалось деактивировать выбранные тарифы')
    }
  }

  const handleBulkToggleByType = async (tariffType: 'standard' | 'unlimited', isActive: boolean) => {
    const typeName = tariffType === 'unlimited' ? 'безлимитные' : 'стандартные'
    const action = isActive ? 'включить' : 'выключить'
    const confirmed = await confirmDialog({
      title: 'Массовое изменение тарифов',
      description: `Вы уверены, что хотите ${action} все ${typeName} тарифы?`,
      confirmLabel: isActive ? 'Включить все' : 'Выключить все',
      variant: isActive ? 'default' : 'destructive',
    })
    if (!confirmed) return

    try {
      const response = await productsApi.bulkToggleByType(tariffType, isActive)
      toast.success(response.data.message || 'Массовое изменение выполнено')
      await products.loadProducts()
    } catch {
      toast.error('Не удалось выполнить массовое изменение')
    }
  }

  const handleBulkSetBadge = async () => {
    if (products.selectedIds.size === 0) return
    try {
      const response = await productsApi.bulkSetBadge(
        Array.from(products.selectedIds),
        products.bulkBadge.trim() || null,
        products.bulkBadgeColor || null,
      )
      toast.success(response.data.message || 'Бейджи обновлены')
      products.setShowBulkBadgeModal(false)
      products.setBulkBadge('')
      products.setBulkBadgeColor('')
      products.clearSelection()
      await products.loadProducts()
    } catch {
      toast.error('Не удалось обновить бейджи')
    }
  }

  const handleBulkSetMarkup = async () => {
    if (products.selectedIds.size === 0) return
    try {
      const response = await productsApi.bulkSetMarkup(Array.from(products.selectedIds), products.bulkMarkup)
      toast.success(response.data.message || 'Наценка обновлена')
      products.setShowBulkMarkupModal(false)
      products.setBulkMarkup(30)
      products.clearSelection()
      await products.loadProducts()
    } catch {
      toast.error('Не удалось изменить наценку')
    }
  }

  const handleProviderPriceUsdChange = (value: string) => {
    const normalized = value.replace(',', '.')
    products.setEditingProviderPriceUsd(normalized)
    const numericValue = Number.parseFloat(normalized)
    const nextProviderPrice = Number.isFinite(numericValue) ? Math.round(numericValue * 10000) : 0
    products.setEditingProduct((prev) => {
      if (!prev) return prev
      const nextProduct = { ...prev, providerPrice: nextProviderPrice }
      products.setEditingMarkupPercent(Math.round(products.getMarkupPercent(nextProduct.providerPrice, nextProduct.ourPrice)).toString())
      return nextProduct
    })
  }

  const handleOurPriceChange = (value: string) => {
    const nextOurPrice = Number(value) || 0
    products.setEditingProduct((prev) => {
      if (!prev) return prev
      const nextProduct = { ...prev, ourPrice: nextOurPrice }
      products.setEditingMarkupPercent(Math.round(products.getMarkupPercent(nextProduct.providerPrice, nextProduct.ourPrice)).toString())
      return nextProduct
    })
  }

  const applyMarkupToEditingProduct = (markupValue?: number) => {
    if (!products.editingProduct) return
    const resolvedMarkup = typeof markupValue === 'number' ? markupValue : Number.parseFloat(products.editingMarkupPercent.replace(',', '.'))
    if (!Number.isFinite(resolvedMarkup)) {
      toast.error('Введите корректную наценку в процентах')
      return
    }
    const providerPriceUSD = products.getProviderPriceUSD(products.editingProduct.providerPrice)
    const nextOurPrice = Math.round(providerPriceUSD * (1 + resolvedMarkup / 100) * products.exchangeRate)
    products.setEditingProduct({ ...products.editingProduct, ourPrice: nextOurPrice })
    products.setEditingMarkupPercent(String(resolvedMarkup))
  }

  if (products.loading && !products.loadedOnce) {
    return (
      <div className="glass-card p-8">
        <Spinner centered />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ProductsToolbar
        productsCount={products.totalProducts}
        syncing={products.syncing}
        onCreate={products.handleCreate}
        onSync={products.handleSync}
        onRefresh={products.loadProducts}
      />
      <ProductsFilters
        countries={products.countries}
        products={products.products}
        filteredProducts={products.products}
        totalProducts={products.totalProducts}
        page={products.page}
        selectedCountry={products.selectedCountry}
        showActiveOnly={products.showActiveOnly}
        tariffType={products.tariffType}
        dataAmountQuery={products.dataAmountQuery}
        dataUnit={products.dataUnit}
        durationDaysQuery={products.durationDaysQuery}
        searchQuery={products.searchQuery}
        onCountryChange={products.setSelectedCountry}
        onStatusChange={products.setShowActiveOnly}
        onTariffTypeChange={products.setTariffType}
        onDataAmountChange={products.setDataAmountQuery}
        onDataUnitChange={products.setDataUnit}
        onDurationDaysChange={products.setDurationDaysQuery}
        onSearchChange={products.setSearchQuery}
        onClear={products.clearFilters}
        onToggleByType={handleBulkToggleByType}
      />
      <ProductsBulkActions
        selectedCount={products.selectedIds.size}
        onClear={products.clearSelection}
        onActivate={handleBulkActivate}
        onDeactivate={handleBulkDeactivate}
        onOpenBadgeModal={() => products.setShowBulkBadgeModal(true)}
        onOpenMarkupModal={() => products.setShowBulkMarkupModal(true)}
      />
      <ProductsTable
        filteredProducts={products.products}
        selectedIds={products.selectedIds}
        exchangeRate={products.exchangeRate}
        error={products.error}
        onRetry={products.loadProducts}
        onSelectAll={products.handleSelectAll}
        onSelectOne={products.handleSelectOne}
        onView={products.setViewingProduct}
        onEdit={products.handleEdit}
        onToggleActive={products.handleToggleActive}
        getProviderPriceUSD={products.getProviderPriceUSD}
        getMarkupPercent={products.getMarkupPercent}
      />
      <Pagination page={products.page} totalPages={products.totalPages} onPageChange={products.setPage} />
      {products.showBulkBadgeModal && (
        <BulkBadgeModal
          selectedCount={products.selectedIds.size}
          bulkBadge={products.bulkBadge}
          bulkBadgeColor={products.bulkBadgeColor}
          onBadgeChange={products.setBulkBadge}
          onBadgeColorChange={products.setBulkBadgeColor}
          onApply={handleBulkSetBadge}
          onClose={() => products.setShowBulkBadgeModal(false)}
        />
      )}
      {products.showBulkMarkupModal && (
        <BulkMarkupModal
          selectedCount={products.selectedIds.size}
          bulkMarkup={products.bulkMarkup}
          exchangeRate={products.exchangeRate}
          onMarkupChange={products.setBulkMarkup}
          onApply={handleBulkSetMarkup}
          onClose={() => products.setShowBulkMarkupModal(false)}
        />
      )}
      {products.editingProduct && (
        <ProductEditModal
          editingProduct={products.editingProduct}
          isCreating={products.isCreating}
          exchangeRate={products.exchangeRate}
          editingProviderPriceUsd={products.editingProviderPriceUsd}
          editingMarkupPercent={products.editingMarkupPercent}
          setEditingProduct={products.setEditingProduct}
          onProviderPriceChange={handleProviderPriceUsdChange}
          onOurPriceChange={handleOurPriceChange}
          onMarkupPercentChange={products.setEditingMarkupPercent}
          onApplyMarkup={applyMarkupToEditingProduct}
          onSave={products.handleSave}
          onClose={products.closeEditor}
          getProviderPriceUSD={products.getProviderPriceUSD}
          getMarkupPercent={products.getMarkupPercent}
        />
      )}
      {products.viewingProduct && (
        <ProductViewModal
          product={products.viewingProduct}
          exchangeRate={products.exchangeRate}
          onEdit={(product) => {
            products.handleEdit(product)
            products.setViewingProduct(null)
          }}
          onClose={() => products.setViewingProduct(null)}
          getProviderPriceUSD={products.getProviderPriceUSD}
          getMarkupPercent={products.getMarkupPercent}
        />
      )}
    </div>
  )
}
