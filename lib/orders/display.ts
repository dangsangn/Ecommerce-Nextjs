import type { OrderStatus } from '@/types/order'

// Maps an order status to a Badge variant.
export function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'cancelled' || status === 'failed') return 'destructive'
  if (status === 'pending') return 'default'
  return 'secondary'
}

// Formats an ISO date string as YYYY-MM-DD (the app's existing convention).
export function formatOrderDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

// The happy-path progression shown in the timeline.
export const ORDER_PROGRESSION: OrderStatus[] = ['pending', 'confirmed', 'shipping', 'delivered']
