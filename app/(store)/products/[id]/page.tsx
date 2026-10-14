import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="size-3.5" />
        <span className="capitalize">{spu.product_type.toLowerCase()}</span>
        <ChevronRight className="size-3.5" />
        <span className="line-clamp-1 text-foreground">{spu.product_name}</span>
      </nav>

      <div className="rounded-2xl bg-card p-4 shadow-sm sm:p-6">
        <ProductPurchase spu={spu} skus={skus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {spu.product_description ? (
          <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm sm:p-6 lg:col-span-2">
            <h2 className="text-lg font-bold">Product highlights</h2>
            <p className="whitespace-pre-line text-sm leading-6">{spu.product_description}</p>
          </section>
        ) : null}

        {Object.keys(attrs).length > 0 ? (
          <section className="space-y-3 self-start rounded-2xl bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold">Specifications</h2>
            <dl className="overflow-hidden rounded-xl border text-sm">
              {Object.entries(attrs).map(([k, v]) => (
                <div key={k} className="grid grid-cols-2 gap-2 px-3 py-2 odd:bg-muted/60">
                  <dt className="text-muted-foreground capitalize">{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-sm sm:p-6">
        <CommentSection productId={id} comments={comments} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
