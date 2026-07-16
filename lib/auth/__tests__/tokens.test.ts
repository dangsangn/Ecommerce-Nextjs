import { describe, it, expect } from 'vitest'
import { decodeJwt, isExpiringSoon, hasRole } from '@/lib/auth/tokens'
import type { JwtPayload } from '@/types/api'

// Build a fake JWT: header.payload.signature (only the payload matters when decoding)
function fakeJwt(payload: object): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`
}

describe('decodeJwt', () => {
  it('decodes a valid payload', () => {
    const p = { userId: 'u1', email: 'a@b.com', roles: ['shop'], type: 'access', exp: 100, iat: 1 }
    expect(decodeJwt(fakeJwt(p))).toEqual(p)
  })
  it('returns null for a malformed token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull()
    expect(decodeJwt('a.b')).toBeNull()
  })
})

describe('isExpiringSoon', () => {
  const p: JwtPayload = { userId: 'u1', email: 'a@b.com', roles: [], type: 'access', exp: 1000, iat: 0 }
  it('true when under the skew window (60s)', () => {
    // exp=1000s => 1_000_000ms; now=970_000ms => 30s left < 60s
    expect(isExpiringSoon(p, 970_000)).toBe(true)
  })
  it('false when there is plenty of time left', () => {
    expect(isExpiringSoon(p, 900_000)).toBe(false) // 100s left > 60s
  })
  it('true when payload is null or missing exp', () => {
    expect(isExpiringSoon(null, 0)).toBe(true)
  })
})

describe('hasRole', () => {
  it('detects role membership', () => {
    const p: JwtPayload = { userId: 'u', email: 'e', roles: ['user', 'shop'], type: 'access', exp: 1, iat: 1 }
    expect(hasRole(p, 'shop')).toBe(true)
    expect(hasRole(p, 'admin')).toBe(false)
    expect(hasRole(null, 'shop')).toBe(false)
  })
})
