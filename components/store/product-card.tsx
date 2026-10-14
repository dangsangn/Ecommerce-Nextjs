import Link from 'next/link'
import { formatPriceRange } from '@/lib/products/price'
import { priceRange } from '@/lib/products/sku'
import type { Product } from '@/types/product'

export function ProductCard({ product }: { product: Product }) {
  // List pages never load the SKU rows, so the price comes from the range the
  // backend stores on the SPU — "9.99 – 24.50" when its variants differ.
  const range = priceRange(product)
  const variants = product.product_sku_count ?? 1

  return (
    <Link
      href={`/products/${product._id}`}
      className="group relative flex flex-col rounded-xl bg-card p-3 shadow-[0_1px_6px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
    >
      <span className="absolute left-0 top-3 z-10 rounded-r-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold uppercase text-white">
        {product.product_type.toLowerCase()}
      </span>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.product_thumb}
          alt={product.product_name}
          className="size-full object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{product.product_name}</p>
        <p className="text-base font-bold text-brand tabular-nums">
          {formatPriceRange(range.min, range.max)}
        </p>
        {variants > 1 ? (
          <p className="mt-auto w-fit rounded-md border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
            {variants} variants available
          </p>
        ) : null}
      </div>
    </Link>
  )
}
