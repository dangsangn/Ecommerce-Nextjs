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
      <h1 className="text-2xl font-semibold">{q ? `Results for “${q}”` : 'All products'}</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <ProductGrid items={result.data} pagination={result.pagination} q={q} />
      )}
    </div>
  )
}
