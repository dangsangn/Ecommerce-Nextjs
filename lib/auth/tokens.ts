import type { JwtPayload } from '@/types/api'

export const COOKIE = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  CLIENT: 'client_id',
} as const

export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload
  } catch {
    return null
  }
}

export function isExpiringSoon(
  payload: JwtPayload | null,
  nowMs: number,
  skewSeconds = 60,
): boolean {
  if (!payload?.exp) return true
  return payload.exp * 1000 - nowMs <= skewSeconds * 1000
}

export function hasRole(payload: JwtPayload | null, role: string): boolean {
  return Boolean(payload?.roles?.includes(role))
}
