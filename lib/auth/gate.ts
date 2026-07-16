// Pure, edge-safe: decide whether a /seller request should be gated for
// lacking the `shop` role. Kept free of server-only / next/headers so proxy.ts
// (Edge runtime) can import it.
export function shouldGateShop(
  pathname: string,
  roles: string[] | undefined,
): boolean {
  if (!pathname.startsWith('/seller')) return false
  if (pathname === '/seller/account' || pathname.startsWith('/seller/account/')) {
    return false
  }
  return !(roles ?? []).includes('shop')
}
