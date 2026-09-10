'use client'
import { useActionState, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { updateVariationsAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { buildVariationsPayload, optionImageKey } from '@/lib/products/sku'
import { OptionPhotoStrip } from '@/components/products/option-photo-strip'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Product, ProductImage, ProductVariation } from '@/types/product'

/*
  VariationEditor — the post-creation half of the variant story: rename an axis
  or an option, and change which photo each option wears.

  Adding, removing or reordering options is deliberately absent. A SKU stores
  COORDINATES ([0, 1]), not labels, so inserting an option renumbers the ones
  after it and every existing SKU quietly comes to mean a different variant.
  Renaming is safe for the same reason — coordinates do not care about labels.
*/
export function VariationEditor({ spu }: { spu: Product }) {
  const stored = useMemo(() => spu.product_variations ?? [], [spu.product_variations])
  const [state, formAction] = useActionState(updateVariationsAction, initialActionState)

  const [axes, setAxes] = useState<ProductVariation[]>(() =>
    stored.map((a) => ({ name: a.name, options: [...a.options] })),
  )
  const [optionImages, setOptionImages] = useState<
    Record<string, ProductImage | undefined>
  >(() => {
    const seed: Record<string, ProductImage | undefined> = {}
    stored.forEach((axis, axisIdx) =>
      (axis.images ?? []).forEach((img, optIdx) => {
        seed[optionImageKey(axisIdx, optIdx)] = img
      }),
    )
    return seed
  })
  // Photos hang off one axis; open on whichever one already carries them.
  const [photoAxis, setPhotoAxis] = useState(() => {
    const found = stored.findIndex((a) => (a.images?.length ?? 0) > 0)
    return found >= 0 ? found : 0
  })

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  // Only usable as a photo when it carries a public_id: the API validates images
  // by public_id and would reject a blank one.
  const thumb = useMemo<ProductImage | null>(
    () =>
      spu.product_thumb && spu.product_thumb_public_id
        ? { url: spu.product_thumb, public_id: spu.product_thumb_public_id }
        : null,
    [spu.product_thumb, spu.product_thumb_public_id],
  )

  // The picker offers everything already attached to this product.
  const gallery = useMemo<ProductImage[]>(() => {
    const seen = new Set<string>()
    const unique: ProductImage[] = []
    for (const img of [...(thumb ? [thumb] : []), ...(spu.product_images ?? [])]) {
      if (seen.has(img.public_id)) continue
      seen.add(img.public_id)
      unique.push(img)
    }
    return unique
  }, [thumb, spu.product_images])

  if (stored.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This product has no variations, so there is nothing to photograph
        separately.
      </p>
    )
  }

  const payload = buildVariationsPayload({
    axes,
    photoAxis,
    optionImages,
    fallback: thumb,
  })
  const shape = stored.map((a) => ({ options: a.options.length }))
  const target = axes[photoAxis]

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={spu._id} />
      <input type="hidden" name="shape" value={JSON.stringify(shape)} />
      <input
        type="hidden"
        name="product_variations"
        value={JSON.stringify(payload)}
      />

      {axes.map((axis, axisIdx) => (
        <div key={axisIdx} className="space-y-2 rounded-md border p-3">
          <div className="space-y-2">
            <Label htmlFor={`axis-${axisIdx}`}>Variation name</Label>
            <Input
              id={`axis-${axisIdx}`}
              value={axis.name}
              onChange={(e) =>
                setAxes((a) =>
                  a.map((x, i) =>
                    i === axisIdx ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {axis.options.map((option, optIdx) => (
              <div key={optIdx} className="space-y-1">
                <Label htmlFor={`axis-${axisIdx}-opt-${optIdx}`} className="text-xs text-muted-foreground">
                  Option {optIdx + 1}
                </Label>
                <Input
                  id={`axis-${axisIdx}-opt-${optIdx}`}
                  value={option}
                  onChange={(e) =>
                    setAxes((a) =>
                      a.map((x, i) =>
                        i === axisIdx
                          ? {
                              ...x,
                              options: x.options.map((o, j) =>
                                j === optIdx ? e.target.value : o,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Renaming is safe — every SKU refers to an option by position, not by
        name. Adding or removing one is not offered here: it would renumber the
        options and point existing SKUs at the wrong variant.
      </p>

      {gallery.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add images to this product first to give each option its own photo.
        </p>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="photoAxisEdit" className="text-sm font-medium">
              Photos follow
            </Label>
            {axes.length > 1 ? (
              <select
                id="photoAxisEdit"
                value={photoAxis}
                onChange={(e) => setPhotoAxis(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {axes.map((a, i) => (
                  <option key={i} value={i}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium">{target?.name}</span>
            )}
            <span className="text-xs text-muted-foreground">
              — picking this option on the product page swaps the main photo.
            </span>
          </div>

          {target?.options.map((option, optIdx) => {
            const key = optionImageKey(photoAxis, optIdx)
            return (
              <OptionPhotoStrip
                key={optIdx}
                option={option || `Option ${optIdx + 1}`}
                images={gallery}
                selected={optionImages[key]}
                onPick={(img) =>
                  setOptionImages((prev) => ({ ...prev, [key]: img }))
                }
              />
            )
          })}
        </div>
      )}

      <SubmitButton>Save variations</SubmitButton>
    </form>
  )
}
