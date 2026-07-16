'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { getClientId } from '@/lib/auth/session'
import { createDiscountSchema } from '@/lib/validations/discount'
import type { ActionState } from '@/actions/state'
import type { Discount } from '@/types/discount'

// Optional numeric fields arrive as '' when left blank; drop them so z.optional applies.
function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== undefined && v !== null) out[k] = v
  }
  return out
}

export async function createDiscountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = pruneEmpty(Object.fromEntries(formData))
  const parsed = createDiscountSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }

  const shopId = await getClientId()
  if (!shopId) return { ok: false, message: 'Your session has expired' }

  const d = parsed.data
  const productIds =
    d.discount_applies_to === 'specific_products'
      ? (d.discount_product_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

  const body: Record<string, unknown> = {
    discount_name: d.discount_name,
    discount_description: d.discount_description,
    discount_code: d.discount_code,
    discount_type: d.discount_type,
    discount_value: d.discount_value,
    discount_start_date: new Date(d.discount_start_date).toISOString(),
    discount_end_date: new Date(d.discount_end_date).toISOString(),
    discount_applies_to: d.discount_applies_to,
    discount_shop_id: shopId, // required by DTO validation; server overrides it anyway
    ...(d.discount_max_uses !== undefined && { discount_max_uses: d.discount_max_uses }),
    ...(d.discount_max_uses_per_user !== undefined && { discount_max_uses_per_user: d.discount_max_uses_per_user }),
    ...(d.discount_min_order_value !== undefined && { discount_min_order_value: d.discount_min_order_value }),
    ...(productIds && { discount_product_ids: productIds }),
  }

  try {
    await apiFetch('/discount', { auth: true, body })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not create the discount') }
  }
  revalidatePath('/seller/discounts')
  redirect('/seller/discounts')
}

interface LookupState extends ActionState {
  data?: Discount
}

export async function lookupDiscountByCodeAction(
  _prev: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const code = String(formData.get('code') ?? '').trim()
  if (!code) return { ok: false, message: 'Enter a discount code' }
  try {
    const data = await apiFetch<Discount>(`/discount/code/${encodeURIComponent(code)}`)
    return { ok: true, data }
  } catch (e) {
    // Backend throws specific reasons (expired/inactive/not-found) — surface verbatim.
    return { ok: false, message: errorMessage(e, 'No usable discount for that code') }
  }
}
