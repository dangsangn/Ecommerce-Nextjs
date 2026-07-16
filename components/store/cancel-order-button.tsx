'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { cancelOrderAction } from '@/actions/order.actions'
import { initialActionState } from '@/actions/state'
import { Button } from '@/components/ui/button'

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState(cancelOrderAction, initialActionState)
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" variant="outline" size="sm">Cancel order</Button>
    </form>
  )
}
