'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { setSession, clearSession } from '@/lib/auth/session'
import { COOKIE } from '@/lib/auth/tokens'
import {
  loginSchema,
  signupSchema,
  verifyOtpSchema,
} from '@/lib/validations/auth'
import type { LoginData } from '@/types/api'
import type { ActionState } from '@/actions/state'

export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    await apiFetch('/auth/signup', { body: parsed.data })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not create your account') }
  }
  redirect(`/verify-otp?email=${encodeURIComponent(parsed.data.email)}`)
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  const redirectTo = (formData.get('redirect') as string) || '/seller'
  try {
    const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
    await setSession(data.tokens, data.user._id)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not sign you in') }
  }
  redirect(redirectTo)
}

export async function verifyOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = verifyOtpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    const data = await apiFetch<LoginData>('/auth/verify-otp', {
      body: parsed.data,
    })
    await setSession(data.tokens, data.user._id)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not verify your code') }
  }
  redirect('/seller')
}

export async function resendOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '')
  if (!email) return { ok: false, message: 'Email is required' }
  try {
    await apiFetch('/auth/resend-otp', { body: { email } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not resend the code') }
  }
  return { ok: true, message: 'Verification code sent' }
}

export async function logoutAction(): Promise<void> {
  const store = await cookies()
  const clientId = store.get(COOKIE.CLIENT)?.value
  const refresh = store.get(COOKIE.REFRESH)?.value
  // Backend /auth/logout authenticates with x-client-id + x-refresh-token (not authorization).
  if (clientId && refresh) {
    try {
      await fetch(`${process.env.BACKEND_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.API_KEY!,
          'x-client-id': clientId,
          'x-refresh-token': refresh,
        },
      })
    } catch {
      // Ignore network errors — still clear the client-side session.
    }
  }
  await clearSession()
  redirect('/login')
}
