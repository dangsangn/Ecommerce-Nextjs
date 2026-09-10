'use client'
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  buildVariationsPayload,
  cartesianTiers,
  optionImageKey,
  tierKey,
  variantLabel,
} from '@/lib/products/sku'
import { OptionPhotoStrip } from '@/components/products/option-photo-strip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  MAX_VARIATION_AXES,
  type ProductImage,
  type ProductVariation,
} from '@/types/product'

interface Cell {
  price: string
  stock: string
  enabled: boolean
}

// A matrix this wide is almost always a modelling mistake (a "Bundle" axis that
// should be its own product), and it is the point where the editor stops being
// usable. Warn rather than block — some catalogues really are that wide.
const BUSY_MATRIX = 60

/*
  VariantEditor — where the seller declares the axes, attaches a photo to each
  option, and fills in the cells.

  It writes two hidden JSON fields the server action reads: `product_variations`
  (the axes, with their per-option photos) and `sku_list` (the cells actually
  stocked). A product with no variants still emits one SKU at `sku_tier_idx: []`
  — after the SPU/SKU split every sellable thing is a SKU, some products just
  have exactly one.
*/
export function VariantEditor({
  images,
  thumb,
}: {
  images: ProductImage[]
  thumb: ProductImage | null
}) {
  const [hasVariants, setHasVariants] = useState(false)
  const [axes, setAxes] = useState<ProductVariation[]>([
    { name: '', options: [] },
  ])
  // Keyed by tier coordinates so renaming an option keeps the price typed for it.
  const [cells, setCells] = useState<Record<string, Cell>>({})
  // Keyed by `${axisIdx}:${optionIdx}` against the axes array, not the filtered
  // one, so a half-typed axis in between does not shift everyone's photo.
  const [optionImages, setOptionImages] = useState<
    Record<string, ProductImage | undefined>
  >({})
  const [photoAxis, setPhotoAxis] = useState(0)
  const [simple, setSimple] = useState<Cell>({
    price: '',
    stock: '',
    enabled: true,
  })
  const [defaultKey, setDefaultKey] = useState<string | null>(null)

  // Half-typed axes (no name yet, or no options) are ignored until they are real.
  const activeIdx = useMemo(
    () =>
      axes
        .map((a, i) => (a.name.trim() && a.options.length > 0 ? i : -1))
        .filter((i) => i >= 0),
    [axes],
  )
  const activeAxes = useMemo(
    () => activeIdx.map((i) => axes[i]),
    [activeIdx, axes],
  )
  const tiers = useMemo(
    () => (hasVariants ? cartesianTiers(activeAxes) : []),
    [hasVariants, activeAxes],
  )

  const cellFor = (key: string): Cell =>
    cells[key] ?? { price: '', stock: '', enabled: true }
  const patchCell = (key: string, patch: Partial<Cell>) =>
    setCells((c) => ({ ...c, [key]: { ...cellFor(key), ...patch } }))

  /*
    Deleting an option renumbers every option after it, and both the price cells
    and the photos are keyed by that number. Shift them in step, or the seller
    deletes "Red" and silently finds Blue wearing Red's price and photo.
  */
  const dropOption = (axisIdx: number, optIdx: number) => {
    const activePos = activeIdx.indexOf(axisIdx)
    if (activePos >= 0) {
      setCells((prev) => {
        const next: Record<string, Cell> = {}
        for (const [key, cell] of Object.entries(prev)) {
          const coords = key.split('-').map(Number)
          const at = coords[activePos]
          if (at === optIdx) continue // the cells of the deleted option
          if (at > optIdx) coords[activePos] = at - 1
          next[coords.join('-')] = cell
        }
        return next
      })
    }
    setOptionImages((prev) => {
      const next: Record<string, ProductImage | undefined> = {}
      for (const [key, img] of Object.entries(prev)) {
        const [axis, opt] = key.split(':').map(Number)
        if (axis !== axisIdx) {
          next[key] = img
          continue
        }
        if (opt === optIdx) continue
        next[optionImageKey(axis, opt > optIdx ? opt - 1 : opt)] = img
      }
      return next
    })
    setAxes((a) =>
      a.map((x, i) =>
        i === axisIdx
          ? { ...x, options: x.options.filter((_, j) => j !== optIdx) }
          : x,
      ),
    )
  }

  const enabledTiers = tiers.filter((t) => cellFor(tierKey(t)).enabled)
  const effectiveDefault =
    defaultKey && enabledTiers.some((t) => tierKey(t) === defaultKey)
      ? defaultKey
      : enabledTiers.length
        ? tierKey(enabledTiers[0])
        : null

  // photoAxis indexes `axes`; the payload is built from the filtered list, so
  // translate the key space before handing the picks over.
  const photoAxisPos = activeIdx.indexOf(photoAxis)
  const payloadImages: Record<string, ProductImage | undefined> = {}
  if (photoAxisPos >= 0) {
    activeAxes[photoAxisPos].options.forEach((_, optIdx) => {
      payloadImages[optionImageKey(photoAxisPos, optIdx)] =
        optionImages[optionImageKey(photoAxis, optIdx)]
    })
  }

  const variationsJson = JSON.stringify(
    hasVariants
      ? buildVariationsPayload({
          axes: activeAxes,
          photoAxis: photoAxisPos,
          optionImages: payloadImages,
          fallback: thumb,
        })
      : [],
  )
  const skuListJson = JSON.stringify(
    hasVariants
      ? enabledTiers.map((tier) => {
          const key = tierKey(tier)
          const cell = cellFor(key)
          return {
            sku_tier_idx: tier,
            sku_price: Number(cell.price),
            sku_stock: Number(cell.stock || 0),
            sku_default: key === effectiveDefault,
          }
        })
      : [
          {
            sku_tier_idx: [],
            sku_price: Number(simple.price),
            sku_stock: Number(simple.stock || 0),
            sku_default: true,
          },
        ],
  )

  return (
    <div className="space-y-4">
      <input type="hidden" name="product_variations" value={variationsJson} />
      <input type="hidden" name="sku_list" value={skuListJson} />

      <div className="flex items-center gap-2">
        <input
          id="hasVariants"
          type="checkbox"
          checked={hasVariants}
          onChange={(e) => setHasVariants(e.target.checked)}
          className="size-4 accent-primary"
        />
        <Label htmlFor="hasVariants">
          This product comes in variants (colour, size, …)
        </Label>
      </div>

      {!hasVariants ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="simple_price">Price</Label>
            <Input
              id="simple_price"
              type="number"
              step="0.01"
              min="0"
              value={simple.price}
              onChange={(e) => setSimple((s) => ({ ...s, price: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="simple_stock">Stock</Label>
            <Input
              id="simple_stock"
              type="number"
              min="0"
              value={simple.stock}
              onChange={(e) => setSimple((s) => ({ ...s, stock: e.target.value }))}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {axes.map((axis, axisIdx) => (
            <AxisRow
              key={axisIdx}
              axis={axis}
              canRemove={axes.length > 1}
              onChange={(next) =>
                setAxes((a) => a.map((x, i) => (i === axisIdx ? next : x)))
              }
              onRemoveOption={(optIdx) => dropOption(axisIdx, optIdx)}
              onRemove={() => setAxes((a) => a.filter((_, i) => i !== axisIdx))}
            />
          ))}

          {axes.length < MAX_VARIATION_AXES ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAxes((a) => [...a, { name: '', options: [] }])}
            >
              <Plus className="size-4" />
              Add variation
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              {MAX_VARIATION_AXES} variations is the maximum.
            </p>
          )}

          <PhotoPicker
            axes={axes}
            activeIdx={activeIdx}
            photoAxis={photoAxis}
            onPhotoAxisChange={setPhotoAxis}
            images={images}
            optionImages={optionImages}
            onPick={(key, img) =>
              setOptionImages((prev) => ({ ...prev, [key]: img }))
            }
          />

          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Name a variation and add its options to build the variant table.
            </p>
          ) : (
            <div className="space-y-2">
              {tiers.length > BUSY_MATRIX ? (
                <p className="text-sm text-destructive">
                  {tiers.length} combinations. That is usually a sign one of
                  these axes should be its own product.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Untick the combinations you do not stock — leaving them in at
                zero stock publishes variants nobody can buy.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Sell</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="w-16">Default</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiers.map((tier) => {
                    const key = tierKey(tier)
                    const cell = cellFor(key)
                    const label = variantLabel(activeAxes, tier)
                    return (
                      <TableRow
                        key={key}
                        className={cn(!cell.enabled && 'opacity-50')}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Sell ${label}`}
                            checked={cell.enabled}
                            onChange={(e) =>
                              patchCell(key, { enabled: e.target.checked })
                            }
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Price for ${label}`}
                            disabled={!cell.enabled}
                            value={cell.price}
                            onChange={(e) =>
                              patchCell(key, { price: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            aria-label={`Stock for ${label}`}
                            disabled={!cell.enabled}
                            value={cell.stock}
                            onChange={(e) =>
                              patchCell(key, { stock: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="radio"
                            name="sku_default_pick"
                            aria-label={`Open the page on ${label}`}
                            disabled={!cell.enabled}
                            checked={key === effectiveDefault}
                            onChange={() => setDefaultKey(key)}
                            className="size-4 accent-primary"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/*
  PhotoPicker — one photo per option of ONE axis.

  Only one axis carries photos, and the seller says which. "Red / M" and
  "Red / L" are the same shirt photographed once; hanging photos off both axes
  would mean two answers to "what does this variant look like" and only one of
  them could win.
*/
function PhotoPicker({
  axes,
  activeIdx,
  photoAxis,
  onPhotoAxisChange,
  images,
  optionImages,
  onPick,
}: {
  axes: ProductVariation[]
  activeIdx: number[]
  photoAxis: number
  onPhotoAxisChange: (axis: number) => void
  images: ProductImage[]
  optionImages: Record<string, ProductImage | undefined>
  onPick: (key: string, img: ProductImage | undefined) => void
}) {
  if (activeIdx.length === 0) return null

  const target = activeIdx.includes(photoAxis) ? photoAxis : activeIdx[0]
  const axis = axes[target]

  if (images.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Upload images above to give each {axis.name.toLowerCase() || 'option'} its
        own photo.
      </p>
    )
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="photoAxis" className="text-sm font-medium">
          Photos follow
        </Label>
        {activeIdx.length > 1 ? (
          <select
            id="photoAxis"
            value={target}
            onChange={(e) => onPhotoAxisChange(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {activeIdx.map((i) => (
              <option key={i} value={i}>
                {axes[i].name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium">{axis.name}</span>
        )}
        <span className="text-xs text-muted-foreground">
          — picking this option on the product page swaps the main photo.
        </span>
      </div>

      {axis.options.map((option, optIdx) => {
        const key = optionImageKey(target, optIdx)
        return (
          <OptionPhotoStrip
            key={option}
            option={option}
            images={images}
            selected={optionImages[key]}
            onPick={(img) => onPick(key, img)}
          />
        )
      })}
    </div>
  )
}

function AxisRow({
  axis,
  canRemove,
  onChange,
  onRemove,
  onRemoveOption,
}: {
  axis: ProductVariation
  canRemove: boolean
  onChange: (next: ProductVariation) => void
  onRemove: () => void
  onRemoveOption: (optIdx: number) => void
}) {
  const [draft, setDraft] = useState('')

  const addOption = () => {
    const value = draft.trim()
    if (!value) return
    // Case-insensitive: "Red" and "red" would read as two variants of the same
    // thing and the buyer could not tell them apart.
    if (axis.options.some((o) => o.toLowerCase() === value.toLowerCase())) {
      setDraft('')
      return
    }
    onChange({ ...axis, options: [...axis.options, value] })
    setDraft('')
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Variation name (Colour, Size, …)"
          value={axis.name}
          onChange={(e) => onChange({ ...axis, name: e.target.value })}
        />
        {canRemove ? (
          <Button type="button" variant="ghost" onClick={onRemove} aria-label="Remove variation">
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {axis.options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {axis.options.map((option, i) => (
            <span
              key={option}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
            >
              {option}
              <button
                type="button"
                aria-label={`Remove ${option}`}
                onClick={() => onRemoveOption(i)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Add an option and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ',') return
            // This lives inside the create form — Enter would submit it.
            e.preventDefault()
            addOption()
          }}
        />
        <Button type="button" variant="outline" onClick={addOption}>
          Add
        </Button>
      </div>
    </div>
  )
}
