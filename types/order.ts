import type { Decimal } from '@/types/product'

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'failed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// Sent to the backend (grouped by shop).
export interface ShopOrderItem {
  shopId: string
  shop_discounts: { code: string; shopId: string }[]
  item_products: { productId: string; quantity: number; price: number }[]
}

// A validated product snapshot returned by review / stored on the order.
export interface OrderProduct {
  productId: string
  price: Decimal
  quantity: number
  name: string
  thumb: string
}

export interface ShopOrderNew {
  shopId: string
  shop_discounts?: { code: string; shopId: string }[]
  item_products: OrderProduct[]
  price_raw: number
  price_apply_discount: number
}

export interface CheckoutOrder {
  totalPrice: number
  totalDiscount: number
  feeShip: number
  totalCheckout: number
}

export interface CheckoutReview {
  shop_order_ids_new: ShopOrderNew[]
  checkout_order: CheckoutOrder
}

export interface Order {
  _id: string
  order_checkout: CheckoutOrder
  order_shipping?: { street?: string; city?: string; state?: string; country?: string }
  order_payment?: { method?: string }
  order_products: ShopOrderNew[]
  order_status: OrderStatus
  createdAt?: string
}
