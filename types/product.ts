export const PRODUCT_TYPES = ['CLOTHING', 'ELECTRONICS', 'SHOES', 'OTHER'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

// Only these two are wired in the backend factory; others are disabled in the UI.
export const CREATABLE_TYPES: ProductType[] = ['CLOTHING', 'ELECTRONICS']

// The backend caps the variant matrix at 3 axes (productSchema validator).
export const MAX_VARIATION_AXES = 3

export interface ProductImage {
  url: string
  public_id: string
}

// product_price arrives as Decimal128 JSON; keep it loose here and normalize on display.
export type Decimal = number | string | { $numberDecimal: string }

// One axis of the matrix. `images` is indexed by option position and only the
// first axis carries them, mirroring the backend's variationSchema.
export interface ProductVariation {
  name: string
  options: string[]
  images?: ProductImage[]
}

/*
  A SKU is one cell of the matrix — the thing that actually leaves the shelf.
  `sku_tier_idx` is a COORDINATE into product_variations, not a label: [0, 1]
  means "option 0 of axis 0, option 1 of axis 1". An empty array means the SPU
  has no variants and this is its only SKU.
*/
export interface Sku {
  _id: string
  sku_code: string
  sku_product_id: string
  sku_tier_idx: number[]
  sku_price: Decimal
  sku_thumb?: ProductImage | null
  sku_default?: boolean
  isPublished?: boolean
  // Merged in by the backend from Inventories, which owns stock.
  stock?: number
}

/*
  The SPU — "the product as the buyer talks about it". One page, one description,
  one review thread. Price and stock here are DERIVED from the SKUs:
  product_price mirrors the default SKU and product_quantity the total stock,
  both kept so cart and checkout keep reading the SPU.
*/
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
  product_variations?: ProductVariation[]
  product_price_min?: Decimal
  product_price_max?: Decimal
  product_sku_count?: number
}

// GET /product/:id returns the SPU and its SKUs separately.
export interface ProductDetail {
  spu: Product
  skus: Sku[]
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

// What the create form posts for each matrix cell it filled in.
export interface SkuDraft {
  sku_tier_idx: number[]
  sku_price: number
  sku_stock: number
  sku_default?: boolean
}
