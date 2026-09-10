'use client'
import { useRef, useTransition } from 'react'
import { Star, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { prepareImagesAction } from '@/actions/product.actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PreparedImages, ProductImage } from '@/types/product'

/*
  ImageManager — uploads run alongside the rest of the form, not before it.

  Files upload the moment they are chosen, so the seller never has to finish a
  separate step to start typing. Every batch is sent with the draft id returned
  by the first one, which keeps all of them in the same `products/{shop}/{draft}`
  folder — the folder the API checks against at create time.
*/
export function ImageManager({
  draftId,
  images,
  thumbPublicId,
  onUploaded,
  onSetThumb,
  onRemove,
}: {
  draftId: string | null
  images: ProductImage[]
  thumbPublicId: string | null
  onUploaded: (result: PreparedImages) => void
  onSetThumb: (publicId: string) => void
  onRemove: (publicId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, startUpload] = useTransition()

  const upload = (files: FileList | null) => {
    if (!files?.length) return
    const body = new FormData()
    for (const file of files) body.append('images', file)
    if (draftId) body.append('draftId', draftId)

    startUpload(async () => {
      const result = await prepareImagesAction({ ok: false }, body)
      if (result.ok && result.data) onUploaded(result.data)
      else toast.error(result.message ?? 'Could not upload images')
      // Let the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {uploading ? 'Uploading…' : images.length ? 'Add more images' : 'Upload images'}
      </Button>

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No images yet. You can fill in everything else first — the product just
          cannot be created without at least one.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => {
            const isThumb = img.public_id === thumbPublicId
            return (
              <div key={img.public_id} className="space-y-1">
                <div
                  className={cn(
                    'relative size-24 overflow-hidden rounded-md border',
                    isThumb && 'border-primary ring-1 ring-primary',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="size-full object-cover" />
                  {isThumb ? (
                    <span className="absolute inset-x-0 bottom-0 bg-primary/90 text-center text-[10px] text-primary-foreground">
                      Main
                    </span>
                  ) : null}
                </div>
                <div className="flex justify-between gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Use as main image"
                    disabled={isThumb}
                    onClick={() => onSetThumb(img.public_id)}
                  >
                    <Star className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remove image"
                    onClick={() => onRemove(img.public_id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
