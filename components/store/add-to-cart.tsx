'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { addToCartAction } from '@/actions/cart.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AddToCart({ productId, max }: { productId: string; max?: number }) {
  const [state, formAction] = useActionState(addToCartAction, initialActionState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <form action={formAction} className="flex items-end gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="w-24 space-y-2">
        <Label htmlFor="quantity">Quantity</Label>
        <Input id="quantity" name="quantity" type="number" min={1} max={max} defaultValue={1} />
      </div>
      <SubmitButton>Add to cart</SubmitButton>
    </form>
  )
}
