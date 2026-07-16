import { describe, it, expect } from 'vitest'
import { buildShopOrders } from '@/lib/checkout/build-shop-orders'
import type { CartProduct } from '@/types/cart'

const p = (over: Partial<CartProduct>): CartProduct => ({
  productId: 'p', shopId: 's1', name: 'n', thumb: '', price: 10, quantity: 1, ...over,
})

describe('buildShopOrders', () => {
  it('groups items by shopId', () => {
    const out = buildShopOrders([
      p({ productId: 'a', shopId: 's1', price: 10, quantity: 2 }),
      p({ productId: 'b', shopId: 's1', price: 5, quantity: 1 }),
      p({ productId: 'c', shopId: 's2', price: 7, quantity: 3 }),
    ])
    expect(out).toHaveLength(2)
    const s1 = out.find((s) => s.shopId === 's1')!
    expect(s1.item_products).toHaveLength(2)
    expect(s1.shop_discounts).toEqual([])
    expect(s1.item_products[0]).toEqual({ productId: 'a', quantity: 2, price: 10 })
  })
  it('coerces Decimal128 price to a number', () => {
    const out = buildShopOrders([p({ productId: 'a', price: { $numberDecimal: '9.99' }, quantity: 1 })])
    expect(out[0].item_products[0].price).toBeCloseTo(9.99, 2)
  })
  it('returns [] for an empty cart', () => {
    expect(buildShopOrders([])).toEqual([])
  })
})
