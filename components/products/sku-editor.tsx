'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateSkusAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { toPriceString } from '@/lib/products/price'
import { variantLabel } from '@/lib/products/sku'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ProductVariation, Sku } from '@/types/product'

/*
  Price and stock of an existing product are edited here, not in the details
  form: price lives on the SKU row and stock in Inventories, and the SPU's
  advertised range is recomputed server-side from both.

  Adding or removing a variant axis is NOT offered. Option order is part of the
  data key — every SKU stores coordinates like [0, 1], not labels — so
  reordering or deleting an option silently re-points existing SKUs at the wrong
  variant. That needs a guided flow, not an inline table.
*/
export function SkuEditor({
  productId,
  variations,
  skus,
}: {
  productId: string
  variations: ProductVariation[]
  skus: Sku[]
}) {
  const [state, formAction] = useActionState(updateSkusAction, initialActionState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  // A SKU with no id is the placeholder normalize() synthesises for a backend
  // that has not been migrated yet — there is nothing on the server to patch.
  const editable = skus.filter((s) => s._id)
  if (editable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This product has no SKU rows yet. Run the SPU/SKU migration on the API to
        edit price and stock here.
      </p>
    )
  }

  const currentDefault = editable.find((s) => s.sku_default)?._id ?? editable[0]._id

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={productId} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variant</TableHead>
            <TableHead>SKU code</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="w-16">Default</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {editable.map((sku) => {
            const label = variantLabel(variations, sku.sku_tier_idx) || 'Single variant'
            return (
              <TableRow key={sku._id}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {sku.sku_code}
                </TableCell>
                <TableCell>
                  {/* Repeated field names keep price, stock and id aligned by
                      index — the action zips them back together. */}
                  <input type="hidden" name="sku_id" value={sku._id} />
                  <Input
                    name="sku_price"
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label={`Price for ${label}`}
                    defaultValue={toPriceString(sku.sku_price)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    name="sku_stock"
                    type="number"
                    min="0"
                    aria-label={`Stock for ${label}`}
                    defaultValue={sku.stock ?? 0}
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="radio"
                    name="sku_default"
                    value={sku._id}
                    aria-label={`Open the page on ${label}`}
                    defaultChecked={sku._id === currentDefault}
                    className="size-4 accent-primary"
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <SubmitButton>Save variants</SubmitButton>
    </form>
  )
}
