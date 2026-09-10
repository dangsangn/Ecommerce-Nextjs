'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import {
  parseVariantPayload,
  parseVariationsPayload,
  productDetailsSchema,
  productEditSchema,
  skuEditSchema,
  splitAttributes,
} from '@/lib/validations/product'
import type { ActionState } from '@/actions/state'
import type { PreparedImages, ProductImage } from '@/types/product'

interface PrepareState extends ActionState {
  data?: PreparedImages
}

export async function prepareImagesAction(
  _prev: PrepareState,
  formData: FormData,
): Promise<PrepareState> {
  const files = formData
    .getAll('images')
    .filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0)
    return { ok: false, message: 'Choose at least one image' }
  // `draftId`, when the seller is adding a second batch, keeps every image in
  // the same draft folder. Without it each batch would get its own folder and
  // only the last one would pass the public_id check at create time.
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
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }

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

  // The variant matrix travels as two JSON blobs written by the SKU editor.
  // A product with no variants still sends one SKU — after the split every
  // sellable thing is a SKU, some SPUs just have exactly one.
  const variants = parseVariantPayload(
    String(formData.get('product_variations') ?? '[]'),
    String(formData.get('sku_list') ?? '[]'),
  )
  if (!variants.ok) return { ok: false, message: variants.message }

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
        ...variants.data,
      },
    })
  } catch (e) {
    return {
      ok: false,
      message: errorMessage(e, 'Could not create the product'),
    }
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
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    await apiFetch(`/product/${id}`, {
      method: 'PATCH',
      auth: true,
      body: parsed.data,
    })
  } catch (e) {
    return {
      ok: false,
      message: errorMessage(e, 'Could not update the product'),
    }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product updated' }
}

/*
  updateVariationsAction — rename axes and options, and set each option's photo.

  The stored shape travels with the form (`shape`) so a mismatch is reported as
  "options cannot be added or removed here" rather than as a 400 from the API.
  The API enforces the same rule; this is the readable half of it.
*/
export async function updateVariationsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }

  let shape: { options: number }[]
  try {
    shape = JSON.parse(String(formData.get('shape') ?? '[]'))
  } catch {
    return { ok: false, message: 'Could not read the variations' }
  }

  const parsed = parseVariationsPayload(
    String(formData.get('product_variations') ?? '[]'),
    shape,
  )
  if (!parsed.ok) return { ok: false, message: parsed.message }

  try {
    await apiFetch(`/product/${id}/variations`, {
      method: 'PATCH',
      auth: true,
      body: { product_variations: parsed.data },
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not update variations') }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  revalidatePath(`/products/${id}`)
  return { ok: true, message: 'Variations updated' }
}

/*
  updateSkusAction — the only path that changes price or stock.

  PATCH /product/:id sends descriptive fields only; the backend rejects a price
  there because it is derived from the SKUs. Prices land on Skus, stock on
  Inventories, and the SPU's advertised range is recomputed server-side in the
  same transaction.
*/
export async function updateSkusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }

  const ids = formData.getAll('sku_id').map(String)
  const prices = formData.getAll('sku_price').map(String)
  const stocks = formData.getAll('sku_stock').map(String)
  const defaultId = String(formData.get('sku_default') ?? '')
  if (ids.length === 0) return { ok: false, message: 'Nothing to update' }

  const parsed = skuEditSchema.safeParse({
    skus: ids.map((sku_id, i) => ({
      sku_id,
      sku_price: prices[i],
      sku_stock: stocks[i],
      ...(defaultId ? { sku_default: sku_id === defaultId } : {}),
    })),
  })
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }

  try {
    await apiFetch(`/product/${id}/sku`, {
      method: 'PATCH',
      auth: true,
      body: parsed.data,
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not update variants') }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  revalidatePath('/seller/products')
  revalidatePath(`/products/${id}`)
  return { ok: true, message: 'Variants updated' }
}

export async function publishProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/published/${id}`, {
      method: 'PATCH',
      auth: true,
      body: {},
    })
  } catch (e) {
    return {
      ok: false,
      message: errorMessage(e, 'Could not publish the product'),
    }
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
    await apiFetch(`/product/draft/${id}`, {
      method: 'PATCH',
      auth: true,
      body: {},
    })
  } catch (e) {
    return {
      ok: false,
      message: errorMessage(e, 'Could not unpublish the product'),
    }
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
  const files = formData
    .getAll('images')
    .filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0)
    return { ok: false, message: 'Choose at least one image' }
  // Backend reads multipart field `images`; strip the id field first.
  const upload = new FormData()
  for (const f of files) upload.append('images', f)
  try {
    await apiFetch(`/product/upload/images/${id}`, {
      method: 'PUT',
      multipart: upload,
      auth: true,
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not add images') }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  return { ok: true, message: 'Images added' }
}
