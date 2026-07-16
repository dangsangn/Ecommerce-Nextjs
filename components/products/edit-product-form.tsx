'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateProductAction, addProductImagesAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { toPriceString } from '@/lib/products/price'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Product } from '@/types/product'

export function EditProductForm({ product }: { product: Product }) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Type: {product.product_type}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={detailsAction} className="space-y-4">
            <input type="hidden" name="id" value={product._id} />
            <div className="space-y-2">
              <Label htmlFor="product_name">Name</Label>
              <Input id="product_name" name="product_name" defaultValue={product.product_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_price">Price</Label>
              <Input
                id="product_price"
                name="product_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toPriceString(product.product_price)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_description">Description</Label>
              <Textarea
                id="product_description"
                name="product_description"
                defaultValue={product.product_description ?? ''}
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
            {product.product_images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.public_id} src={img.url} alt="" className="h-20 w-20 rounded-md border object-cover" />
            ))}
          </div>
          <form action={imagesAction} className="space-y-4">
            <input type="hidden" name="id" value={product._id} />
            <div className="space-y-2">
              <Label htmlFor="images">New images</Label>
              <Input id="images" name="images" type="file" accept="image/*" multiple required />
            </div>
            <SubmitButton>Add images</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
