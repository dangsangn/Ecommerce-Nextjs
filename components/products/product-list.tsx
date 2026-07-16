import Link from 'next/link'
import { toPriceString } from '@/lib/products/price'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProductRowActions } from '@/components/products/product-row-actions'
import { cn } from '@/lib/utils'
import type { Pagination, Product } from '@/types/product'

type Tab = 'draft' | 'published'

function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      href={`/seller/products?tab=${tab}`}
      className={cn(
        'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}

export function ProductList({
  items,
  pagination,
  tab,
}: {
  items: Product[]
  pagination: Pagination
  tab: Tab
}) {
  return (
    <div className="space-y-4">
      <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-[3px]">
        <TabLink tab="draft" current={tab}>Draft</TabLink>
        <TabLink tab="published" current={tab}>Published</TabLink>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === 'draft' ? 'No draft products.' : 'No published products.'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p._id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.product_thumb} alt="" className="h-10 w-10 rounded-md border object-cover" />
                    <span className="font-medium">{p.product_name}</span>
                  </div>
                </TableCell>
                <TableCell><Badge variant="secondary">{p.product_type}</Badge></TableCell>
                <TableCell>{toPriceString(p.product_price)}</TableCell>
                <TableCell>{p.product_quantity}</TableCell>
                <TableCell><ProductRowActions id={p._id} published={tab === 'published'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/seller/products?tab=${tab}&page=${pagination.page - 1}`}
              aria-disabled={!pagination.hasPreviousPage}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                !pagination.hasPreviousPage && 'pointer-events-none opacity-50',
              )}
            >
              Previous
            </Link>
            <Link
              href={`/seller/products?tab=${tab}&page=${pagination.page + 1}`}
              aria-disabled={!pagination.hasNextPage}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                !pagination.hasNextPage && 'pointer-events-none opacity-50',
              )}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
