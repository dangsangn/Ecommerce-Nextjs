import Link from 'next/link'
import { toPriceString } from '@/lib/products/price'
import { Badge } from '@/components/ui/badge'
import type { Product } from '@/types/product'

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product._id}`}
      className="group flex flex-col overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.product_thumb} alt={product.product_name} className="aspect-square w-full object-cover" />
      <div className="space-y-1 p-3">
        <p className="line-clamp-1 font-medium">{product.product_name}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm">{toPriceString(product.product_price)}</span>
          <Badge variant="secondary">{product.product_type}</Badge>
        </div>
      </div>
    </Link>
  )
}
