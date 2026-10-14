import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Your cart</h1>
      {error ? (
        <p className="rounded-2xl bg-card p-6 text-sm text-destructive shadow-sm">{error}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-16 text-center shadow-sm">
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
            <ShoppingCart className="size-8" />
          </span>
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Link href="/" className={cn(buttonVariants(), 'h-10 rounded-xl px-6')}>Browse products</Link>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl bg-card px-4 shadow-sm sm:px-6">
            {items.map((p) => (
              <CartLine key={p.productId} product={p} />
            ))}
          </div>
          <aside className="space-y-4 rounded-2xl bg-card p-5 shadow-sm lg:sticky lg:top-24">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-2xl font-extrabold text-brand tabular-nums">{toPriceString(cartSubtotal(items))}</span>
            </div>
            <Link
              href="/checkout"
              className={cn(buttonVariants(), 'h-12 w-full rounded-xl text-base font-bold uppercase')}
            >
              Proceed to checkout
            </Link>
            <form action={clearCartAction}>
              <Button type="submit" variant="ghost" className="w-full text-muted-foreground">Clear cart</Button>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
