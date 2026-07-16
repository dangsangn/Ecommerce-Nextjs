import { toPriceNumber } from '@/lib/products/price'
import type { CartProduct } from '@/types/cart'
import type { ShopOrderItem } from '@/types/order'

export function buildShopOrders(products: CartProduct[]): ShopOrderItem[] {
  const byShop = new Map<string, ShopOrderItem>()
  for (const p of products) {
    const shopId = p.shopId ?? ''
    let group = byShop.get(shopId)
    if (!group) {
      group = { shopId, shop_discounts: [], item_products: [] }
      byShop.set(shopId, group)
    }
    group.item_products.push({ productId: p.productId, quantity: p.quantity, price: toPriceNumber(p.price) })
  }
  return [...byShop.values()]
}
