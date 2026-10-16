import { describe, it, expect } from 'vitest'
import {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetOtpSchema,
  resetPasswordSchema,
} from '@/lib/validations/auth'

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

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
  })
  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false)
  })
})

describe('resetOtpSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(resetOtpSchema.safeParse({ email: 'a@b.com', otp: '123456' }).success).toBe(true)
  })
  it('rejects a 5-digit code', () => {
    expect(resetOtpSchema.safeParse({ email: 'a@b.com', otp: '12345' }).success).toBe(false)
  })
  it('rejects a non-numeric code', () => {
    expect(resetOtpSchema.safeParse({ email: 'a@b.com', otp: '12a456' }).success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('accepts matching valid passwords', () => {
    expect(resetPasswordSchema.safeParse({ password: 'abc123', confirmPassword: 'abc123' }).success).toBe(true)
  })
  it('rejects mismatched passwords on confirmPassword', () => {
    const r = resetPasswordSchema.safeParse({ password: 'abc123', confirmPassword: 'abc124' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path).toEqual(['confirmPassword'])
  })
  it('rejects passwords shorter than 6', () => {
    expect(resetPasswordSchema.safeParse({ password: 'abc', confirmPassword: 'abc' }).success).toBe(false)
  })
})
