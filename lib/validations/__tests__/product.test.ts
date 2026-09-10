import { describe, it, expect } from 'vitest'
import {
  parseVariantPayload,
  parseVariationsPayload,
  productDetailsSchema,
  splitAttributes,
} from '@/lib/validations/product'

const base = { product_name: 'Tee' }

describe('productDetailsSchema', () => {
  it('accepts clothing with only the shared attributes', () => {
    const r = productDetailsSchema.safeParse({
      ...base,
      product_type: 'CLOTHING',
      brand: 'Acme',
    })
    expect(r.success).toBe(true)
  })
  it('requires a clothing brand', () => {
    expect(
      productDetailsSchema.safeParse({ ...base, product_type: 'CLOTHING' }).success,
    ).toBe(false)
  })
  it('no longer requires color and size — they are variation axes now', () => {
    const r = productDetailsSchema.safeParse({
      ...base,
      product_type: 'CLOTHING',
      brand: 'Acme',
    })
    expect(r.success).toBe(true)
  })
  it('still carries legacy color/size through when a product has them', () => {
    const r = productDetailsSchema.safeParse({
      ...base,
      product_type: 'CLOTHING',
      brand: 'Acme',
      color: 'Red',
      size: 'M',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(splitAttributes(r.data).product_attributes).toEqual({
        brand: 'Acme',
        color: 'Red',
        size: 'M',
      })
    }
  })
  it('accepts valid electronics (manufacturer required, model optional)', () => {
    expect(
      productDetailsSchema.safeParse({
        ...base,
        product_type: 'ELECTRONICS',
        manufacturer: 'Sony',
      }).success,
    ).toBe(true)
  })
  it('requires electronics manufacturer', () => {
    expect(
      productDetailsSchema.safeParse({ ...base, product_type: 'ELECTRONICS' }).success,
    ).toBe(false)
  })
  it('rejects a non-creatable type', () => {
    expect(
      productDetailsSchema.safeParse({ ...base, product_type: 'SHOES' }).success,
    ).toBe(false)
  })
  it('no longer carries a price — it lives on the SKU', () => {
    const r = productDetailsSchema.safeParse({
      ...base,
      product_type: 'ELECTRONICS',
      manufacturer: 'Sony',
      product_price: '9.99',
    })
    expect(r.success).toBe(true)
    if (r.success) expect('product_price' in r.data).toBe(false)
  })
})

describe('parseVariantPayload', () => {
  const twoAxes = JSON.stringify([
    { name: 'Color', options: ['Red', 'Blue'] },
    { name: 'Size', options: ['S', 'M'] },
  ])

  it('accepts a product with no variations and one SKU', () => {
    const r = parseVariantPayload(
      '[]',
      JSON.stringify([{ sku_tier_idx: [], sku_price: 9.99, sku_stock: 5, sku_default: true }]),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.sku_list).toHaveLength(1)
  })

  it('accepts a sparse matrix — not every cell needs a SKU', () => {
    const r = parseVariantPayload(
      twoAxes,
      JSON.stringify([
        { sku_tier_idx: [0, 0], sku_price: 9, sku_stock: 1, sku_default: true },
        { sku_tier_idx: [1, 1], sku_price: 12, sku_stock: 0 },
      ]),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.sku_list).toHaveLength(2)
  })

  it('coerces the numeric strings the form inputs produce', () => {
    const r = parseVariantPayload(
      '[]',
      JSON.stringify([{ sku_tier_idx: [], sku_price: '9.99', sku_stock: '5' }]),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.sku_list[0].sku_price).toBe(9.99)
      expect(r.data.sku_list[0].sku_stock).toBe(5)
    }
  })

  it('rejects a coordinate outside the axis bounds', () => {
    const r = parseVariantPayload(
      twoAxes,
      JSON.stringify([{ sku_tier_idx: [0, 5], sku_price: 9, sku_stock: 1 }]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/no longer exists/)
  })

  it('rejects a coordinate with the wrong number of axes', () => {
    const r = parseVariantPayload(
      twoAxes,
      JSON.stringify([{ sku_tier_idx: [0], sku_price: 9, sku_stock: 1 }]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/does not match/)
  })

  it('rejects two SKUs on the same cell', () => {
    const r = parseVariantPayload(
      twoAxes,
      JSON.stringify([
        { sku_tier_idx: [0, 0], sku_price: 9, sku_stock: 1 },
        { sku_tier_idx: [0, 0], sku_price: 12, sku_stock: 1 },
      ]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Duplicate/)
  })

  it('rejects duplicate options on one axis', () => {
    const r = parseVariantPayload(
      JSON.stringify([{ name: 'Color', options: ['Red', 'red'] }]),
      JSON.stringify([{ sku_tier_idx: [0], sku_price: 9, sku_stock: 1 }]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/duplicate options/)
  })

  it('rejects more than three axes', () => {
    const four = JSON.stringify(
      ['A', 'B', 'C', 'D'].map((n) => ({ name: n, options: ['x'] })),
    )
    const r = parseVariantPayload(
      four,
      JSON.stringify([{ sku_tier_idx: [0, 0, 0, 0], sku_price: 9, sku_stock: 1 }]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/At most 3/)
  })

  it('rejects more than one default', () => {
    const r = parseVariantPayload(
      twoAxes,
      JSON.stringify([
        { sku_tier_idx: [0, 0], sku_price: 9, sku_stock: 1, sku_default: true },
        { sku_tier_idx: [1, 1], sku_price: 9, sku_stock: 1, sku_default: true },
      ]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Only one variant/)
  })

  it('rejects a product with no SKU at all', () => {
    expect(parseVariantPayload('[]', '[]').ok).toBe(false)
  })

  it('rejects a zero price', () => {
    const r = parseVariantPayload(
      '[]',
      JSON.stringify([{ sku_tier_idx: [], sku_price: 0, sku_stock: 1 }]),
    )
    expect(r.ok).toBe(false)
  })

  it('reports unreadable JSON instead of throwing', () => {
    const r = parseVariantPayload('[', '[]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Could not read/)
  })
})

describe('parseVariationsPayload', () => {
  // The matrix as stored: Color has 2 options, Size has 3.
  const shape = [{ options: 2 }, { options: 3 }]
  const red = { url: 'red.jpg', public_id: 'p/red' }
  const blue = { url: 'blue.jpg', public_id: 'p/blue' }
  const axes = (over: object = {}) =>
    JSON.stringify([
      { name: 'Color', options: ['Red', 'Blue'], images: [red, blue], ...over },
      { name: 'Size', options: ['S', 'M', 'L'], images: [] },
    ])

  it('accepts renames and photo changes', () => {
    const r = parseVariationsPayload(axes(), shape)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data[0].images).toEqual([red, blue])
  })

  it('accepts renaming an option — SKUs refer to it by position', () => {
    const r = parseVariationsPayload(
      axes({ options: ['Crimson', 'Navy'] }),
      shape,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data[0].options).toEqual(['Crimson', 'Navy'])
  })

  it('refuses adding an option, which would repoint existing SKUs', () => {
    const r = parseVariationsPayload(
      axes({ options: ['Red', 'Blue', 'Green'], images: [red, blue, red] }),
      shape,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/cannot be added or removed/)
  })

  it('refuses removing an axis', () => {
    const r = parseVariationsPayload(
      JSON.stringify([{ name: 'Color', options: ['Red', 'Blue'], images: [] }]),
      shape,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Variations cannot be added or removed/)
  })

  it('refuses a photo array that does not cover every option', () => {
    const r = parseVariationsPayload(axes({ images: [red] }), shape)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/photo for every option/)
  })

  it('refuses duplicate option names', () => {
    const r = parseVariationsPayload(
      axes({ options: ['Red', 'red'], images: [] }),
      shape,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/duplicate options/)
  })

  it('refuses a blank option name', () => {
    const r = parseVariationsPayload(
      axes({ options: ['Red', '  '], images: [] }),
      shape,
    )
    expect(r.ok).toBe(false)
  })

  it('reports unreadable JSON instead of throwing', () => {
    const r = parseVariationsPayload('{oops', shape)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Could not read/)
  })
})
