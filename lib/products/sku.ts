import { toPriceNumber } from '@/lib/products/price'
import type {
  Product,
  ProductDetail,
  ProductImage,
  ProductVariation,
  Sku,
} from '@/types/product'

// A partially filled selection: one entry per axis, null while unpicked.
export type VariantSelection = (number | null)[]

// Coordinates as a map key. Mirrors the backend's unique index on
// { sku_product_id, sku_tier_idx }, so two SKUs never share a key.
export function tierKey(tierIdx: number[]): string {
  return tierIdx.join('-')
}

/*
  normalizeProductDetail — accept either shape of GET /product/:id.

  The endpoint returns { spu, skus }. A pre-migration backend (or a cached
  response from one) returns the flat product instead, so that case is folded
  into a single implicit SKU here rather than being special-cased in every
  component. The implicit SKU has an empty `_id`: it is a display placeholder,
  not a row the server can be asked about, and callers must not send it back.
*/
export function normalizeProductDetail(raw: unknown): ProductDetail | null {
  if (!raw || typeof raw !== 'object') return null

  const maybe = raw as Partial<ProductDetail>
  if (maybe.spu && typeof maybe.spu === 'object') {
    return { spu: maybe.spu, skus: Array.isArray(maybe.skus) ? maybe.skus : [] }
  }

  const flat = raw as Product
  if (!flat._id) return null
  return {
    spu: flat,
    skus: [
      {
        _id: '',
        sku_code: `${flat._id}-0`,
        sku_product_id: flat._id,
        sku_tier_idx: [],
        sku_price: flat.product_price,
        sku_default: true,
        stock: flat.product_quantity,
      },
    ],
  }
}

export function defaultSku(skus: Sku[]): Sku | undefined {
  return skus.find((s) => s.sku_default) ?? skus[0]
}

export function findSkuByTier(skus: Sku[], tierIdx: number[]): Sku | undefined {
  const key = tierKey(tierIdx)
  return skus.find((s) => tierKey(s.sku_tier_idx) === key)
}

// The SKU a selection points at, or undefined while any axis is still unpicked.
export function resolveSku(
  skus: Sku[],
  selection: VariantSelection,
): Sku | undefined {
  if (selection.some((v) => v == null)) return undefined
  return findSkuByTier(skus, selection as number[])
}

/*
  isOptionSelectable — the matrix is SPARSE.

  2 axes × 3 options is at most 6 cells, not 6 SKUs: a shop that never stocked
  Blue/L simply has no row for it. An option is offered only when some in-stock
  SKU exists that uses it AND agrees with every OTHER axis already picked.

  Re-clicking a picked option clears it (see toggleOption), so a buyer can never
  paint themselves into a corner where nothing else is selectable.
*/
export function isOptionSelectable(
  skus: Sku[],
  selection: VariantSelection,
  axis: number,
  option: number,
): boolean {
  return skus.some((sku) => {
    if (sku.sku_tier_idx[axis] !== option) return false
    if ((sku.stock ?? 0) <= 0) return false
    return selection.every(
      (picked, i) => i === axis || picked == null || sku.sku_tier_idx[i] === picked,
    )
  })
}

export function toggleOption(
  selection: VariantSelection,
  axis: number,
  option: number,
): VariantSelection {
  const next = [...selection]
  next[axis] = next[axis] === option ? null : option
  return next
}

// "Red / M" — the human-readable variant name. Orders snapshot this as text so
// a past order still reads correctly after the shop renames an option.
export function variantLabel(
  variations: ProductVariation[],
  tierIdx: number[],
): string {
  if (!tierIdx.length) return ''
  return tierIdx
    .map((optIdx, axis) => variations[axis]?.options[optIdx])
    .filter(Boolean)
    .join(' / ')
}

export function selectionLabel(
  variations: ProductVariation[],
  selection: VariantSelection,
): string {
  return selection
    .map((optIdx, axis) =>
      optIdx == null ? null : variations[axis]?.options[optIdx],
    )
    .filter(Boolean)
    .join(' / ')
}

export interface PriceRange {
  min: number
  max: number
}

/*
  priceRange — prefer the SPU's stored min/max.

  They are written in the same transaction as the SKUs, so they are authoritative
  and, crucially, available on list pages where the SKU rows were never fetched.
  Deriving from `skus` is the fallback for the detail page and for SPUs written
  before the split.
*/
export function priceRange(spu: Product, skus: Sku[] = []): PriceRange {
  const storedMin = spu.product_price_min
  const storedMax = spu.product_price_max
  if (storedMin != null && storedMax != null) {
    return { min: toPriceNumber(storedMin), max: toPriceNumber(storedMax) }
  }
  if (skus.length) {
    const prices = skus.map((s) => toPriceNumber(s.sku_price))
    return { min: Math.min(...prices), max: Math.max(...prices) }
  }
  const single = toPriceNumber(spu.product_price)
  return { min: single, max: single }
}

export function totalStock(skus: Sku[]): number {
  return skus.reduce((sum, s) => sum + (s.stock ?? 0), 0)
}

export function skuCount(spu: Product, skus: Sku[] = []): number {
  return spu.product_sku_count ?? skus.length
}

export function hasVariants(spu: Product): boolean {
  return (spu.product_variations?.length ?? 0) > 0
}

/*
  Every cell of the full cross-product, for the seller's SKU editor.

  The seller starts from the complete grid and removes the combinations they do
  not stock — generating all of them with stock 0 would publish variants nobody
  can buy but everyone can see.
*/
export function cartesianTiers(variations: ProductVariation[]): number[][] {
  if (!variations.length) return []
  return variations.reduce<number[][]>(
    (acc, axis) =>
      acc.flatMap((prefix) => axis.options.map((_, i) => [...prefix, i])),
    [[]],
  )
}

// ---------------------------------------------------------------------------
// Variant photos
// ---------------------------------------------------------------------------

/*
  optionImageFor — the photo that belongs to the buyer's current pick.

  Photos hang off ONE axis (the colour-like one). Which axis that is, is the
  seller's choice, so scan in order and take the first axis that both carries
  images and has an option picked. Picking "Red / M" shows the Red photo; the
  size axis contributes nothing.
*/
export function optionImageFor(
  variations: ProductVariation[],
  selection: VariantSelection,
): string | undefined {
  for (let axis = 0; axis < variations.length; axis += 1) {
    const picked = selection[axis]
    if (picked == null) continue
    const url = variations[axis]?.images?.[picked]?.url
    if (url) return url
  }
  return undefined
}

export interface VariantAxisDraft {
  name: string
  options: string[]
}

// Key for one cell of the seller's photo picker: which axis, which option.
export function optionImageKey(axis: number, option: number): string {
  return `${axis}:${option}`
}

/*
  buildVariationsPayload — the editor's photo picks as the schema's positional array.

  `images` is indexed BY OPTION POSITION, so a gap would silently shift every
  later photo onto the wrong option. Rather than force the seller to fill in all
  of them, unassigned options fall back to the product's main image: the buyer
  always sees something coherent, and the positions stay aligned.

  When the seller assigned nothing, `images` stays empty and the detail page
  falls back to the gallery on its own.
*/
export function buildVariationsPayload({
  axes,
  photoAxis,
  optionImages,
  fallback,
}: {
  axes: VariantAxisDraft[]
  photoAxis: number
  optionImages: Record<string, ProductImage | undefined>
  fallback?: ProductImage | null
}): ProductVariation[] {
  return axes.map((axis, axisIdx) => {
    const base = { name: axis.name.trim(), options: axis.options }
    if (axisIdx !== photoAxis) return { ...base, images: [] }

    const picked = axis.options.map(
      (_, optIdx) => optionImages[optionImageKey(axisIdx, optIdx)],
    )
    if (picked.every((img) => !img)) return { ...base, images: [] }

    const filler = fallback ?? picked.find(Boolean)!
    return { ...base, images: picked.map((img) => img ?? filler) }
  })
}
