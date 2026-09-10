'use client'
import { useActionState, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createProductAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { ImageManager } from '@/components/products/image-manager'
import { AttributeFields } from '@/components/products/attribute-fields'
import { VariantEditor } from '@/components/products/variant-editor'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  PRODUCT_TYPES,
  CREATABLE_TYPES,
  type PreparedImages,
  type ProductImage,
  type ProductType,
} from '@/types/product'

/*
  Nothing here is gated behind the upload any more. The seller types while
  images upload in the background; only the submit button waits for at least one
  image, and it says why.

  The gallery lives in this component rather than inside the uploader because
  the variant editor needs the same list to hand a photo to each option.
*/
export function CreateProductForm() {
  const [draftId, setDraftId] = useState<string | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [thumbPublicId, setThumbPublicId] = useState<string | null>(null)
  const [type, setType] = useState<ProductType>('CLOTHING')
  const [state, formAction] = useActionState(createProductAction, initialActionState)

  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  const handleUploaded = useCallback((result: PreparedImages) => {
    // The first batch decides the draft folder; later batches are sent with it
    // and come back under the same id.
    setDraftId((current) => current ?? result.productId)
    setImages((current) => {
      const known = new Set(current.map((i) => i.public_id))
      return [...current, ...result.images.filter((i) => !known.has(i.public_id))]
    })
  }, [])

  const handleRemove = useCallback((publicId: string) => {
    // Dropped from the product only. The file stays in Cloudinary until the
    // draft folder is cleaned up — same as abandoning the form half-way.
    setImages((current) => current.filter((i) => i.public_id !== publicId))
    setThumbPublicId((current) => (current === publicId ? null : current))
  }, [])

  // Falling back to the first image keeps "which one is the main image"
  // answerable at all times, including before the seller has chosen and right
  // after they delete the one they had chosen.
  const thumb = images.find((i) => i.public_id === thumbPublicId) ?? images[0] ?? null
  const ready = Boolean(draftId && thumb)

  return (
    <form action={formAction} className="max-w-4xl space-y-6">
      {draftId && thumb ? (
        <>
          <input type="hidden" name="productId" value={draftId} />
          <input type="hidden" name="thumbUrl" value={thumb.url} />
          <input type="hidden" name="thumbPublicId" value={thumb.public_id} />
          <input type="hidden" name="images" value={JSON.stringify(images)} />
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product_name">Name</Label>
            <Input id="product_name" name="product_name" required />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              name="product_type"
              value={type}
              onValueChange={(v) => setType(v as ProductType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} disabled={!CREATABLE_TYPES.includes(t)}>
                    {t}
                    {CREATABLE_TYPES.includes(t) ? '' : ' (not available yet)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_description">Description (optional)</Label>
            <Textarea id="product_description" name="product_description" />
          </div>

          <AttributeFields type={type} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            The main image is what the store listing shows. Variant photos are
            picked from this gallery below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImageManager
            draftId={draftId}
            images={images}
            thumbPublicId={thumb?.public_id ?? null}
            onUploaded={handleUploaded}
            onSetThumb={setThumbPublicId}
            onRemove={handleRemove}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price &amp; variants</CardTitle>
          <CardDescription>
            Price and stock live on the variant, not the product — the listing
            shows the range across them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VariantEditor images={images} thumb={thumb} />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <SubmitButton disabled={!ready}>Create product</SubmitButton>
        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">
            Add at least one image to create the product.
          </p>
        ) : null}
      </div>
    </form>
  )
}
