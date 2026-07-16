import type { Decimal } from '@/types/product'

export interface CartProduct {
  productId: string
  shopId?: string
  name: string
  thumb: string
  price: Decimal
  quantity: number
}

export interface Cart {
  cart_products: CartProduct[]
  cart_count_product: number
  cart_state?: string
}
