import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { EditProductForm } from '@/components/products/edit-product-form'
import type { Product } from '@/types/product'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let product: Product | null = null
  let error: string | null = null
  try {
    product = await apiFetch<Product>(`/product/${id}`, { auth: true })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load the product'
  }
  return (
    <div className="space-y-6">
      <Link href="/seller/products" className="text-sm text-primary hover:underline">← Back to products</Link>
      <h1 className="text-2xl font-semibold">Edit product</h1>
      {error || !product ? (
        <p className="text-sm text-destructive">{error ?? 'Product not found'}</p>
      ) : (
        <EditProductForm product={product} />
      )}
    </div>
  )
}
