import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { OrderCard } from '@/components/store/order-card'
import type { Order } from '@/types/order'

interface OrdersResult { data: Order[] }

export default async function OrdersPage() {
  let orders: Order[] = []
  let error: string | null = null
  try {
    const result = await apiFetch<OrdersResult>('/order', { auth: true })
    orders = result.data ?? []
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load your orders'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your orders</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : orders.length === 0 ? (
        <p className="rounded-2xl bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
          No orders yet. <Link href="/" className="text-primary hover:underline">Browse products</Link>
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <OrderCard key={o._id} order={o} />
          ))}
        </div>
      )}
    </div>
  )
}
