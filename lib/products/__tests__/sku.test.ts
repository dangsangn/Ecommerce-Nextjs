import { describe, it, expect } from 'vitest'
import {
  buildVariationsPayload,
  cartesianTiers,
  defaultSku,
  findSkuByTier,
  isOptionSelectable,
  normalizeProductDetail,
  optionImageFor,
  optionImageKey,
  priceRange,
  resolveSku,
  tierKey,
  toggleOption,
  totalStock,
  variantLabel,
} from '@/lib/products/sku'
import type { Product, ProductVariation, Sku } from '@/types/product'

const variations: ProductVariation[] = [
  { name: 'Color', options: ['Red', 'Blue'] },
  { name: 'Size', options: ['S', 'M', 'L'] },
]

// A deliberately SPARSE matrix: Blue/L was never stocked, Red/L is sold out.
const sku = (tier: number[], price: number, stock: number, isDefault = false): Sku => ({
  _id: `id-${tier.join('')}`,
  sku_code: `p-${tier.join('-')}`,
  sku_product_id: 'p',
  sku_tier_idx: tier,
  sku_price: price,
  sku_default: isDefault,
  stock,
})

const skus: Sku[] = [
  sku([0, 0], 199, 5, true),
  sku([0, 1], 199, 2),
  sku([0, 2], 219, 0), // Red / L — sold out
  sku([1, 0], 209, 7),
  sku([1, 1], 209, 1),
  // Blue / L absent — the shop never stocked it
]

const spu: Product = {
  _id: 'p',
  product_name: 'Tee',
  product_thumb: 't.jpg',
  product_images: [],
  product_price: 199,
  product_quantity: 15,
  product_type: 'CLOTHING',
  product_variations: variations,
  product_price_min: 199,
  product_price_max: 219,
  product_sku_count: 5,
}

describe('normalizeProductDetail', () => {
  it('passes { spu, skus } through', () => {
    const r = normalizeProductDetail({ spu, skus })
    expect(r?.spu._id).toBe('p')
    expect(r?.skus).toHaveLength(5)
  })

  it('folds a pre-split flat product into one implicit SKU', () => {
    const flat: Product = { ...spu, product_variations: undefined }
    const r = normalizeProductDetail(flat)
    expect(r?.skus).toHaveLength(1)
    expect(r?.skus[0].sku_tier_idx).toEqual([])
    expect(r?.skus[0].stock).toBe(15)
    expect(r?.skus[0].sku_default).toBe(true)
  })

  it('leaves the implicit SKU id empty so it is never posted back', () => {
    const r = normalizeProductDetail({ ...spu, product_variations: undefined })
    expect(r?.skus[0]._id).toBe('')
  })

  it('tolerates a { spu } response with no skus array', () => {
    expect(normalizeProductDetail({ spu })?.skus).toEqual([])
  })

  it('returns null for junk', () => {
    expect(normalizeProductDetail(null)).toBeNull()
    expect(normalizeProductDetail({})).toBeNull()
  })
})

describe('tierKey / findSkuByTier / resolveSku', () => {
  it('keys a cell by its coordinates', () => {
    expect(tierKey([0, 1])).toBe('0-1')
    expect(tierKey([])).toBe('')
  })
  it('finds an existing cell', () => {
    expect(findSkuByTier(skus, [1, 1])?._id).toBe('id-11')
  })
  it('returns undefined for a cell with no SKU', () => {
    expect(findSkuByTier(skus, [1, 2])).toBeUndefined()
  })
  it('resolves only once every axis is picked', () => {
    expect(resolveSku(skus, [0, null])).toBeUndefined()
    expect(resolveSku(skus, [0, 1])?._id).toBe('id-01')
  })
})

describe('defaultSku', () => {
  it('prefers the flagged SKU', () => {
    expect(defaultSku(skus)?._id).toBe('id-00')
  })
  it('falls back to the first when none is flagged', () => {
    expect(defaultSku([sku([1, 0], 1, 1), sku([0, 0], 1, 1)])?._id).toBe('id-10')
  })
  it('handles an empty list', () => {
    expect(defaultSku([])).toBeUndefined()
  })
})

describe('isOptionSelectable', () => {
  it('offers an option that has an in-stock SKU', () => {
    expect(isOptionSelectable(skus, [null, null], 0, 0)).toBe(true)
  })
  it('hides a size the picked colour never came in', () => {
    // Blue picked → L has no SKU at all
    expect(isOptionSelectable(skus, [1, null], 1, 2)).toBe(false)
  })
  it('hides a sold-out cell the same way as a missing one', () => {
    // Red picked → Red/L exists but stock is 0
    expect(isOptionSelectable(skus, [0, null], 1, 2)).toBe(false)
  })
  it('ignores the axis being tested when judging the others', () => {
    // Size L picked; Red is still offered because Red/L is a real cell —
    // stock is what rules it out, not the pairing.
    expect(isOptionSelectable(skus, [null, 0], 0, 1)).toBe(true)
  })
  it('re-widens once a conflicting pick is cleared', () => {
    expect(isOptionSelectable(skus, [1, null], 1, 1)).toBe(true)
  })
})

describe('toggleOption', () => {
  it('picks an option', () => {
    expect(toggleOption([null, null], 0, 1)).toEqual([1, null])
  })
  it('clears it when picked again, so no selection can deadlock', () => {
    expect(toggleOption([1, 0], 0, 1)).toEqual([null, 0])
  })
})

describe('variantLabel', () => {
  it('joins the picked option names', () => {
    expect(variantLabel(variations, [1, 2])).toBe('Blue / L')
  })
  it('is empty for a product with no variants', () => {
    expect(variantLabel(variations, [])).toBe('')
  })
})

describe('priceRange', () => {
  it('prefers the range stored on the SPU', () => {
    expect(priceRange(spu, skus)).toEqual({ min: 199, max: 219 })
  })
  it('derives from the SKUs when the SPU has no stored range', () => {
    const legacy = { ...spu, product_price_min: undefined, product_price_max: undefined }
    expect(priceRange(legacy, skus)).toEqual({ min: 199, max: 219 })
  })
  it('falls back to the single product price when neither is available', () => {
    const legacy = { ...spu, product_price_min: undefined, product_price_max: undefined }
    expect(priceRange(legacy, [])).toEqual({ min: 199, max: 199 })
  })
  it('reads Decimal128 JSON', () => {
    const decimal = {
      ...spu,
      product_price_min: { $numberDecimal: '10.5' },
      product_price_max: { $numberDecimal: '20' },
    }
    expect(priceRange(decimal)).toEqual({ min: 10.5, max: 20 })
  })
})

describe('totalStock', () => {
  it('sums stock across the matrix', () => {
    expect(totalStock(skus)).toBe(15)
  })
  it('treats a missing stock field as zero', () => {
    expect(totalStock([{ ...sku([0], 1, 0), stock: undefined }])).toBe(0)
  })
})

describe('cartesianTiers', () => {
  it('enumerates every cell of the grid', () => {
    expect(cartesianTiers(variations)).toHaveLength(6)
    expect(cartesianTiers(variations)[0]).toEqual([0, 0])
    expect(cartesianTiers(variations)[5]).toEqual([1, 2])
  })
  it('returns nothing when there are no axes', () => {
    expect(cartesianTiers([])).toEqual([])
  })
  it('handles a single axis', () => {
    expect(cartesianTiers([{ name: 'Size', options: ['S', 'M'] }])).toEqual([[0], [1]])
  })
})

describe('optionImageFor', () => {
  const red = { url: 'red.jpg', public_id: 'p/red' }
  const blue = { url: 'blue.jpg', public_id: 'p/blue' }
  const withPhotos: ProductVariation[] = [
    { name: 'Color', options: ['Red', 'Blue'], images: [red, blue] },
    { name: 'Size', options: ['S', 'M', 'L'], images: [] },
  ]

  it('returns the photo of the picked colour', () => {
    expect(optionImageFor(withPhotos, [0, 1])).toBe('red.jpg')
    expect(optionImageFor(withPhotos, [1, 1])).toBe('blue.jpg')
  })
  it('ignores the size axis, which carries no photos', () => {
    expect(optionImageFor(withPhotos, [null, 2])).toBeUndefined()
  })
  it('answers as soon as the photo axis is picked', () => {
    expect(optionImageFor(withPhotos, [1, null])).toBe('blue.jpg')
  })
  it('falls through when the seller put photos on the second axis', () => {
    const onSecond: ProductVariation[] = [
      { name: 'Size', options: ['S', 'M'], images: [] },
      { name: 'Color', options: ['Red', 'Blue'], images: [red, blue] },
    ]
    expect(optionImageFor(onSecond, [0, 1])).toBe('blue.jpg')
  })
  it('returns nothing when no axis has photos', () => {
    expect(optionImageFor(variations, [0, 0])).toBeUndefined()
  })
})

describe('buildVariationsPayload', () => {
  const axes = [
    { name: 'Color', options: ['Red', 'Blue'] },
    { name: 'Size', options: ['S', 'M'] },
  ]
  const red = { url: 'red.jpg', public_id: 'p/red' }
  const blue = { url: 'blue.jpg', public_id: 'p/blue' }
  const thumb = { url: 'main.jpg', public_id: 'p/main' }

  it('attaches photos to the chosen axis only', () => {
    const out = buildVariationsPayload({
      axes,
      photoAxis: 0,
      optionImages: { [optionImageKey(0, 0)]: red, [optionImageKey(0, 1)]: blue },
      fallback: thumb,
    })
    expect(out[0].images).toEqual([red, blue])
    expect(out[1].images).toEqual([])
  })

  it('keeps positions aligned by filling gaps with the main image', () => {
    // Only the second option got a photo — without a filler, blue would land on
    // index 0 and show up as Red.
    const out = buildVariationsPayload({
      axes,
      photoAxis: 0,
      optionImages: { [optionImageKey(0, 1)]: blue },
      fallback: thumb,
    })
    expect(out[0].images).toEqual([thumb, blue])
  })

  it('uses an assigned photo as the filler when there is no main image yet', () => {
    const out = buildVariationsPayload({
      axes,
      photoAxis: 0,
      optionImages: { [optionImageKey(0, 1)]: blue },
      fallback: null,
    })
    expect(out[0].images).toEqual([blue, blue])
  })

  it('emits no images at all when the seller assigned none', () => {
    const out = buildVariationsPayload({
      axes, photoAxis: 0, optionImages: {}, fallback: thumb,
    })
    expect(out.every((a) => a.images!.length === 0)).toBe(true)
  })

  it('emits no images when the photo axis is not a completed axis', () => {
    const out = buildVariationsPayload({
      axes,
      photoAxis: -1,
      optionImages: { [optionImageKey(0, 0)]: red },
      fallback: thumb,
    })
    expect(out.every((a) => a.images!.length === 0)).toBe(true)
  })

  it('trims axis names', () => {
    const out = buildVariationsPayload({
      axes: [{ name: '  Color  ', options: ['Red'] }],
      photoAxis: 0, optionImages: {}, fallback: null,
    })
    expect(out[0].name).toBe('Color')
  })
})
