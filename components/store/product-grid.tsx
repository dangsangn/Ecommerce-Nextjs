import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ProductCard } from '@/components/store/product-card'
import type { Pagination, Product } from '@/types/product'

function pageHref(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const s = params.toString()
  return s ? `/?${s}` : '/'
}

export function ProductGrid({ items, pagination, q }: { items: Product[]; pagination: Pagination; q: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No products found.</p>
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </div>
      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex gap-2">
            <Link
              href={pageHref(q, pagination.page - 1)}
              aria-disabled={!pagination.hasPreviousPage}
              className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasPreviousPage && 'pointer-events-none opacity-50')}
            >
              Previous
            </Link>
            <Link
              href={pageHref(q, pagination.page + 1)}
              aria-disabled={!pagination.hasNextPage}
              className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasNextPage && 'pointer-events-none opacity-50')}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
