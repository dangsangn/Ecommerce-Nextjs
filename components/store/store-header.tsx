import Link from 'next/link'
import { LogOut, Package, ShoppingCart, Store, UserRound } from 'lucide-react'
import { getAccessPayload } from '@/lib/auth/session'
import { apiFetch } from '@/lib/api/server-client'
import { logoutAction } from '@/actions/auth.actions'
import { SearchBox } from '@/components/store/search-box'
import type { Cart } from '@/types/cart'

// Translucent white pill on the red bar — the CellphoneS header button style.
const pill =
  'inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm font-medium text-white transition-colors hover:bg-white/25'

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
    <header className="sticky top-0 z-40 bg-brand shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5 md:flex-nowrap md:gap-3">
        <Link href="/" className="mr-1 text-2xl font-extrabold tracking-tight text-white">
          SHOP
        </Link>
        <div className="order-last w-full md:order-0 md:flex-1">
          <SearchBox defaultValue={q} />
        </div>
        <nav className="ml-auto flex items-center gap-2">
          <Link href="/cart" aria-label="Cart" className={pill}>
            <span className="relative">
              <ShoppingCart className="size-5" />
              {cartCount > 0 ? (
                <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand">
                  {cartCount}
                </span>
              ) : null}
            </span>
            <span className="hidden lg:inline">Cart</span>
          </Link>
          {payload ? (
            <>
              <Link href={isShop ? '/seller' : '/seller/account'} className={pill}>
                <Store className="size-5" />
                <span className="hidden lg:inline">{isShop ? 'Seller Centre' : 'Start Selling'}</span>
              </Link>
              <Link href="/orders" className={pill}>
                <Package className="size-5" />
                <span className="hidden lg:inline">Orders</span>
              </Link>
              <div className={`${pill} hidden pr-1 hover:bg-white/15 xl:inline-flex`}>
                <UserRound className="size-5" />
                <span className="max-w-40 truncate">{payload.email}</span>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    aria-label="Sign out"
                    className="flex size-8 items-center justify-center rounded-lg hover:bg-white/20"
                  >
                    <LogOut className="size-4" />
                  </button>
                </form>
              </div>
              <form action={logoutAction} className="xl:hidden">
                <button type="submit" aria-label="Sign out" className={pill}>
                  <LogOut className="size-5" />
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className={`${pill} bg-white text-brand hover:bg-white/90`}>
              <UserRound className="size-5" />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
