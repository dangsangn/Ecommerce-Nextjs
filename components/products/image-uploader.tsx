'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { prepareImagesAction } from '@/actions/product.actions'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PreparedImages } from '@/types/product'

const initial = { ok: false as boolean, data: undefined as PreparedImages | undefined }

export function ImageUploader({ onPrepared }: { onPrepared: (data: PreparedImages) => void }) {
  const [state, formAction] = useActionState(prepareImagesAction, initial)

  useEffect(() => {
    if (state.ok && state.data) onPrepared(state.data)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state, onPrepared])

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="images">Product images</Label>
          <Input id="images" name="images" type="file" accept="image/*" multiple required />
        </div>
        <SubmitButton>Upload images</SubmitButton>
      </form>
      {state.ok && state.data ? (
        <div className="flex flex-wrap gap-2">
          {state.data.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.public_id}
              src={img.url}
              alt=""
              className="h-20 w-20 rounded-md border object-cover"
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
