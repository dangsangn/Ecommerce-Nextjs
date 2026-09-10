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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImage}
          alt={spu.product_name}
          className="aspect-square w-full rounded-md border object-cover"
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
                  'size-16 overflow-hidden rounded-md border transition-colors',
                  img.url === activeImage
                    ? 'border-primary ring-1 ring-primary'
                    : 'hover:border-foreground/40',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{spu.product_name}</h1>
          <Badge variant="secondary">{spu.product_type}</Badge>
        </div>

        <p className="text-xl">
          {selectedSku
            ? toPriceString(selectedSku.sku_price)
            : formatPriceRange(range.min, range.max)}
        </p>

        {variations.map((axis, axisIdx) => (
          <fieldset key={axis.name} className="space-y-2">
            <legend className="text-sm font-medium">
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
                      'rounded-md border px-3 py-1.5 text-sm transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'hover:border-foreground/40',
                      !selectable &&
                        !selected &&
                        'cursor-not-allowed text-muted-foreground line-through opacity-50',
                    )}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <p className="text-sm text-muted-foreground">
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
