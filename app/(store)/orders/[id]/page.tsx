import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { apiFetch } from '@/lib/api/server-client'
import { toPriceString } from '@/lib/products/price'
import { statusVariant, formatOrderDate } from '@/lib/orders/display'
import { OrderStatusTimeline } from '@/components/store/order-status-timeline'
import { CancelOrderButton } from '@/components/store/cancel-order-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Order, OrderProduct } from '@/types/order'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let order: Order | null = null
  let error: string | null = null
  try {
    order = await apiFetch<Order>(`/order/${id}`, { auth: true })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load this order'
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> Back to orders
        </Link>
        <p className="text-sm text-destructive">{error ?? 'Order not found'}</p>
      </div>
    )
  }

  const products: OrderProduct[] = order.order_products.flatMap((s) => s.item_products)
  const code = order._id.slice(-6).toUpperCase()
  const checkout = order.order_checkout ?? { totalPrice: 0, totalDiscount: 0, feeShip: 0, totalCheckout: 0 }
  const shipping = order.order_shipping ?? {}
  const addressParts = [shipping.street, shipping.city, shipping.state, shipping.country].filter(Boolean)

  return (
    <div className="space-y-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" /> Back to orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Order #{code}</h1>
          <Badge variant={statusVariant(order.order_status)}>{order.order_status}</Badge>
        </div>
        <span className="text-sm text-muted-foreground">{formatOrderDate(order.createdAt)}</span>
      </div>

      <OrderStatusTimeline status={order.order_status} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {products.map((p) => (
              <div key={p.productId} className="flex items-center gap-3 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.name} className="h-10 w-10 rounded border object-cover" />
                <span className="flex-1">{p.name}</span>
                <span className="text-muted-foreground">× {p.quantity}</span>
                <span className="tabular-nums">{toPriceString(p.price)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{toPriceString(checkout.totalPrice ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{toPriceString(checkout.totalDiscount ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">{toPriceString(checkout.feeShip ?? 0)}</span></div>
            <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{toPriceString(checkout.totalCheckout ?? 0)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Shipping</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {addressParts.length > 0 ? (
              <p>{addressParts.join(', ')}</p>
            ) : (
              <p className="text-muted-foreground">No shipping address on file.</p>
            )}
            {order.order_tracking_number ? (
              <p className="text-muted-foreground">Tracking: <span className="text-foreground">{order.order_tracking_number}</span></p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="text-muted-foreground">Method: <span className="text-foreground">{order.order_payment?.method ?? '—'}</span></p>
          </CardContent>
        </Card>
      </div>

      {order.order_status === 'pending' ? <CancelOrderButton orderId={order._id} /> : null}
    </div>
  )
}
