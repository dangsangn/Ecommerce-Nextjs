'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { setSession, clearSession } from '@/lib/auth/session'
import { COOKIE } from '@/lib/auth/tokens'
import {
  setResetTicket,
  getResetTicket,
  clearResetTicket,
} from '@/lib/auth/reset-ticket'
import {
  loginSchema,
  signupSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetOtpSchema,
  resetPasswordSchema,
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
    return {
      ok: false,
      message: errorMessage(e, 'Could not create your account'),
    }
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
  const redirectTo = (formData.get('redirect') as string) || '/'
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
  redirect('/')
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

// Backend always answers 200 here, even for unknown emails (anti-enumeration),
// so reaching the catch means a network error, 5xx or the per-IP rate limit.
async function requestResetCode(email: string): Promise<string | null> {
  try {
    await apiFetch('/auth/forgot-password', { body: { email } })
    return null
  } catch (e) {
    return errorMessage(e, 'Could not send the reset code')
  }
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  const error = await requestResetCode(parsed.data.email)
  if (error) return { ok: false, message: error }
  // A leftover ticket from an abandoned attempt would skip the OTP step.
  await clearResetTicket()
  redirect(`/reset-password?email=${encodeURIComponent(parsed.data.email)}`)
}

export async function resendResetOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  const error = await requestResetCode(parsed.data.email)
  if (error) return { ok: false, message: error }
  // Backend silently skips the send within its 60s cooldown, so stay vague.
  return { ok: true, message: 'If an account exists, a new code is on its way' }
}

export async function verifyResetOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetOtpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    const data = await apiFetch<{ resetTicket: string; expiresIn: number }>(
      '/auth/verify-reset-otp',
      { body: parsed.data },
    )
    await setResetTicket(data.resetTicket, data.expiresIn)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not verify your code') }
  }
  // No redirect: the page reads the cookie and switches to the password form
  // once the client calls router.refresh().
  return { ok: true }
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }

  // The ticket comes from the httpOnly cookie, never from the client.
  const resetTicket = await getResetTicket()
  if (!resetTicket)
    return {
      ok: false,
      message: 'Your reset session expired. Please start again.',
    }

  try {
    await apiFetch('/auth/reset-password', {
      body: { resetTicket, password: parsed.data.password },
    })
  } catch (e) {
    const message = errorMessage(e, 'Could not reset your password')
    // A dead ticket would otherwise pin the user to this form until the cookie expires.
    if (message === 'Reset session is invalid or expired')
      await clearResetTicket()
    return { ok: false, message }
  }
  await clearResetTicket()
  redirect('/login?reset=1')
}

export async function cancelResetAction(): Promise<void> {
  await clearResetTicket()
  redirect('/forgot-password')
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
