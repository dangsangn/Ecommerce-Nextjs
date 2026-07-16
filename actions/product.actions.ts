'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { productDetailsSchema, productEditSchema, splitAttributes } from '@/lib/validations/product'
import type { ActionState } from '@/actions/state'
import type { PreparedImages, ProductImage } from '@/types/product'

interface PrepareState extends ActionState {
  data?: PreparedImages
}

export async function prepareImagesAction(
  _prev: PrepareState,
  formData: FormData,
): Promise<PrepareState> {
  const files = formData.getAll('images').filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false, message: 'Choose at least one image' }
  try {
    const data = await apiFetch<PreparedImages>('/product/upload/prepare', {
      multipart: formData,
      auth: true,
    })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not upload images') }
  }
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productDetailsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }

  const productId = String(formData.get('productId') ?? '')
  const thumbUrl = String(formData.get('thumbUrl') ?? '')
  const thumbPublicId = String(formData.get('thumbPublicId') ?? '')
  const imagesRaw = String(formData.get('images') ?? '[]')
  if (!productId || !thumbUrl || !thumbPublicId)
    return { ok: false, message: 'Upload images before creating the product' }

  let images: ProductImage[]
  try {
    images = JSON.parse(imagesRaw)
  } catch {
    return { ok: false, message: 'Upload images before creating the product' }
  }

  const details = splitAttributes(parsed.data)
  try {
    await apiFetch('/product', {
      auth: true,
      body: {
        _id: productId,
        product_thumb: thumbUrl,
        product_thumb_public_id: thumbPublicId,
        product_images: images,
        ...details,
      },
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not create the product') }
  }
  revalidatePath('/seller/products')
  redirect('/seller/products')
}

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  const parsed = productEditSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  try {
    await apiFetch(`/product/${id}`, { method: 'PATCH', auth: true, body: parsed.data })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not update the product') }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product updated' }
}

export async function publishProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not publish the product') }
  }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product published' }
}

export async function unpublishProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/draft/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not unpublish the product') }
  }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product moved to drafts' }
}

export async function addProductImagesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  const files = formData.getAll('images').filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false, message: 'Choose at least one image' }
  // Backend reads multipart field `images`; strip the id field first.
  const upload = new FormData()
  for (const f of files) upload.append('images', f)
  try {
    await apiFetch(`/product/upload/images/${id}`, { method: 'PUT', multipart: upload, auth: true })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not add images') }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  return { ok: true, message: 'Images added' }
}
