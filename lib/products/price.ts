import type { Decimal } from '@/types/product'

// Backend serializes product_price from Mongo Decimal128 as a number, a string,
// or { $numberDecimal: "9.99" }. Normalize any of them to a fixed-2 display string.
export function toPriceString(value: Decimal): string {
  let n: number
  if (typeof value === 'number') n = value
  else if (typeof value === 'string') n = Number(value)
  else if (value && typeof value === 'object' && '$numberDecimal' in value)
    n = Number(value.$numberDecimal)
  else n = NaN
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}

// Numeric coercion for math (line totals, subtotals). Mirrors toPriceString's parsing.
export function toPriceNumber(value: Decimal): number {
  let n: number
  if (typeof value === 'number') n = value
  else if (typeof value === 'string') n = Number(value)
  else if (value && typeof value === 'object' && '$numberDecimal' in value)
    n = Number(value.$numberDecimal)
  else n = NaN
  return Number.isFinite(n) ? n : 0
}
