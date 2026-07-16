import { z } from 'zod'

const baseFields = {
  product_name: z.string().trim().min(1, 'Enter a product name'),
  product_price: z.coerce.number().positive('Price must be greater than 0'),
  product_quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
  product_description: z.string().trim().optional(),
}

const clothing = z.object({
  ...baseFields,
  product_type: z.literal('CLOTHING'),
  brand: z.string().trim().min(1, 'Enter a brand'),
  color: z.string().trim().min(1, 'Enter a color'),
  size: z.string().trim().min(1, 'Enter a size'),
  material: z.string().trim().optional(),
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
    product_price: data.product_price,
    product_quantity: data.product_quantity,
    product_description: data.product_description,
    product_type: data.product_type,
    product_attributes: attrs,
  }
}

// Edit form: all optional; mirrors backend updateProductSchema allowed keys.
export const productEditSchema = z.object({
  product_name: z.string().trim().min(1).optional(),
  product_description: z.string().trim().optional(),
  product_price: z.coerce.number().positive().optional(),
})
export type ProductEditInput = z.infer<typeof productEditSchema>
