import { describe, it, expect } from 'vitest'
import { toPriceString, formatPriceRange } from '@/lib/products/price'

describe('toPriceString', () => {
  it('formats a plain number', () => {
    expect(toPriceString(9.5)).toBe('9.50')
  })
  it('formats a Decimal128 JSON object', () => {
    expect(toPriceString({ $numberDecimal: '9.99' })).toBe('9.99')
  })
  it('formats a numeric string', () => {
    expect(toPriceString('12')).toBe('12.00')
  })
  it('falls back to 0.00 for undefined/garbage', () => {
    expect(toPriceString(undefined as unknown as number)).toBe('0.00')
    expect(toPriceString({} as never)).toBe('0.00')
  })
})

describe('formatPriceRange', () => {
  it('collapses to one price when min equals max', () => {
    expect(formatPriceRange(9.5, 9.5)).toBe('9.50')
  })
  it('shows a range when the SKUs differ', () => {
    expect(formatPriceRange(9.5, 24)).toBe('9.50 – 24.00')
  })
  it('falls back to 0.00 for garbage', () => {
    expect(formatPriceRange(NaN, NaN)).toBe('0.00')
  })
})
