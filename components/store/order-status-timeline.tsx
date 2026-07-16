import { ORDER_PROGRESSION } from '@/lib/orders/display'
import { Badge } from '@/components/ui/badge'
import type { OrderStatus } from '@/types/order'

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  // Terminal negative states don't fit the linear progression.
  if (status === 'cancelled' || status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive">{status}</Badge>
        <span className="text-sm text-muted-foreground">
          {status === 'cancelled' ? 'This order was cancelled.' : 'This order failed.'}
        </span>
      </div>
    )
  }

  const currentIndex = ORDER_PROGRESSION.indexOf(status)

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {ORDER_PROGRESSION.map((step, i) => {
        const done = i <= currentIndex
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                done
                  ? 'flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground'
              }
            >
              {step}
            </span>
            {i < ORDER_PROGRESSION.length - 1 ? (
              <span className={done && i < currentIndex ? 'h-px w-6 bg-primary' : 'h-px w-6 bg-border'} />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
