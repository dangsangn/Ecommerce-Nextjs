import { describe, it, expect } from 'vitest'
import { productDetailsSchema } from '@/lib/validations/product'

const base = { product_name: 'Tee', product_price: '9.99', product_quantity: '5' }

describe('productDetailsSchema', () => {
  it('coerces numeric strings and accepts valid clothing', () => {
    const r = productDetailsSchema.safeParse({
      ...base, product_type: 'CLOTHING',
      brand: 'Acme', color: 'Red', size: 'M',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.product_price).toBe(9.99)
      expect(r.data.product_quantity).toBe(5)
    }
  })
  it('requires clothing brand/color/size', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'CLOTHING', brand: 'Acme' }).success).toBe(false)
  })
  it('accepts valid electronics (manufacturer required, model optional)', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'ELECTRONICS', manufacturer: 'Sony' }).success).toBe(true)
  })
  it('requires electronics manufacturer', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'ELECTRONICS' }).success).toBe(false)
  })
  it('rejects a non-positive price', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_price: '0', product_type: 'ELECTRONICS', manufacturer: 'Sony' }).success).toBe(false)
  })
  it('rejects a non-creatable type', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'SHOES' }).success).toBe(false)
  })
})
