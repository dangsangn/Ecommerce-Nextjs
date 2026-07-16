import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { toPriceString } from '@/lib/products/price'
import { cartSubtotal } from '@/lib/cart/summary'
import { clearCartAction } from '@/actions/cart.actions'
import { CartLine } from '@/components/store/cart-line'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Cart } from '@/types/cart'

export default async function CartPage() {
  let cart: Cart = { cart_products: [], cart_count_product: 0 }
  let error: string | null = null
  try {
    cart = await apiFetch<Cart>('/cart', { auth: true })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load your cart'
  }

  const items = cart.cart_products ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Your cart is empty. <Link href="/" className="text-primary hover:underline">Browse products</Link>
        </p>
      ) : (
        <div className="space-y-6">
          <div>
            {items.map((p) => (
              <CartLine key={p.productId} product={p} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <form action={clearCartAction}>
              <Button type="submit" variant="ghost">Clear cart</Button>
            </form>
            <div className="flex flex-col items-end gap-2 text-right">
              <div>
                <p className="text-sm text-muted-foreground">Subtotal</p>
                <p className="text-xl font-semibold tabular-nums">{toPriceString(cartSubtotal(items))}</p>
              </div>
              <Link href="/checkout" className={buttonVariants()}>Proceed to checkout</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
