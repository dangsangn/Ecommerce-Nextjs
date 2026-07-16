import 'server-only'
import { cookies } from 'next/headers'
import { COOKIE, decodeJwt } from '@/lib/auth/tokens'
import type { JwtPayload, Tokens } from '@/types/api'

const TWO_DAYS = 60 * 60 * 24 * 2
const SEVEN_DAYS = 60 * 60 * 24 * 7

export async function setSession(tokens: Tokens, clientId: string): Promise<void> {
  const store = await cookies()
  const secure = process.env.NODE_ENV === 'production'
  const common = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' }
  store.set(COOKIE.ACCESS, tokens.accessToken, { ...common, maxAge: TWO_DAYS })
  store.set(COOKIE.REFRESH, tokens.refreshToken, { ...common, maxAge: SEVEN_DAYS })
  store.set(COOKIE.CLIENT, clientId, { ...common, maxAge: SEVEN_DAYS })
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE.ACCESS)
  store.delete(COOKIE.REFRESH)
  store.delete(COOKIE.CLIENT)
}

export async function getAccessPayload(): Promise<JwtPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE.ACCESS)?.value
  return token ? decodeJwt(token) : null
}

export async function getClientId(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(COOKIE.CLIENT)?.value
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(COOKIE.REFRESH)?.value
}

export async function isShop(): Promise<boolean> {
  const payload = await getAccessPayload()
  return Boolean(payload?.roles?.includes('shop'))
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getClientId())
}
