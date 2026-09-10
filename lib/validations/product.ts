import { z } from 'zod'
import { MAX_VARIATION_AXES } from '@/types/product'

const baseFields = {
  product_name: z.string().trim().min(1, 'Enter a product name'),
  product_description: z.string().trim().optional(),
}

/*
  color and size are NOT here any more: they are variation axes, not SPU
  attributes. "Red / M" and "Blue / M" are two warehouse codes for the same
  shirt, so they belong to product_variations. brand and material are true SPU
  attributes — every variant shares them.

  They stay accepted-but-optional so a product created before the split can be
  edited without losing the values it already carries.
*/
const clothing = z.object({
  ...baseFields,
  product_type: z.literal('CLOTHING'),
  brand: z.string().trim().min(1, 'Enter a brand'),
  material: z.string().trim().optional(),
  color: z.string().trim().optional(),
  size: z.string().trim().optional(),
})

const electronics = z.object({
  ...baseFields,
  product_type: z.literal('ELECTRONICS'),
  manufacturer: z.string().trim().min(1, 'Enter a manufacturer'),
  model: z.string().trim().optional(),
})

export const productDetailsSchema = z.discriminatedUnion('product_type', [
  clothing,
  electronics,
])
export type ProductDetailsInput = z.infer<typeof productDetailsSchema>

// Split base fields from type-specific attribute keys for building the API body.
const ATTRIBUTE_KEYS = ['brand', 'color', 'size', 'material', 'manufacturer', 'model'] as const
export function splitAttributes(data: ProductDetailsInput) {
  const record = data as Record<string, unknown>
  const attrs: Record<string, unknown> = {}
  for (const k of ATTRIBUTE_KEYS) {
    if (k in record && record[k] !== undefined && record[k] !== '') {
      attrs[k] = record[k]
    }
  }
  return {
    product_name: data.product_name,
    product_description: data.product_description,
    product_type: data.product_type,
    product_attributes: attrs,
  }
}

// ---------------------------------------------------------------------------
// Variant matrix
// ---------------------------------------------------------------------------

const imageRefSchema = z.object({
  url: z.string().min(1),
  public_id: z.string().min(1),
})

export const variationSchema = z.object({
  name: z.string().trim().min(1, 'Name each variation'),
  options: z
    .array(z.string().trim().min(1))
    .min(1, 'Each variation needs at least one option'),
  // Indexed BY OPTION POSITION: images[2] is the photo for options[2]. Either
  // empty, or one entry per option — a short array would shift every photo onto
  // the wrong option.
  images: z.array(imageRefSchema).default([]),
})

export const skuDraftSchema = z.object({
  sku_tier_idx: z.array(z.number().int().nonnegative()),
  sku_price: z.coerce.number().positive('Every SKU needs a price above 0'),
  sku_stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
  sku_default: z.boolean().optional(),
})

type VariationInput = z.infer<typeof variationSchema>

// Shared by the create payload and the edit payload — the same two rules hold
// whenever a variation axis is written.
function checkAxes(variations: VariationInput[], ctx: z.RefinementCtx) {
  variations.forEach((axis, i) => {
    const unique = new Set(axis.options.map((o) => o.toLowerCase()))
    if (unique.size !== axis.options.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['product_variations', i, 'options'],
        message: `"${axis.name}" has duplicate options`,
      })
    }
    if (axis.images.length > 0 && axis.images.length !== axis.options.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['product_variations', i, 'images'],
        message: `"${axis.name}" needs a photo for every option, or none`,
      })
    }
  })
}

/*
  Mirrors the backend's createProductSchema checks so the seller sees the problem
  in the form instead of as a 400. The server still re-validates — this is a
  convenience, not the boundary.
*/
export const variantPayloadSchema = z
  .object({
    product_variations: z.array(variationSchema).max(
      MAX_VARIATION_AXES,
      `At most ${MAX_VARIATION_AXES} variations`,
    ),
    sku_list: z.array(skuDraftSchema).min(1, 'Add at least one variant to sell'),
  })
  .superRefine(({ product_variations: variations, sku_list: skus }, ctx) => {
    checkAxes(variations, ctx)

    const seen = new Set<string>()
    skus.forEach((sku, i) => {
      if (sku.sku_tier_idx.length !== variations.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['sku_list', i],
          message: 'A variant does not match the variation axes',
        })
        return
      }
      sku.sku_tier_idx.forEach((optIdx, axis) => {
        if (optIdx >= (variations[axis]?.options.length ?? 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['sku_list', i],
            message: 'A variant points at an option that no longer exists',
          })
        }
      })
      const key = sku.sku_tier_idx.join('-')
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sku_list', i],
          message: 'Duplicate variant combination',
        })
      }
      seen.add(key)
    })

    if (skus.filter((s) => s.sku_default).length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['sku_list'],
        message: 'Only one variant can be the default',
      })
    }
  })

export type VariantPayload = z.infer<typeof variantPayloadSchema>

/*
  The form carries the matrix as two JSON blobs in hidden inputs — FormData is
  flat, and a nested matrix encoded as `sku_list[0][sku_tier_idx][1]` is far
  worse to read than one parse step here.
*/
export function parseVariantPayload(
  variationsRaw: string,
  skuListRaw: string,
): { ok: true; data: VariantPayload } | { ok: false; message: string } {
  let parsedJson: unknown
  try {
    parsedJson = {
      product_variations: JSON.parse(variationsRaw || '[]'),
      sku_list: JSON.parse(skuListRaw || '[]'),
    }
  } catch {
    return { ok: false, message: 'Could not read the variant table' }
  }
  const result = variantPayloadSchema.safeParse(parsedJson)
  if (!result.success) {
    return { ok: false, message: result.error.issues[0].message }
  }
  return { ok: true, data: result.data }
}

// Edit form: all optional; mirrors backend updateProductSchema allowed keys.
// Price is absent on purpose — after the split it lives on the SKU.
export const productEditSchema = z.object({
  product_name: z.string().trim().min(1).optional(),
  product_description: z.string().trim().optional(),
})
export type ProductEditInput = z.infer<typeof productEditSchema>

// PATCH /product/:id/sku — price goes to the SKU, stock to the inventory row.
export const skuEditSchema = z.object({
  skus: z
    .array(
      z.object({
        sku_id: z.string().min(1),
        sku_price: z.coerce.number().positive('Price must be greater than 0'),
        sku_stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
        sku_default: z.boolean().optional(),
      }),
    )
    .min(1, 'Nothing to update'),
})
export type SkuEditInput = z.infer<typeof skuEditSchema>

/*
  PATCH /product/:id/variations — renames and per-option photos.

  The number of axes and of options per axis is NOT editable: a SKU stores
  coordinates, so inserting or dropping an option renumbers the rest and every
  existing SKU comes to mean a different variant. The caller passes the stored
  shape so a mismatch is caught here with a readable message instead of a 400.
*/
export const variationsEditSchema = z
  .object({ product_variations: z.array(variationSchema) })
  .superRefine(({ product_variations }, ctx) => checkAxes(product_variations, ctx))

export function parseVariationsPayload(
  raw: string,
  shape: { options: number }[],
): { ok: true; data: VariationInput[] } | { ok: false; message: string } {
  let json: unknown
  try {
    json = { product_variations: JSON.parse(raw || '[]') }
  } catch {
    return { ok: false, message: 'Could not read the variations' }
  }
  const result = variationsEditSchema.safeParse(json)
  if (!result.success) {
    return { ok: false, message: result.error.issues[0].message }
  }
  const variations = result.data.product_variations
  if (variations.length !== shape.length) {
    return { ok: false, message: 'Variations cannot be added or removed here' }
  }
  const reshaped = variations.findIndex(
    (axis, i) => axis.options.length !== shape[i].options,
  )
  if (reshaped >= 0) {
    return {
      ok: false,
      message: `Options of "${variations[reshaped].name}" cannot be added or removed here`,
    }
  }
  return { ok: true, data: variations }
}
