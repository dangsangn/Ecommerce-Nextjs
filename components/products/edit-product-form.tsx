'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateProductAction, addProductImagesAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { formatPriceRange } from '@/lib/products/price'
import { priceRange } from '@/lib/products/sku'
import { SkuEditor } from '@/components/products/sku-editor'
import { VariationEditor } from '@/components/products/variation-editor'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Product, Sku } from '@/types/product'

export function EditProductForm({ spu, skus }: { spu: Product; skus: Sku[] }) {
  const [detailsState, detailsAction] = useActionState(updateProductAction, initialActionState)
  const [imagesState, imagesAction] = useActionState(addProductImagesAction, initialActionState)

  useEffect(() => {
    if (detailsState.ok && detailsState.message) toast.success(detailsState.message)
    else if (!detailsState.ok && detailsState.message) toast.error(detailsState.message)
  }, [detailsState])

  useEffect(() => {
    if (imagesState.ok && imagesState.message) toast.success(imagesState.message)
    else if (!imagesState.ok && imagesState.message) toast.error(imagesState.message)
  }, [imagesState])

  const variations = spu.product_variations ?? []
  const range = priceRange(spu, skus)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Type: {spu.product_type}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* No price field here — it is derived from the SKUs below, and the
                API rejects a price sent to PATCH /product/:id. */}
            <form action={detailsAction} className="space-y-4">
              <input type="hidden" name="id" value={spu._id} />
              <div className="space-y-2">
                <Label htmlFor="product_name">Name</Label>
                <Input id="product_name" name="product_name" defaultValue={spu.product_name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product_description">Description</Label>
                <Textarea
                  id="product_description"
                  name="product_description"
                  defaultValue={spu.product_description ?? ''}
                />
              </div>
              <SubmitButton>Save changes</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
            <CardDescription>Add more images to this product.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {spu.product_images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.public_id} src={img.url} alt="" className="h-20 w-20 rounded-md border object-cover" />
              ))}
            </div>
            <form action={imagesAction} className="space-y-4">
              <input type="hidden" name="id" value={spu._id} />
              <div className="space-y-2">
                <Label htmlFor="images">New images</Label>
                <Input id="images" name="images" type="file" accept="image/*" multiple required />
              </div>
              <SubmitButton>Add images</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      {variations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Variations &amp; photos</CardTitle>
            <CardDescription>
              Rename an option, or give it its own photo — the product page swaps
              to it when a buyer picks that option.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariationEditor spu={spu} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Variants &amp; stock</CardTitle>
          <CardDescription>
            {variations.length
              ? `${variations.map((v) => v.name).join(' × ')} — showing ${formatPriceRange(range.min, range.max)}`
              : `No variations — showing ${formatPriceRange(range.min, range.max)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkuEditor productId={spu._id} variations={variations} skus={skus} />
        </CardContent>
      </Card>
    </div>
  )
}
