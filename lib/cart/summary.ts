import { toPriceNumber } from '@/lib/products/price'
import type { CartProduct } from '@/types/cart'

export function cartSubtotal(products: CartProduct[]): number {
  return products.reduce((sum, p) => sum + toPriceNumber(p.price) * p.quantity, 0)
}
