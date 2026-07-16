# Order Tracking — Design Spec

**Date:** 2026-07-16
**Status:** Approved (design), pending spec review

## Problem

After placing an order, a customer has no reliable way to see what they ordered. An order-history page (`/orders`) already exists and works, but:

1. **There is no way to reach it** — no "Orders" link anywhere in the store header. The page is only reachable via the one-time `redirect('/orders')` right after checkout, so once the user navigates away it's effectively lost.
2. **There is no per-order detail view** — the list shows a summary but no shipping address, payment method, price breakdown, or status timeline.
3. **The detail and cancel endpoints are broken on the backend** — the route declares `:id` but the controller reads `req.params.orderId` (always `undefined`), so `GET /order/:id` and `PATCH /order/:id/cancel` don't work. The existing "Cancel order" button on the order card is therefore silently broken.

The user's ask ("sau khi order rồi user không thể biết mình đã order gì") is primarily a discoverability + detail problem, plus a latent backend bug that blocks the "full" tracking experience they chose.

## Goal / Scope

Full order tracking: **list + detail + cancel**. Reuse existing code; fill the three gaps above.

Out of scope (YAGNI): admin status transitions, pagination UI beyond page 1 (backend doesn't wire query params yet — noted below), search/filter, returns/refunds.

## Existing building blocks (reused as-is)

| Piece | Location | Reuse |
|---|---|---|
| Order list page | `app/(store)/orders/page.tsx` | Extend: add order code + "View details" link |
| `OrderCard` | `components/store/order-card.tsx` | Extend: order code + detail link; keep cancel form |
| `placeOrderAction` / `cancelOrderAction` | `actions/order.actions.ts` | `cancelOrderAction` reused unchanged (works once backend `:id` fixed) |
| `Order`, `OrderProduct`, `ORDER_STATUSES`, `OrderStatus` | `types/order.ts` | Reused; no new types needed |
| `apiFetch` (`auth`, method inference, `unwrap`) | `lib/api/server-client.ts`, `lib/api/http.ts` | Reused |
| `toPriceString` | `lib/products/price.ts` | Reused |
| `Card`, `Badge`, `Button` | `components/ui/` | Reused |
| `statusVariant`, `formatDate` | currently local in `order-card.tsx` | Lift into a shared helper so the detail page and timeline reuse them (see below) |

## Changes

### Backend (Ecommerce-NodeJS) — 1 fix

**`src/features/order/controller/index.ts`** — `getOrderDetail` and `cancelOrder` read `req.params.orderId`; the route (`src/features/order/routes/index.ts:12-13`) declares `:id`. Change both handlers to read `req.params.id`.

- Root cause of broken detail + cancel. Chosen fix location: controller (matches the existing route and the URLs the frontend already calls; route is the URL contract, so we conform the controller to it).
- No other backend change. (Pagination-query wiring is intentionally left alone — see "Known limitations".)

### Frontend (Ecommerce-NextJS) — 4 changes

1. **Shared order UI helpers** — new `lib/orders/display.ts` exporting `statusVariant(status)` and `formatOrderDate(s?)`, moved verbatim from `order-card.tsx`. Reason: the detail page and the timeline both need the same status→badge mapping and date format; duplicating a third copy is the smell we avoid. `order-card.tsx` imports from here instead of defining locally.

2. **Header "Orders" link** — `components/store/store-header.tsx`, inside the `payload ? (...)` block (near the email span, before Sign out). A `<Link href="/orders">` styled like the existing outline links, with a lucide icon (`Package`) to match the Cart/Store icon convention. Only shown when logged in (orders require auth).

3. **List → detail affordance** — `OrderCard` gains:
   - An order code: `#` + last 6 chars of `order._id` (mirrors the comment feature's `••{slice(-4)}` convention; 6 chars is enough to disambiguate visually).
   - A "View details" `<Link href={\`/orders/${order._id}\`}>` in the card header.
   The card stays a client component (it owns the cancel form). The link is a plain `<Link>`, so it works inside the client component.

4. **Order detail page** — new `app/(store)/orders/[id]/page.tsx` (async server component):
   - Fetch: `const order = await apiFetch<Order>(\`/order/${id}\`, { auth: true })` in a try/catch (mirrors `products/[id]/page.tsx`). Detail returns a raw `Order` (not pagination-wrapped), so no `{ data }` unwrap wrapper — `unwrap` already peels the `{ data }` envelope.
   - Renders:
     - Back link to `/orders`.
     - Header: order code, `Badge` status, created date, `totalCheckout`.
     - `OrderStatusTimeline` (new component, see below).
     - Line items: flatten `order.order_products.flatMap(g => g.item_products)`, render thumb / name / qty / price (same row layout as `OrderCard`).
     - Price breakdown card: `totalPrice` (subtotal), `totalDiscount`, `feeShip`, `totalCheckout` — each via `toPriceString`.
     - Shipping address: `order_shipping.{street, city, state, country}`.
     - Payment: `order_payment.method`.
     - Tracking number if `order_tracking_number` is non-empty.
     - Cancel button when `order_status === 'pending'` — reuse the same cancel `<form>` pattern as `OrderCard` (a small client wrapper, or lift the cancel form into a shared `CancelOrderButton` client component reused by both card and detail page).
   - Error / not-found: render an inline `text-destructive` message like the other store pages (the backend returns "Order not found" or an authz error, surfaced via `ApiError.message`).

5. **`OrderStatusTimeline`** — new `components/store/order-status-timeline.tsx` (client or server; no interactivity needed, so server/plain component). Given `status: OrderStatus`, renders the happy-path progression `pending → confirmed → shipping → delivered` with completed steps highlighted. If status is `cancelled` or `failed`, render a single destructive badge/line instead of the progression. Uses the shared `statusVariant`. Purely presentational.

## Data flow

```
Header "Orders" link ──▶ /orders (RSC)
                          │  apiFetch<{data:Order[]}>('/order', {auth}) ──▶ GET /api/v1/order
                          │      backend: OkResponse{ data: { data:[...], pagination } }
                          │      unwrap peels outer .data ⇒ { data:[...], pagination }
                          │      page reads result.data  ⇒ Order[]
                          ▼
                        OrderCard[] (each links to ▼)
                          ▼
/orders/[id] (RSC) ── apiFetch<Order>('/order/{id}', {auth}) ──▶ GET /api/v1/order/{id}
                          backend (after :id fix): OkResponse{ data: Order }
                          unwrap peels .data ⇒ Order
                          ▼
                    detail + timeline + CancelOrderButton
                          │ (cancel) cancelOrderAction ──▶ PATCH /api/v1/order/{id}/cancel
                          ▼ revalidatePath('/orders') (+ '/orders/[id]')
```

Auth: all order endpoints require `auth: true` (forwards `x-client-id` + access token). `userId` is derived server-side from the token; the frontend never sends it. Ownership is enforced by the backend on detail/cancel.

## Error handling

- List/detail fetch failures → inline `text-destructive` message, same as existing store pages. No crash.
- Detail: backend throws `NotFoundError` ("Order not found") or `BadRequestError` ("not authorized") → surfaced as `ApiError.message`.
- Cancel: `cancelOrderAction` already returns `{ ok, message }` and toasts. Backend rejects cancel when status ≠ pending; that message is surfaced.
- The detail page must not assume optional fields exist: `order_shipping`, `order_payment`, `order_checkout` are `Object` on the backend with `default {}`, so guard with `?.` and fallbacks (mirrors `OrderCard`'s `order.order_checkout?.totalCheckout ?? 0`).

## Testing / verification

- Typecheck both projects (`tsc --noEmit`) — must stay green.
- Backend runs on `localhost:5000`; verify end-to-end against the live server:
  - `GET /api/v1/order/{realId}` returns 200 with a single Order (proves the `:id` fix).
  - The list still returns the pagination-wrapped shape the page already handles.
- Manual/logical check of the timeline mapping for each status value (including `cancelled`/`failed`).
- `lib/orders/display.ts` is pure — add a small unit test only if the existing `lib/**/__tests__` convention makes it cheap (vitest currently can't boot under Node 20.9; don't block on it — verify logic directly if needed).

## Known limitations (documented, not fixed here)

- **Pagination**: backend `getOrdersByUser` controller ignores `req.query.page/limit`, so only page 1 (10 orders) is ever returned. The list envelope includes `pagination`, but paging UI is out of scope until the backend forwards query params. If the user has >10 orders, older ones won't show — call this out to the user.
- `feeShip` is currently always `0` from checkout; the breakdown will show `0.00` for shipping. Displayed as-is (accurate to backend state).
- Prices render as bare numbers (e.g. `9.99`) — no currency symbol anywhere in the app. We match the existing convention rather than introduce one unilaterally.
```
