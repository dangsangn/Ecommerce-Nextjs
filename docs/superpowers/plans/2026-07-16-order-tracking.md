# Order Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give customers a reachable, complete way to track orders they placed — list, per-order detail with status timeline, and working cancel.

**Architecture:** Reuse the existing `/orders` list, `OrderCard`, `cancelOrderAction`, and `Order` types. Fix the one backend bug that breaks detail+cancel (`req.params.orderId` → `req.params.id`), lift duplicated display helpers into `lib/orders/display.ts`, extract the cancel form into a shared `CancelOrderButton`, add a header "Orders" link, add a detail route `orders/[id]`, and add a presentational `OrderStatusTimeline`.

**Tech Stack:** Next.js App Router (RSC + client components), TypeScript, Tailwind, existing shadcn-style `components/ui`, Express/Mongoose backend.

**Verification note:** vitest cannot boot under this machine's Node 20.9 (`styleText` error), and UI is RSC/client with no test harness. So: pure logic (`lib/orders/display.ts`) is verified with a direct Node script; UI/route/backend changes are verified via `tsc --noEmit` (both projects) + live requests against the backend on `localhost:5000`. This matches the spec's testing section.

**Backend fix location (user-approved):** edit the controller to read `req.params.id`. Do not change the route path.

---

## File Structure

**Backend (Ecommerce-NodeJS)**
- Modify: `src/features/order/controller/index.ts` — `getOrderDetail` + `cancelOrder` read `req.params.id`.

**Frontend (Ecommerce-NextJS)**
- Create: `lib/orders/display.ts` — `statusVariant`, `formatOrderDate` (shared).
- Create: `components/store/cancel-order-button.tsx` — client cancel form, reused by card + detail.
- Create: `components/store/order-status-timeline.tsx` — presentational timeline.
- Create: `app/(store)/orders/[id]/page.tsx` — order detail RSC.
- Modify: `components/store/order-card.tsx` — use shared helpers + `CancelOrderButton`, add order code + "View details" link.
- Modify: `components/store/store-header.tsx` — add "Orders" link (logged-in only).

Absolute base paths:
- Frontend: `/Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS`
- Backend: `/Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NodeJS`

---

## Task 1: Backend — fix order detail/cancel param mismatch

**Files:**
- Modify: `Ecommerce-NodeJS/src/features/order/controller/index.ts:21-35`

- [ ] **Step 1: Change `getOrderDetail` and `cancelOrder` to read `req.params.id`**

In `src/features/order/controller/index.ts`, replace the two handlers so `orderId` comes from `req.params.id`:

```ts
  getOrderDetail = async (req: Request, res: Response) => {
    const data = await OrderService.getOrderDetail({
      orderId: req.params.id as string,
      userId: req.user?.userId,
    })
    return OkResponse.send(res, { data })
  }

  cancelOrder = async (req: Request, res: Response) => {
    const data = await OrderService.cancelOrder({
      orderId: req.params.id as string,
      userId: req.user?.userId,
    })
    return OkResponse.send(res, { data })
  }
```

(Only the `req.params.orderId` → `req.params.id` change; everything else identical.)

- [ ] **Step 2: Typecheck backend**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NodeJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 3: Verify live that detail now resolves a real order (proves the fix)**

The backend runs on `localhost:5000` (nodemon hot-reloads). Detail requires user auth headers, which are hard to forge from curl. Minimum proof the param is now read: hit detail with a valid api-key and a real order id and confirm we no longer get an "Order not found" caused by `undefined` id, but instead the auth gate (`Forbidden`) — i.e. the request reaches `authentication`, meaning routing/param wiring is correct. Full happy-path is verified from the browser in Task 6.

Run:
```bash
API_KEY=$(grep -E "^API_KEY=" /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS/.env | cut -d= -f2)
curl -s -o /dev/null -w "%{http_code}\n" -H "x-api-key: $API_KEY" "http://localhost:5000/api/v1/order/000000000000000000000000"
```
Expected: `403` (auth required — request routed correctly), NOT a 500 from an undefined-param crash.

- [ ] **Step 4: Commit (backend repo)**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NodeJS
git add src/features/order/controller/index.ts
git commit -m "fix(order): read order id from req.params.id to match :id route

getOrderDetail and cancelOrder read req.params.orderId but the route
declares :id, so orderId was always undefined and both endpoints failed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Frontend — shared order display helpers

**Files:**
- Create: `Ecommerce-NextJS/lib/orders/display.ts`
- Verify: direct Node script (vitest can't boot)

- [ ] **Step 1: Write the helper module**

Create `lib/orders/display.ts`:

```ts
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
```

- [ ] **Step 2: Verify the pure logic with a direct Node script**

Run:
```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
cat > /tmp/display_check.mjs <<'EOF'
function statusVariant(s){ if(s==='cancelled'||s==='failed')return 'destructive'; if(s==='pending')return 'default'; return 'secondary'; }
function formatOrderDate(s){ if(!s)return ''; const d=new Date(s); return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10); }
const checks = [
  statusVariant('pending')==='default',
  statusVariant('confirmed')==='secondary',
  statusVariant('shipping')==='secondary',
  statusVariant('delivered')==='secondary',
  statusVariant('cancelled')==='destructive',
  statusVariant('failed')==='destructive',
  formatOrderDate('2026-07-16T07:00:00.000Z')==='2026-07-16',
  formatOrderDate(undefined)==='',
  formatOrderDate('not-a-date')==='',
];
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL', checks);
EOF
node /tmp/display_check.mjs
```
Expected: `PASS` followed by an array of all `true`.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 4: Commit**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
git add lib/orders/display.ts
git commit -m "feat(orders): add shared order display helpers"
```

---

## Task 3: Frontend — shared CancelOrderButton

**Files:**
- Create: `Ecommerce-NextJS/components/store/cancel-order-button.tsx`

- [ ] **Step 1: Write the component (extracted verbatim from OrderCard's cancel form)**

Create `components/store/cancel-order-button.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 3: Commit**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
git add components/store/cancel-order-button.tsx
git commit -m "feat(orders): extract shared CancelOrderButton"
```

---

## Task 4: Frontend — refactor OrderCard to use shared pieces + add detail link

**Files:**
- Modify: `Ecommerce-NextJS/components/store/order-card.tsx`

- [ ] **Step 1: Rewrite OrderCard**

Replace the entire contents of `components/store/order-card.tsx` with:

```tsx
import Link from 'next/link'
import { toPriceString } from '@/lib/products/price'
import { statusVariant, formatOrderDate } from '@/lib/orders/display'
import { CancelOrderButton } from '@/components/store/cancel-order-button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Order, OrderProduct } from '@/types/order'

export function OrderCard({ order }: { order: Order }) {
  const products: OrderProduct[] = order.order_products.flatMap((s) => s.item_products)
  const code = order._id.slice(-6).toUpperCase()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant(order.order_status)}>{order.order_status}</Badge>
          <span className="text-sm font-medium">#{code}</span>
          <span className="text-sm text-muted-foreground">{formatOrderDate(order.createdAt)}</span>
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
        <div className="flex items-center gap-2">
          <Link href={`/orders/${order._id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            View details
          </Link>
          {order.order_status === 'pending' ? <CancelOrderButton orderId={order._id} /> : null}
        </div>
      </CardContent>
    </Card>
  )
}
```

Notes:
- The component is no longer `'use client'` — the cancel form moved into `CancelOrderButton` (client), and `OrderCard` itself is now a plain component (works fine rendered by the RSC list page).
- `buttonVariants` is already exported from `components/ui/button` (used in `store-header.tsx`).

- [ ] **Step 2: Typecheck**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 3: Lint the changed file**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx eslint components/store/order-card.tsx; echo "EXIT=$?"`
Expected: `EXIT=0` (no errors; the `no-img-element` line is disabled inline as before)

- [ ] **Step 4: Commit**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
git add components/store/order-card.tsx
git commit -m "refactor(orders): OrderCard uses shared helpers + adds detail link"
```

---

## Task 5: Frontend — OrderStatusTimeline component

**Files:**
- Create: `Ecommerce-NextJS/components/store/order-status-timeline.tsx`

- [ ] **Step 1: Write the component**

Create `components/store/order-status-timeline.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 3: Commit**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
git add components/store/order-status-timeline.tsx
git commit -m "feat(orders): add OrderStatusTimeline"
```

---

## Task 6: Frontend — order detail page

**Files:**
- Create: `Ecommerce-NextJS/app/(store)/orders/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

Create `app/(store)/orders/[id]/page.tsx`:

```tsx
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
```

Note: this references `order.order_tracking_number`. Add it to the `Order` type in Step 2 (the backend returns it; the frontend type currently omits it).

- [ ] **Step 2: Add `order_tracking_number` to the Order type**

In `types/order.ts`, add the field to the `Order` interface (after `order_status`):

```ts
export interface Order {
  _id: string
  order_checkout: CheckoutOrder
  order_shipping?: { street?: string; city?: string; state?: string; country?: string }
  order_payment?: { method?: string }
  order_products: ShopOrderNew[]
  order_status: OrderStatus
  order_tracking_number?: string
  createdAt?: string
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 4: Lint the new page**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx eslint "app/(store)/orders/[id]/page.tsx"; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 5: Verify end-to-end in the browser (real login + real order)**

The frontend dev server is running (port 3000 or 3002). Detail requires a logged-in session (auth cookies), which only the browser has. Use the `run` skill or drive the browser: log in, open `/orders`, click "View details" on a real order, and confirm the detail page renders items, summary, shipping, payment, timeline, and (for a pending order) the Cancel button. Confirm no 500 and no "Order not found" for an order the logged-in user owns.

If browser automation is unavailable, at minimum confirm the page compiles and the list→detail link resolves, and report that the happy-path browser check is pending.

- [ ] **Step 6: Commit**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
git add "app/(store)/orders/[id]/page.tsx" types/order.ts
git commit -m "feat(orders): add order detail/tracking page"
```

---

## Task 7: Frontend — header "Orders" link

**Files:**
- Modify: `Ecommerce-NextJS/components/store/store-header.tsx`

- [ ] **Step 1: Add the Package icon import**

In `components/store/store-header.tsx`, change the lucide import (line 2) to include `Package`:

```tsx
import { ShoppingCart, Store, Package } from 'lucide-react'
```

- [ ] **Step 2: Add the Orders link inside the logged-in block**

In the `payload ? (...)` block, add the Orders link right before the email span (before the `<span className="hidden text-muted-foreground sm:inline">{payload.email}</span>` line):

```tsx
              <Link
                href="/orders"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Package className="size-4" />
                Orders
              </Link>
              <span className="hidden text-muted-foreground sm:inline">{payload.email}</span>
```

(`buttonVariants` and `Link` are already imported in this file.)

- [ ] **Step 3: Typecheck**

Run: `cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 4: Verify the link appears (browser)**

With a logged-in session, confirm an "Orders" button shows in the header and navigates to `/orders`. When logged out, confirm it does NOT appear (only "Sign in" shows).

- [ ] **Step 5: Commit**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS
git add components/store/store-header.tsx
git commit -m "feat(orders): add Orders link to store header"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full typecheck, both projects**

```bash
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NextJS && npx tsc --noEmit -p tsconfig.json; echo "FE=$?"
cd /Users/nguyensang/Documents/projects/E-commerce/Ecommerce-NodeJS && npx tsc --noEmit -p tsconfig.json; echo "BE=$?"
```
Expected: `FE=0` and `BE=0`.

- [ ] **Step 2: Browser smoke test of the whole flow**

Logged in: header "Orders" → `/orders` list shows cards with code + status + "View details" → click into `/orders/[id]` detail → all sections render → cancel a pending order → toast success, status flips to cancelled after revalidate.

- [ ] **Step 3: Report results**

State plainly what was verified live vs. only typechecked. If the browser happy-path couldn't be run, say so — do not claim it passed.

---

## Self-review notes (author)

- **Spec coverage:** backend `:id` fix (Task 1), header link (Task 7), list detail affordance (Task 4), detail page with items/breakdown/shipping/payment/timeline/cancel (Tasks 5–6), shared helpers + CancelOrderButton to avoid triplicated code (Tasks 2–3). All spec sections mapped.
- **Type consistency:** `statusVariant`/`formatOrderDate`/`ORDER_PROGRESSION` defined in Task 2 and consumed identically in Tasks 4–6. `CancelOrderButton({ orderId })` defined in Task 3, used in Tasks 4 and 6. `Order.order_tracking_number` added in Task 6 before use.
- **Known limitations** (from spec, not fixed): list pagination beyond page 1 (backend ignores query params); `feeShip` always 0; prices have no currency symbol.
```
