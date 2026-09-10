import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { getClientId } from '@/lib/auth/session'
import { normalizeProductDetail } from '@/lib/products/sku'
import { ProductPurchase } from '@/components/store/product-purchase'
import { CommentSection } from '@/components/store/comment-section'
import type { ProductDetail } from '@/types/product'
import type { Comment } from '@/types/comment'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let detail: ProductDetail | null = null
  let error: string | null = null
  try {
    // The endpoint returns { spu, skus }; normalize also accepts the old flat
    // product so the page still renders against a backend without the split.
    detail = normalizeProductDetail(await apiFetch<unknown>(`/product/${id}`))
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load the product'
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-primary hover:underline">← Back to store</Link>
        <p className="text-sm text-destructive">{error ?? 'Product not found'}</p>
      </div>
    )
  }

  const { spu, skus } = detail
  const attrs = spu.product_attributes ?? {}

  let comments: Comment[] = []
  try {
    // Reviews hang off the SPU, not the SKU: 40 reviews of one shirt belong on
    // one page, not split across its twelve size/colour combinations.
    comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)
  } catch {
    comments = []
  }
  const currentUserId = await getClientId()

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-primary hover:underline">← Back to store</Link>

      <ProductPurchase spu={spu} skus={skus} />

      {spu.product_description ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Description</h2>
          <p className="text-sm">{spu.product_description}</p>
        </section>
      ) : null}

      {Object.keys(attrs).length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Details</h2>
          <dl className="grid max-w-md grid-cols-2 gap-1 text-sm">
            {Object.entries(attrs).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground capitalize">{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <CommentSection productId={id} comments={comments} currentUserId={currentUserId} />
    </div>
  )
}
