// The end user's IP as seen by the proxies in front of this Next.js server.
//
// Each real proxy APPENDS the address it saw to X-Forwarded-For; everything to
// its left was written by the client and can say anything. So the user's IP is
// the `hops`-th entry from the RIGHT — the same rule as Express `trust proxy`.
//
// hops = 0 means nothing stands in front of Next.js. Next.js then passes a
// client-sent X-Forwarded-For through untouched, so no entry can be trusted and
// we return undefined rather than guess. See
// Ecommerce-NodeJS/docs/22. client-ip-forwarding-guide.md
export function pickClientIp(forwardedFor: string | null, hops: number): string | undefined {
  if (!forwardedFor || !Number.isInteger(hops) || hops < 1) return undefined
  const chain = forwardedFor
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return chain[chain.length - hops] || undefined
}
