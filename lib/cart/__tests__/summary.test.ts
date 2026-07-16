import { describe, it, expect } from 'vitest'
import { cartSubtotal } from '@/lib/cart/summary'

describe('cartSubtotal', () => {
  it('sums price * quantity', () => {
    expect(cartSubtotal([
      { productId: 'a', name: 'A', thumb: '', price: 10, quantity: 2 },
      { productId: 'b', name: 'B', thumb: '', price: 5.5, quantity: 1 },
    ])).toBe(25.5)
  })
  it('handles Decimal128 prices', () => {
    expect(cartSubtotal([
      { productId: 'a', name: 'A', thumb: '', price: { $numberDecimal: '9.99' }, quantity: 3 },
    ])).toBeCloseTo(29.97, 2)
  })
  it('returns 0 for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0)
  })
})
