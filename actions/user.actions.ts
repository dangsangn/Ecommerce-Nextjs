'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { setSession, getClientId } from '@/lib/auth/session'
import { upgradeShopSchema } from '@/lib/validations/user'
import type { Tokens } from '@/types/api'
import type { ActionState } from '@/actions/state'

interface UpgradeData {
  roles: string[]
  tokens: Tokens
}

export async function upgradeToShopAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = upgradeShopSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }

  const clientId = await getClientId()
  if (!clientId) return { ok: false, message: 'Your session has expired' }

  try {
    const data = await apiFetch<UpgradeData>('/user/me/upgrade-to-shop', {
      auth: true,
      body: parsed.data,
    })
    // Critical: overwrite cookies with the new shop-role tokens, or the proxy
    // keeps seeing the old (non-shop) role and gates the user out of /seller.
    await setSession(data.tokens, clientId)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not upgrade to a shop') }
  }

  revalidatePath('/seller/account')
  // Send the new seller straight to their dashboard. `?welcome=1` triggers the
  // success toast there (the form unmounts on redirect, so it can't toast itself).
  // Must run OUTSIDE the try/catch above — redirect() throws NEXT_REDIRECT.
  redirect('/seller?welcome=1')
}

const AVATAR_TIMEOUT_MS = 10_000

export async function updateAvatarAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get('avatar')
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: 'Choose an image to upload' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS)
  try {
    await apiFetch('/user/me/avatar', {
      method: 'PATCH',
      multipart: formData,
      auth: true,
      signal: controller.signal,
    })
  } catch (e) {
    // The backend endpoint currently never sends a response (missing .send(res)),
    // so this abort/timeout is the expected path today. See STATUS §6.
    if (e instanceof DOMException && e.name === 'AbortError')
      return { ok: false, message: 'Avatar upload is temporarily unavailable' }
    return { ok: false, message: errorMessage(e, 'Could not update your avatar') }
  } finally {
    clearTimeout(timer)
  }

  revalidatePath('/seller/account')
  return { ok: true, message: 'Avatar updated' }
}
