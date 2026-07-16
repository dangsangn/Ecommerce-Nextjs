'use client'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { updateCartQuantityAction, removeFromCartAction } from '@/actions/cart.actions'
import { initialActionState } from '@/actions/state'
import { toPriceString, toPriceNumber } from '@/lib/products/price'
import { Button } from '@/components/ui/button'
import type { CartProduct } from '@/types/cart'

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" size="icon" aria-label={label} disabled={pending}>
      {children}
    </Button>
  )
}

export function CartLine({ product }: { product: CartProduct }) {
  const { productId, name, thumb, price, quantity } = product
  const [qtyState, qtyAction] = useActionState(updateCartQuantityAction, initialActionState)
  const [rmState, rmAction] = useActionState(removeFromCartAction, initialActionState)

  useEffect(() => {
    if (!qtyState.ok && qtyState.message) toast.error(qtyState.message)
  }, [qtyState])
  useEffect(() => {
    if (!rmState.ok && rmState.message) toast.error(rmState.message)
    else if (rmState.ok && rmState.message) toast.success(rmState.message)
  }, [rmState])

  const lineTotal = toPriceString(toPriceNumber(price) * quantity)

  return (
    <div className="flex items-center gap-4 border-b py-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt={name} className="h-16 w-16 rounded-md border object-cover" />
      <div className="flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{toPriceString(price)} each</p>
      </div>
      <div className="flex items-center gap-2">
        <form action={qtyAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="oldQuantity" value={quantity} />
          <input type="hidden" name="newQuantity" value={quantity - 1} />
          <IconButton label="Decrease quantity">−</IconButton>
        </form>
        <span className="w-8 text-center tabular-nums">{quantity}</span>
        <form action={qtyAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="oldQuantity" value={quantity} />
          <input type="hidden" name="newQuantity" value={quantity + 1} />
          <IconButton label="Increase quantity">+</IconButton>
        </form>
      </div>
      <div className="w-20 text-right tabular-nums">{lineTotal}</div>
      <form action={rmAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="oldQuantity" value={quantity} />
        <Button type="submit" variant="ghost" size="sm">Remove</Button>
      </form>
    </div>
  )
}
