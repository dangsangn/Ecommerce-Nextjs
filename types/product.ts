export const PRODUCT_TYPES = ['CLOTHING', 'ELECTRONICS', 'SHOES', 'OTHER'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

// Only these two are wired in the backend factory; others are disabled in the UI.
export const CREATABLE_TYPES: ProductType[] = ['CLOTHING', 'ELECTRONICS']

export interface ProductImage {
  url: string
  public_id: string
}

// product_price arrives as Decimal128 JSON; keep it loose here and normalize on display.
export type Decimal = number | string | { $numberDecimal: string }

export interface Product {
  _id: string
  product_name: string
  product_thumb: string
  product_thumb_public_id?: string
  product_images: ProductImage[]
  product_description?: string
  product_price: Decimal
  product_quantity: number
  product_type: ProductType
  product_shop?: string
  product_attributes?: Record<string, unknown>
}

export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface ProductListResult {
  data: Product[]
  pagination: Pagination
}

export interface PreparedImages {
  productId: string
  images: ProductImage[]
  thumb: ProductImage
}
