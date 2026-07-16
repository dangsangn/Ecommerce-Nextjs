import { NextRequest, NextResponse } from 'next/server'
import { COOKIE, decodeJwt, isExpiringSoon } from '@/lib/auth/tokens'
import { shouldGateShop } from '@/lib/auth/gate'
import type { Tokens } from '@/types/api'

const TWO_DAYS = 60 * 60 * 24 * 2
const SEVEN_DAYS = 60 * 60 * 24 * 7

async function refreshTokens(clientId: string, refresh: string): Promise<Tokens | null> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/v1/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.API_KEY!,
        'x-client-id': clientId,
        'x-refresh-token': refresh,
      },
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data?.tokens ?? null) as Tokens | null
  } catch {
    return null
  }
}

function writeCookies(res: NextResponse, tokens: Tokens, clientId: string) {
  const secure = process.env.NODE_ENV === 'production'
  const common = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' }
  res.cookies.set(COOKIE.ACCESS, tokens.accessToken, { ...common, maxAge: TWO_DAYS })
  res.cookies.set(COOKIE.REFRESH, tokens.refreshToken, { ...common, maxAge: SEVEN_DAYS })
  res.cookies.set(COOKIE.CLIENT, clientId, { ...common, maxAge: SEVEN_DAYS })
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = new URL('/login', req.url)
  url.searchParams.set('redirect', req.nextUrl.pathname)
  const res = NextResponse.redirect(url)
  res.cookies.delete(COOKIE.ACCESS)
  res.cookies.delete(COOKIE.REFRESH)
  res.cookies.delete(COOKIE.CLIENT)
  return res
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const access = req.cookies.get(COOKIE.ACCESS)?.value
  const refresh = req.cookies.get(COOKIE.REFRESH)?.value
  const clientId = req.cookies.get(COOKIE.CLIENT)?.value

  if (!clientId) return redirectToLogin(req)

  let payload = access ? decodeJwt(access) : null
  const res = NextResponse.next()

  // Refresh proactively when the access token is expiring/expired and a refresh token is present.
  if (refresh && isExpiringSoon(payload, Date.now())) {
    const tokens = await refreshTokens(clientId, refresh)
    if (!tokens) return redirectToLogin(req)
    writeCookies(res, tokens, clientId)
    payload = decodeJwt(tokens.accessToken)
  }

  if (!payload) return redirectToLogin(req)

  // Role-gate: non-shops may only reach /seller/account (to upgrade).
  // Runs AFTER refresh so a just-upgraded user is judged by fresh roles.
  if (shouldGateShop(req.nextUrl.pathname, payload.roles)) {
    return NextResponse.redirect(new URL('/seller/account', req.url))
  }

  return res
}

export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
