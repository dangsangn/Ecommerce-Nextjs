'use client'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductImage } from '@/types/product'

/*
  One row of the photo picker: an option, and every gallery image it could wear.

  Shared by the create form and the edit page so "assign a photo to Red" looks
  and behaves the same in both — the two flows differ only in where the gallery
  and the saved picks come from.
*/
export function OptionPhotoStrip({
  option,
  images,
  selected,
  onPick,
}: {
  option: string
  images: ProductImage[]
  selected?: ProductImage
  onPick: (img: ProductImage | undefined) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 shrink-0 pt-2 text-sm font-medium">{option}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={`No photo for ${option}`}
          aria-pressed={!selected}
          onClick={() => onPick(undefined)}
          className={cn(
            'flex size-14 items-center justify-center rounded-md border text-muted-foreground transition-colors',
            !selected
              ? 'border-primary ring-1 ring-primary'
              : 'hover:border-foreground/40',
          )}
        >
          <ImageOff className="size-4" />
        </button>
        {images.map((img) => {
          const picked = selected?.public_id === img.public_id
          return (
            <button
              key={img.public_id}
              type="button"
              aria-label={`Use this photo for ${option}`}
              aria-pressed={picked}
              onClick={() => onPick(img)}
              className={cn(
                'size-14 overflow-hidden rounded-md border transition-colors',
                picked
                  ? 'border-primary ring-1 ring-primary'
                  : 'hover:border-foreground/40',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="size-full object-cover" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
