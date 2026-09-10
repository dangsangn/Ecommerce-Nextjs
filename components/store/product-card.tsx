import Link from 'next/link'
import { formatPriceRange } from '@/lib/products/price'
import { priceRange } from '@/lib/products/sku'
import { Badge } from '@/components/ui/badge'
import type { Product } from '@/types/product'

export function ProductCard({ product }: { product: Product }) {
  // List pages never load the SKU rows, so the price comes from the range the
  // backend stores on the SPU — "9.99 – 24.50" when its variants differ.
  const range = priceRange(product)
  const variants = product.product_sku_count ?? 1

  return (
    <Link
      href={`/products/${product._id}`}
      className="group flex flex-col overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.product_thumb} alt={product.product_name} className="aspect-square w-full object-cover" />
      <div className="space-y-1 p-3">
        <p className="line-clamp-1 font-medium">{product.product_name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">{formatPriceRange(range.min, range.max)}</span>
          <Badge variant="secondary">{product.product_type}</Badge>
        </div>
        {variants > 1 ? (
          <p className="text-xs text-muted-foreground">{variants} variants</p>
        ) : null}
      </div>
    </Link>
  )
}
