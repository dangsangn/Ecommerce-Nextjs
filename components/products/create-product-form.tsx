'use client'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createProductAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { ImageUploader } from '@/components/products/image-uploader'
import { AttributeFields } from '@/components/products/attribute-fields'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PRODUCT_TYPES, CREATABLE_TYPES, type ProductType, type PreparedImages } from '@/types/product'

export function CreateProductForm() {
  const [uploadResult, setUploadResult] = useState<PreparedImages | null>(null)
  const [type, setType] = useState<ProductType>('CLOTHING')
  const [state, formAction] = useActionState(createProductAction, initialActionState)

  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>1. Images</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader onPrepared={setUploadResult} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <fieldset disabled={!uploadResult} className="space-y-4 disabled:opacity-60">
              {uploadResult ? (
                <>
                  <input type="hidden" name="productId" value={uploadResult.productId} />
                  <input type="hidden" name="thumbUrl" value={uploadResult.thumb.url} />
                  <input type="hidden" name="thumbPublicId" value={uploadResult.thumb.public_id} />
                  <input type="hidden" name="images" value={JSON.stringify(uploadResult.images)} />
                </>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="product_name">Name</Label>
                <Input id="product_name" name="product_name" required />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="product_price">Price</Label>
                  <Input id="product_price" name="product_price" type="number" step="0.01" min="0" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product_quantity">Quantity</Label>
                  <Input id="product_quantity" name="product_quantity" type="number" min="0" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select name="product_type" value={type} onValueChange={(v) => setType(v as ProductType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t) => (
                      <SelectItem key={t} value={t} disabled={!CREATABLE_TYPES.includes(t)}>
                        {t}{CREATABLE_TYPES.includes(t) ? '' : ' (not available yet)'}
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

              <SubmitButton>Create product</SubmitButton>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
