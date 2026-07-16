'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { getClientId } from '@/lib/auth/session'
import type { ActionState } from '@/actions/state'

export async function createCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get('productId') ?? '')
  const content = String(formData.get('content') ?? '').trim()
  const parentId = (formData.get('parentId') as string) || null
  const replyToUserId = (formData.get('replyToUserId') as string) || null
  if (!productId) return { ok: false, message: 'Missing product' }
  if (!content) return { ok: false, message: 'Write a comment first' }

  const userId = await getClientId()
  if (!userId) redirect(`/login?redirect=/products/${productId}`)

  try {
    await apiFetch('/comment', {
      auth: true,
      body: { productId, userId, content, parentId, replyToUserId },
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not post your comment') }
  }
  revalidatePath(`/products/${productId}`)
  return { ok: true, message: parentId ? 'Reply posted' : 'Comment posted' }
}

export async function deleteCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const commentId = String(formData.get('commentId') ?? '')
  const productId = String(formData.get('productId') ?? '')
  if (!commentId || !productId) return { ok: false, message: 'Missing comment' }
  try {
    await apiFetch('/comment', { method: 'DELETE', auth: true, body: { commentId, productId } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not delete the comment') }
  }
  revalidatePath(`/products/${productId}`)
  return { ok: true, message: 'Comment deleted' }
}
