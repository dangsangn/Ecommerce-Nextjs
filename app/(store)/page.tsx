import { apiFetch } from '@/lib/api/server-client'
import { buildCatalogQuery } from '@/lib/products/catalog-query'
import { ProductGrid } from '@/components/store/product-grid'
import type { ProductListResult } from '@/types/product'

export default async function StoreHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
  const query = buildCatalogQuery({ q, page })

  let result: ProductListResult = {
    data: [],
    pagination: { total: 0, page, limit: 12, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
  }
  let error: string | null = null
  try {
    result = await apiFetch<ProductListResult>(`/product${query}`)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load products'
  }

  return (
    <div className="space-y-6">
      {q ? null : (
        <section className="rounded-2xl bg-gradient-to-r from-brand-dark to-brand px-6 py-8 text-white shadow-sm sm:px-10">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Shop the latest, from shops you trust</h1>
          <p className="mt-2 max-w-lg text-sm text-white/85 sm:text-base">
            Electronics, fashion and more — pick your variant and check out in minutes.
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3 border-b pb-3">
          <h2 className="text-lg font-bold uppercase tracking-tight sm:text-xl">
            {q ? `Results for “${q}”` : 'Featured products'}
          </h2>
          {!error && result.pagination.total > 0 ? (
            <span className="text-sm text-muted-foreground">{result.pagination.total} products</span>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <ProductGrid items={result.data} pagination={result.pagination} q={q} />
        )}
      </section>
    </div>
  )
}
