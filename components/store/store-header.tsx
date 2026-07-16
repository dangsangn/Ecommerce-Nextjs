import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { getAccessPayload } from '@/lib/auth/session'
import { apiFetch } from '@/lib/api/server-client'
import { logoutAction } from '@/actions/auth.actions'
import { buttonVariants } from '@/components/ui/button'
import { SearchBox } from '@/components/store/search-box'
import type { Cart } from '@/types/cart'

export async function StoreHeader({ q = '' }: { q?: string }) {
  const payload = await getAccessPayload()
  const isShop = Boolean(payload?.roles?.includes('shop'))
  let cartCount = 0
  if (payload) {
    try {
      const cart = await apiFetch<Cart>('/cart', { auth: true })
      cartCount = cart.cart_count_product ?? 0
    } catch {
      cartCount = 0
    }
  }
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold">SHOP</Link>
        <div className="flex-1">
          <SearchBox defaultValue={q} />
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/cart" aria-label="Cart" className="relative text-muted-foreground hover:text-foreground">
            <ShoppingCart className="size-5" />
            {cartCount > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {cartCount}
              </span>
            ) : null}
          </Link>
          {payload ? (
            <>
              {isShop ? (
                <Link href="/seller" className="text-muted-foreground hover:text-foreground">Seller dashboard</Link>
              ) : null}
              <span className="hidden text-muted-foreground sm:inline">{payload.email}</span>
              <form action={logoutAction}>
                <button type="submit" className="text-muted-foreground hover:text-foreground">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: 'outline' })}>Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
