import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Enter your name'),
})

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})

export const verifyOtpSchema = z.object({
  email: z.string().email('Enter a valid email'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
