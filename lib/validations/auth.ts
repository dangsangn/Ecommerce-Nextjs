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

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
})

export const resetOtpSchema = z.object({
  email: z.string().email('Enter a valid email'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

// Same min(6) as signupSchema and the backend ResetPasswordDTO — change all three together.
export const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetOtpInput = z.infer<typeof resetOtpSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
