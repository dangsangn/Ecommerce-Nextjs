import { describe, it, expect } from 'vitest'
import { signupSchema, loginSchema, verifyOtpSchema } from '@/lib/validations/auth'

describe('signupSchema', () => {
  it('accepts valid data', () => {
    const r = signupSchema.safeParse({ email: 'a@b.com', password: '123456', name: 'An' })
    expect(r.success).toBe(true)
  })
  it('rejects an invalid email', () => {
    expect(signupSchema.safeParse({ email: 'x', password: '123456', name: 'An' }).success).toBe(false)
  })
  it('rejects a short password', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: '123', name: 'An' }).success).toBe(false)
  })
  it('rejects a missing name', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: '123456', name: '' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts valid data', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true)
  })
})

describe('verifyOtpSchema', () => {
  it('accepts a 6-digit OTP', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', otp: '123456' }).success).toBe(true)
  })
  it('rejects an OTP shorter than 6 digits', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', otp: '123' }).success).toBe(false)
  })
})
