import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { buildShopOrders } from '@/lib/checkout/build-shop-orders'
import { CheckoutWizard } from '@/components/store/checkout-wizard'
import type { Cart } from '@/types/cart'
import type { CheckoutReview } from '@/types/order'

export default async function CheckoutPage() {
  let cart: Cart = { cart_products: [], cart_count_product: 0 }
  try {
    cart = await apiFetch<Cart>('/cart', { auth: true })
  } catch (e) {
    return <p className="text-sm text-destructive">{e instanceof Error ? e.message : 'Could not load your cart'}</p>
  }

  const items = cart.cart_products ?? []
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Your cart is empty. <Link href="/" className="text-primary hover:underline">Browse products</Link>
      </p>
    )
  }

  const shopOrderIds = buildShopOrders(items)
  let review: CheckoutReview
  try {
    review = await apiFetch<CheckoutReview>('/checkout/review', { auth: true, body: { shop_order_ids: shopOrderIds } })
  } catch (e) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="text-sm text-destructive">{e instanceof Error ? e.message : 'Could not review your order'}</p>
        <Link href="/cart" className="text-sm text-primary hover:underline">← Back to cart</Link>
      </div>
    )
  }

  const lines = review.shop_order_ids_new.flatMap((s) => s.item_products)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Checkout</h1>
      <CheckoutWizard shopOrderIds={shopOrderIds} review={review.checkout_order} lines={lines} />
    </div>
  )
}
