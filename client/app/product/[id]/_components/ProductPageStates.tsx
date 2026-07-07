'use client'

export function ProductPageLoading() {
  return (
    <div className="container">
      <div className="glass-card mb-6">
        <div className="skeleton w-20 h-20 rounded-2xl mx-auto mb-4" />
        <div className="skeleton h-6 w-32 mx-auto mb-2" />
        <div className="skeleton h-4 w-48 mx-auto" />
      </div>
      <div className="glass-card">
        <div className="skeleton h-8 w-24 mb-4" />
        <div className="skeleton h-4 w-full mb-2" />
        <div className="skeleton h-4 w-full mb-2" />
        <div className="skeleton h-4 w-3/4" />
      </div>
    </div>
  )
}

export function ProductNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="container">
      <div className="glass-card text-center py-12">
        <p className="text-secondary text-lg">Продукт не найден</p>
        <button onClick={onBack} className="glass-button mt-4">
          Вернуться
        </button>
      </div>
    </div>
  )
}
