'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { cancelOrderAction } from '@/actions/order.actions'
import { initialActionState } from '@/actions/state'
import { toPriceString } from '@/lib/products/price'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Order, OrderProduct } from '@/types/order'

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'cancelled' || status === 'failed') return 'destructive'
  if (status === 'pending') return 'default'
  return 'secondary'
}

function formatDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export function OrderCard({ order }: { order: Order }) {
  const [state, formAction] = useActionState(cancelOrderAction, initialActionState)
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  const products: OrderProduct[] = order.order_products.flatMap((s) => s.item_products)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant(order.order_status)}>{order.order_status}</Badge>
          <span className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</span>
        </div>
        <span className="font-semibold tabular-nums">{toPriceString(order.order_checkout?.totalCheckout ?? 0)}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.productId} className="flex items-center gap-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.name} className="h-10 w-10 rounded border object-cover" />
              <span className="flex-1">{p.name}</span>
              <span className="text-muted-foreground">× {p.quantity}</span>
              <span className="tabular-nums">{toPriceString(p.price)}</span>
            </div>
          ))}
        </div>
        {order.order_status === 'pending' ? (
          <form action={formAction}>
            <input type="hidden" name="orderId" value={order._id} />
            <Button type="submit" variant="outline" size="sm">Cancel order</Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
