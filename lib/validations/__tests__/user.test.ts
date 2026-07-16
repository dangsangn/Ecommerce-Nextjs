import { describe, it, expect } from 'vitest'
import { upgradeShopSchema } from '@/lib/validations/user'

describe('upgradeShopSchema', () => {
  it('accepts an omitted shopName (backend defaults to user name)', () => {
    expect(upgradeShopSchema.safeParse({}).success).toBe(true)
  })
  it('accepts an empty shopName', () => {
    expect(upgradeShopSchema.safeParse({ shopName: '' }).success).toBe(true)
  })
  it('accepts a valid shopName', () => {
    const r = upgradeShopSchema.safeParse({ shopName: 'My Store' })
    expect(r.success).toBe(true)
  })
  it('rejects a shopName over 100 chars', () => {
    expect(upgradeShopSchema.safeParse({ shopName: 'x'.repeat(101) }).success).toBe(false)
  })
})
