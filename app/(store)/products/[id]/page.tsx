import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { getClientId } from '@/lib/auth/session'
import { toPriceString } from '@/lib/products/price'
import { Badge } from '@/components/ui/badge'
import { AddToCart } from '@/components/store/add-to-cart'
import { CommentSection } from '@/components/store/comment-section'
import type { Product } from '@/types/product'
import type { Comment } from '@/types/comment'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let product: Product | null = null
  let error: string | null = null
  try {
    product = await apiFetch<Product>(`/product/${id}`)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load the product'
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-primary hover:underline">← Back to store</Link>
        <p className="text-sm text-destructive">{error ?? 'Product not found'}</p>
      </div>
    )
  }

  const gallery = product.product_images?.length
    ? product.product_images
    : [{ url: product.product_thumb, public_id: 'thumb' }]
  const attrs = product.product_attributes ?? {}

  let comments: Comment[] = []
  try {
    comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)
  } catch {
    comments = []
  }
  const currentUserId = await getClientId()

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-primary hover:underline">← Back to store</Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-2">
          {gallery.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.public_id} src={img.url} alt={product!.product_name} className="aspect-square w-full rounded-md border object-cover" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{product.product_name}</h1>
            <Badge variant="secondary">{product.product_type}</Badge>
          </div>
          <p className="text-xl">{toPriceString(product.product_price)}</p>
          <p className="text-sm text-muted-foreground">In stock: {product.product_quantity}</p>
          {product.product_description ? <p className="text-sm">{product.product_description}</p> : null}
          {Object.keys(attrs).length > 0 ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              {Object.entries(attrs).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground capitalize">{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <AddToCart productId={product._id} max={product.product_quantity} />
        </div>
      </div>
      <CommentSection productId={id} comments={comments} currentUserId={currentUserId} />
    </div>
  )
}
