import { describe, it, expect } from 'vitest'
import { createDiscountSchema } from '@/lib/validations/discount'

const base = {
  discount_name: 'Summer', discount_description: 'Sale', discount_code: 'SUMMER',
  discount_start_date: '2026-08-01', discount_end_date: '2026-08-31',
  discount_applies_to: 'all',
}

describe('createDiscountSchema', () => {
  it('accepts a valid fixed_amount discount', () => {
    const r = createDiscountSchema.safeParse({ ...base, discount_type: 'fixed_amount', discount_value: '10' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.discount_value).toBe(10)
  })
  it('accepts a valid percentage (<=100)', () => {
    expect(createDiscountSchema.safeParse({ ...base, discount_type: 'percentage', discount_value: '25' }).success).toBe(true)
  })
  it('rejects a percentage over 100', () => {
    expect(createDiscountSchema.safeParse({ ...base, discount_type: 'percentage', discount_value: '150' }).success).toBe(false)
  })
  it('rejects end <= start', () => {
    expect(createDiscountSchema.safeParse({ ...base, discount_type: 'fixed_amount', discount_value: '10', discount_end_date: '2026-08-01' }).success).toBe(false)
  })
  it('requires product ids when applies_to is specific_products', () => {
    expect(createDiscountSchema.safeParse({ ...base, discount_type: 'fixed_amount', discount_value: '10', discount_applies_to: 'specific_products' }).success).toBe(false)
    expect(createDiscountSchema.safeParse({ ...base, discount_type: 'fixed_amount', discount_value: '10', discount_applies_to: 'specific_products', discount_product_ids: 'a,b' }).success).toBe(true)
  })
})
