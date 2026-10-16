import { describe, it, expect } from 'vitest'
import { pickClientIp } from '@/lib/api/client-ip'

describe('pickClientIp', () => {
  it('takes the entry the trusted proxy appended, ignoring what the client wrote', () => {
    expect(pickClientIp('9.9.9.9, 1.2.3.4', 1)).toBe('1.2.3.4')
  })
  it('counts hops from the right for chained proxies', () => {
    expect(pickClientIp('9.9.9.9, 1.2.3.4, 10.0.0.1', 2)).toBe('1.2.3.4')
  })
  it('works with an overwriting proxy (single entry)', () => {
    expect(pickClientIp('1.2.3.4', 1)).toBe('1.2.3.4')
  })
  it('trusts nothing when no proxy is configured', () => {
    expect(pickClientIp('1.2.3.4', 0)).toBeUndefined()
  })
  it('returns undefined for a missing or empty header', () => {
    expect(pickClientIp(null, 1)).toBeUndefined()
    expect(pickClientIp('', 1)).toBeUndefined()
  })
  it('returns undefined when there are fewer entries than hops', () => {
    expect(pickClientIp('1.2.3.4', 2)).toBeUndefined()
  })
  it('rejects a non-integer hop count', () => {
    expect(pickClientIp('1.2.3.4', Number('abc'))).toBeUndefined()
  })
})
