'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { getClientId } from '@/lib/auth/session'
import type { ActionState } from '@/actions/state'

export async function addToCartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get('productId') ?? '')
  const quantity = Number(formData.get('quantity') ?? 1)
  if (!productId) return { ok: false, message: 'Missing product' }
  if (!Number.isFinite(quantity) || quantity < 1) return { ok: false, message: 'Quantity must be at least 1' }

  const clientId = await getClientId()
  if (!clientId) redirect(`/login?redirect=/products/${productId}`)

  try {
    await apiFetch('/cart', { auth: true, body: { productId, quantity } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not add to cart') }
  }
  revalidatePath('/cart')
  return { ok: true, message: 'Added to cart' }
}

export async function updateCartQuantityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get('productId') ?? '')
  const oldQuantity = Number(formData.get('oldQuantity'))
  const newQuantity = Number(formData.get('newQuantity'))
  if (!productId) return { ok: false, message: 'Missing product' }
  try {
    await apiFetch('/cart/quantity', { method: 'PATCH', auth: true, body: { productId, oldQuantity, newQuantity } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not update quantity') }
  }
  revalidatePath('/cart')
  return { ok: true }
}

export async function removeFromCartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get('productId') ?? '')
  const oldQuantity = Number(formData.get('oldQuantity'))
  if (!productId) return { ok: false, message: 'Missing product' }
  try {
    await apiFetch('/cart', { method: 'DELETE', auth: true, body: { productId, oldQuantity } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not remove item') }
  }
  revalidatePath('/cart')
  return { ok: true, message: 'Item removed' }
}

// Used directly as a <form action> (like logoutAction), so it takes no args.
export async function clearCartAction(): Promise<void> {
  try {
    await apiFetch('/cart/clear', { method: 'DELETE', auth: true })
  } catch {
    // Ignore — the revalidate refreshes the (unchanged) cart.
  }
  revalidatePath('/cart')
}
