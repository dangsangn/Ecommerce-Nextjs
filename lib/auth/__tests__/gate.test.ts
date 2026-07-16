import { describe, it, expect } from 'vitest'
import { shouldGateShop } from '@/lib/auth/gate'

describe('shouldGateShop', () => {
  it('does not gate paths outside /seller', () => {
    expect(shouldGateShop('/login', [])).toBe(false)
    expect(shouldGateShop('/', undefined)).toBe(false)
  })
  it('never gates /seller/account (upgrade must stay reachable)', () => {
    expect(shouldGateShop('/seller/account', [])).toBe(false)
    expect(shouldGateShop('/seller/account/anything', [])).toBe(false)
  })
  it('gates /seller for a logged-in non-shop', () => {
    expect(shouldGateShop('/seller', ['user'])).toBe(true)
    expect(shouldGateShop('/seller/products', undefined)).toBe(true)
  })
  it('allows /seller for a shop', () => {
    expect(shouldGateShop('/seller', ['user', 'shop'])).toBe(false)
    expect(shouldGateShop('/seller/products', ['shop'])).toBe(false)
  })
})
