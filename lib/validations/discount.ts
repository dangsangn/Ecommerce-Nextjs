import { z } from 'zod'

export const createDiscountSchema = z
  .object({
    discount_name: z.string().trim().min(1, 'Enter a name'),
    discount_description: z.string().trim().min(1, 'Enter a description'),
    discount_code: z.string().trim().min(1, 'Enter a code'),
    discount_type: z.enum(['fixed_amount', 'percentage']),
    discount_value: z.coerce.number().min(0, 'Value cannot be negative'),
    discount_start_date: z.string().trim().min(1, 'Choose a start date'),
    discount_end_date: z.string().trim().min(1, 'Choose an end date'),
    discount_max_uses: z.coerce.number().int().min(1).optional(),
    discount_max_uses_per_user: z.coerce.number().int().min(1).optional(),
    discount_min_order_value: z.coerce.number().min(0).optional(),
    discount_applies_to: z.enum(['all', 'specific_products']),
    // Raw comma-separated string from the form; split in the action.
    discount_product_ids: z.string().trim().optional(),
  })
  .refine((d) => d.discount_type !== 'percentage' || d.discount_value <= 100, {
    message: 'Percentage must be between 0 and 100',
    path: ['discount_value'],
  })
  .refine((d) => new Date(d.discount_end_date) > new Date(d.discount_start_date), {
    message: 'End date must be after the start date',
    path: ['discount_end_date'],
  })
  .refine(
    (d) =>
      d.discount_applies_to !== 'specific_products' ||
      (d.discount_product_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).length > 0,
    { message: 'Enter at least one product id', path: ['discount_product_ids'] },
  )

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>
