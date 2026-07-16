export type DiscountType = 'fixed_amount' | 'percentage'
export type AppliesTo = 'all' | 'specific_products'

export interface Discount {
  _id: string
  discount_name: string
  discount_description: string
  discount_code: string
  discount_type: DiscountType
  discount_value: number
  discount_start_date: string
  discount_end_date: string
  discount_max_uses?: number
  discount_max_uses_per_user?: number
  discount_min_order_value?: number
  discount_is_active?: boolean
  discount_applies_to: AppliesTo
  discount_shop_id?: string
  discount_product_ids?: string[]
  is_expired?: boolean
  remaining_uses?: number
}
