'use client'
import { useMemo, useState } from 'react'
import { toPriceString, formatPriceRange } from '@/lib/products/price'
import {
  isOptionSelectable,
  optionImageFor,
  priceRange,
  resolveSku,
  selectionLabel,
  toggleOption,
  totalStock,
  type VariantSelection,
} from '@/lib/products/sku'
import { AddToCart } from '@/components/store/add-to-cart'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { Product, ProductImage, Sku } from '@/types/product'

/*
  The buyer-facing half of an SPU page: gallery on the left, variant matrix and
  price on the right. Both halves live in one client component because picking a
  variant changes the image as well as the price — splitting them would mean
  lifting the selection into a context for no gain.
*/
export function ProductPurchase({ spu, skus }: { spu: Product; skus: Sku[] }) {
  // Memoised because the ?? [] fallback would otherwise be a fresh array on
  // every render and re-run the gallery memo below.
  const variations = useMemo(
    () => spu.product_variations ?? [],
    [spu.product_variations],
  )

  // Open on the default SKU, the way a shop wants the product first seen.
  const [selection, setSelection] = useState<VariantSelection>(() => {
    if (!variations.length) return []
    const opening = skus.find((s) => s.sku_default) ?? skus[0]
    return variations.map((_, axis) => opening?.sku_tier_idx[axis] ?? null)
  })
  const [pinnedImage, setPinnedImage] = useState<string | null>(null)

  const selectedSku = resolveSku(skus, selection)
  const range = useMemo(() => priceRange(spu, skus), [spu, skus])

  const gallery = useMemo<ProductImage[]>(() => {
    const base = spu.product_images?.length
      ? spu.product_images
      : [{ url: spu.product_thumb, public_id: 'thumb' }]
    // Variant images are extra angles of the same product — append the ones the
    // base gallery does not already contain.
    const extra = [
      ...variations.flatMap((v) => v.images ?? []),
      ...skus.map((s) => s.sku_thumb).filter((i): i is ProductImage => Boolean(i)),
    ]
    const seen = new Set(base.map((i) => i.url))
    const unique: ProductImage[] = []
    for (const img of extra) {
      if (seen.has(img.url)) continue
      seen.add(img.url)
      unique.push(img)
    }
    return [...base, ...unique]
  }, [spu.product_images, spu.product_thumb, variations, skus])

  // A pinned thumbnail wins; otherwise the picked variant drives the main image.
  const activeImage =
    pinnedImage ??
    selectedSku?.sku_thumb?.url ??
    optionImageFor(variations, selection) ??
    gallery[0]?.url

  const stock = selectedSku ? (selectedSku.stock ?? 0) : totalStock(skus)
  const label = selectionLabel(variations, selection)
  const incomplete = variations.length > 0 && !selectedSku

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10">
      <div className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImage}
          alt={spu.product_name}
          className="aspect-square w-full rounded-xl border bg-white object-contain"
        />
        {gallery.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {gallery.map((img) => (
              <button
                key={img.url}
                type="button"
                onClick={() => setPinnedImage(img.url)}
                aria-label="Show this image"
                aria-current={img.url === activeImage}
                className={cn(
                  'size-16 overflow-hidden rounded-lg border-2 bg-white transition-colors',
                  img.url === activeImage
                    ? 'border-brand'
                    : 'border-transparent ring-1 ring-border hover:ring-brand/50',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="size-full object-contain" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <div className="space-y-2 border-b pb-4">
          <h1 className="text-xl font-bold leading-snug sm:text-2xl">{spu.product_name}</h1>
          <span className="inline-block rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold uppercase text-brand">
            {spu.product_type.toLowerCase()}
          </span>
        </div>

        <div className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Price</p>
          <p className="text-2xl font-extrabold text-brand tabular-nums sm:text-3xl">
            {selectedSku
              ? toPriceString(selectedSku.sku_price)
              : formatPriceRange(range.min, range.max)}
          </p>
        </div>

        {variations.map((axis, axisIdx) => (
          <fieldset key={axis.name} className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">
              {axis.name}
              {selection[axisIdx] != null ? (
                <span className="ml-1 text-muted-foreground">
                  {axis.options[selection[axisIdx]!]}
                </span>
              ) : null}
            </legend>
            <div className="flex flex-wrap gap-2">
              {axis.options.map((option, optionIdx) => {
                const selected = selection[axisIdx] === optionIdx
                // Sold-out and never-stocked cells look the same to the buyer:
                // both mean "you cannot pick this".
                const selectable = isOptionSelectable(
                  skus,
                  selection,
                  axisIdx,
                  optionIdx,
                )
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={!selectable && !selected}
                    aria-pressed={selected}
                    onClick={() => {
                      // Let the new variant drive the image again.
                      setPinnedImage(null)
                      setSelection((s) => toggleOption(s, axisIdx, optionIdx))
                    }}
                    className={cn(
                      'relative min-w-24 overflow-hidden rounded-lg border bg-card px-4 py-2 text-sm font-medium transition-colors',
                      selected
                        ? 'border-brand text-brand'
                        : 'hover:border-brand/50',
                      !selectable &&
                        !selected &&
                        'cursor-not-allowed text-muted-foreground line-through opacity-50',
                    )}
                  >
                    {option}
                    {selected ? (
                      <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl-lg bg-brand text-white">
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <p
          className={cn(
            'w-fit rounded-full px-3 py-1 text-xs font-medium',
            !incomplete && stock > 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {incomplete
            ? `Pick ${remainingAxes(variations, selection)} to see stock`
            : stock > 0
              ? `In stock: ${stock}`
              : 'Out of stock'}
        </p>

        <AddToCart
          productId={spu._id}
          skuId={selectedSku?._id}
          skuLabel={label}
          max={stock}
          disabled={incomplete || stock <= 0}
          hint={incomplete ? 'Choose every option first' : undefined}
        />
      </div>
    </div>
  )
}

function remainingAxes(
  variations: NonNullable<Product['product_variations']>,
  selection: VariantSelection,
): string {
  return variations
    .filter((_, i) => selection[i] == null)
    .map((v) => v.name.toLowerCase())
    .join(' and ')
}
