'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { addToCartAction } from '@/actions/cart.actions'
import { initialActionState } from '@/actions/state'
import { ShoppingCart } from 'lucide-react'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AddToCart({
  productId,
  skuId,
  skuLabel,
  max,
  disabled,
  hint,
}: {
  productId: string
  skuId?: string
  skuLabel?: string
  max?: number
  disabled?: boolean
  hint?: string
}) {
  const [state, formAction] = useActionState(addToCartAction, initialActionState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      {/* Empty for a synthesised SKU (a backend that has not split yet) — the
          action drops the field rather than posting a placeholder id. */}
      {skuId ? <input type="hidden" name="skuId" value={skuId} /> : null}
      {skuLabel ? <input type="hidden" name="skuLabel" value={skuLabel} /> : null}
      <fieldset disabled={disabled} className="flex items-end gap-3 disabled:opacity-60">
        <div className="w-24 shrink-0 space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={max}
            defaultValue={1}
            className="h-12 rounded-xl text-center text-base"
          />
        </div>
        <SubmitButton className="h-12 flex-1 rounded-xl bg-gradient-to-b from-brand to-brand-dark text-base font-bold uppercase shadow-sm hover:opacity-95">
          <ShoppingCart className="size-5" />
          Add to cart
        </SubmitButton>
      </fieldset>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </form>
  )
}
