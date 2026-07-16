'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import type { ActionState } from '@/actions/state'
import type { ShopOrderItem } from '@/types/order'

export async function placeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let shopOrderIds: ShopOrderItem[]
  try {
    shopOrderIds = JSON.parse(String(formData.get('shop_order_ids') ?? '[]'))
  } catch {
    return { ok: false, message: 'Your cart could not be read. Please try again.' }
  }
  if (!Array.isArray(shopOrderIds) || shopOrderIds.length === 0)
    return { ok: false, message: 'Your cart is empty' }

  const user_address = {
    street: String(formData.get('street') ?? ''),
    city: String(formData.get('city') ?? ''),
    state: String(formData.get('state') ?? ''),
    country: String(formData.get('country') ?? ''),
  }
  if (!user_address.street || !user_address.city || !user_address.state || !user_address.country)
    return { ok: false, message: 'Enter your full shipping address' }

  const user_payment = { method: String(formData.get('paymentMethod') ?? 'COD') }

  try {
    await apiFetch('/order', { auth: true, body: { shop_order_ids: shopOrderIds, user_address, user_payment } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not place your order') }
  }
  revalidatePath('/orders')
  redirect('/orders')
}

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) return { ok: false, message: 'Missing order id' }
  try {
    await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not cancel the order') }
  }
  revalidatePath('/orders')
  return { ok: true, message: 'Order cancelled' }
}
