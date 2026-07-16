import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { buttonVariants } from '@/components/ui/button'
import { ProductList } from '@/components/products/product-list'
import type { ProductListResult } from '@/types/product'

const LIMIT = 20

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab === 'published' ? 'published' : 'draft'
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
  const path = `/product/list/${tab}?page=${page}&limit=${LIMIT}`

  let result: ProductListResult = {
    data: [],
    pagination: { total: 0, page, limit: LIMIT, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
  }
  let error: string | null = null
  try {
    result = await apiFetch<ProductListResult>(path, { auth: true })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load products'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link href="/seller/products/new" className={buttonVariants()}>New product</Link>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <ProductList items={result.data} pagination={result.pagination} tab={tab} />
      )}
    </div>
  )
}
