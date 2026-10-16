# 20. Route Handlers, Streaming & Realtime

> **Mục tiêu:** biết khi nào cần `route.ts` (và khi nào Server Action đủ), viết được streaming
> response bằng Web Streams, và dựng theo dõi trạng thái đơn hàng realtime bằng SSE —
> áp dụng trực tiếp vào tính năng order tracking của repo.
>
> Phiên bản: Next.js 16.2 — `GET` **không** cache mặc định, `params` là Promise, helper global
> `RouteContext<'/route'>`, `revalidateTag(tag, profile)` hai tham số, `after()` stable.

---

## 1. Overview — Server Action hay Route Handler?

Repo này **chưa có `route.ts` nào** — và đó là đúng: mọi mutation đi qua Server Actions, mọi đọc dữ
liệu đi qua Server Components. Với một app chỉ có một client là chính nó, không cần endpoint riêng.

| Nhu cầu | Dùng | Vì sao |
| --- | --- | --- |
| Form submit, mutation từ UI của mình | **Server Action** | Ít code, type-safe, progressive enhancement |
| Đọc dữ liệu để render | **Server Component** | Không cần endpoint |
| **Webhook từ bên thứ ba** | **Route Handler** | Họ POST vào một URL cố định, không biết action ID |
| **Mobile app / client ngoài** | **Route Handler** | Cần URL ổn định, JSON contract |
| **Streaming response** (SSE, chunked) | **Route Handler** | Server Action trả một giá trị, không phải stream |
| **Trả file** (PDF, CSV) | **Route Handler** | Cần `Content-Type`, `Content-Disposition` |
| **Kiểm soát HTTP status/header** | **Route Handler** | Server Action không set được status |
| `robots.txt`, `sitemap.xml`, OG image | **File convention** (`sitemap.ts`…) | Next có sẵn, đừng tự viết route |

> **Nguyên tắc:** Server Action cho **UI của bạn**. Route Handler cho **mọi thứ khác gọi vào**.

---

## 2. Mental Model

### 🧠 Route Handler là một hàm `(Request) => Response`

Không có gì React trong đó — Web Platform thuần. Export một function **cho mỗi HTTP method**:

```tsx
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok' })
}

export async function POST(request: Request) { /* ... */ }
// Hỗ trợ: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS.
// Method không export → 405. OPTIONS không export → Next tự trả với header `Allow` đúng.
```

⚠️ `route.ts` **không được** nằm cùng thư mục với `page.tsx` (cùng segment là xung đột). Vì vậy route
handler thường đặt dưới `app/api/...`.

### 🧠 `GET` không cache mặc định

| Phiên bản | `GET` handler mặc định |
| --- | --- |
| Next 13–14 | **Static** — chạy một lần lúc build (bẫy kinh điển: "API trả dữ liệu cũ") |
| **Next 15+ (repo: 16.2)** | **Dynamic** — chạy mỗi request |

Muốn cache phải **opt-in** (mục 7). Các method khác (`POST`…) không bao giờ cache.

---

## 3. Cấu trúc một Route Handler đúng chuẩn

```tsx
// app/api/orders/[id]/invoice/route.ts
import type { NextRequest } from 'next/server'
import { apiFetch } from '@/lib/api/server-client'
import { ApiError } from '@/lib/api/http'
import { getClientId } from '@/lib/auth/session'
import { toPriceNumber } from '@/lib/products/price'
import type { Order } from '@/types/order'

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/orders/[id]/invoice'>) {
  // 1. XÁC THỰC — route handler là endpoint công khai, giống Server Action (file 11)
  const clientId = await getClientId()
  if (!clientId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. VALIDATE input — params là Promise (Next 15+)
  const { id } = await ctx.params
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return Response.json({ error: 'Invalid order id' }, { status: 400 })
  }

  // 3. LÀM VIỆC
  let order: Order
  try {
    order = await apiFetch<Order>(`/order/${id}`, { auth: true })
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[invoice] unexpected', e)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }

  // 4. TRẢ VỀ với header đúng
  return new Response(buildInvoiceCsv(order), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoice-${id.slice(-6)}.csv"`,
      'Cache-Control': 'private, no-store',        // hoá đơn là dữ liệu riêng tư
    },
  })
}

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

function buildInvoiceCsv(order: Order): string {
  const rows = [['Sản phẩm', 'Số lượng', 'Đơn giá']]
  for (const shop of order.order_products) {
    for (const item of shop.item_products) {
      // price là Decimal (có thể là { $numberDecimal }) → chuẩn hoá, đừng String() thẳng
      rows.push([item.name, String(item.quantity), String(toPriceNumber(item.price))])
    }
  }
  // BOM ﻿ để Excel nhận UTF-8 (tiếng Việt không vỡ font)
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')
}
```

**Bốn chi tiết đáng học:**

1. **`RouteContext<'/api/orders/[id]/invoice'>`** — helper **global** (sinh bởi `next dev`/`next build`/
   `next typegen`, không cần import), suy ra kiểu `params` từ route literal. Gõ sai đường dẫn → lỗi
   compile. Cách viết tay tương đương: `{ params }: { params: Promise<{ id: string }> }`.
2. **`ApiError.status` map 1:1 sang HTTP status** — nơi `status` trong `ApiError` (file `10`) phát huy
   giá trị.
3. **`Cache-Control: private, no-store`** cho dữ liệu riêng tư — thiếu thì CDN/proxy có thể cache hoá
   đơn của người A rồi trả cho người B. Lỗ bảo mật nghiêm trọng nhất route handler có thể gây ra.
4. **BOM cho CSV tiếng Việt** — không có nó Excel hiện "Ão thun" thay vì "Áo thun".

📄 Đọc body và query:

```tsx
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')        // ?q=...
  const body = await request.json()                      // hoặc .text() / .formData()
  const parsed = createReviewSchema.safeParse(body)      // ⭐ body là `unknown` — luôn validate (zod)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 })
  // ...
}
```

---

## 4. ⭐ Streaming Response với Web Streams

Server Action trả về **một giá trị**. Route handler có thể trả về **một dòng dữ liệu chảy dần**.

### Ví dụ: seller export toàn bộ sản phẩm ra CSV

Seller có 50.000 sản phẩm. Build cả CSV trong memory rồi trả: tốn RAM, byte đầu tiên chỉ đến sau khi
fetch hết mọi trang, dễ timeout. Streaming: gửi header ngay, mỗi trang fetch xong thì đẩy luôn.

```tsx
// app/api/seller/products/export/route.ts
import { apiFetch } from '@/lib/api/server-client'
import { isShop } from '@/lib/auth/session'
import { toPriceNumber } from '@/lib/products/price'
import type { ProductListResult } from '@/types/product'

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export async function GET(request: Request) {
  // ⭐ Mọi kiểm tra CÓ THỂ THẤT BẠI nằm TRƯỚC khi mở stream
  if (!(await isShop())) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('﻿id,name,type,price,quantity\n'))   // browser bắt đầu tải ngay
        for (let page = 1, hasNext = true; hasNext; page++) {
          if (request.signal.aborted) break                 // người dùng huỷ tải → dừng fetch backend
          const result = await apiFetch<ProductListResult>(
            `/product/list/published?page=${page}&limit=100`, { auth: true },
          )
          for (const p of result.data) {
            const line = [p._id, p.product_name, p.product_type, toPriceNumber(p.product_price), p.product_quantity]
            controller.enqueue(encoder.encode(line.map(cell).join(',') + '\n'))
          }
          hasNext = result.pagination.hasNextPage
        }
      } catch (e) {
        console.error('[export] failed while streaming', e)
        // ⚠️ Đã gửi byte → KHÔNG đổi được status thành 500. Báo lỗi TRONG nội dung.
        controller.enqueue(encoder.encode('\n"LỖI: xuất dữ liệu bị ngắt, file không đầy đủ"\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="products.csv"',
      'Cache-Control': 'private, no-store',
    },
  })
}
```

⚠️ **Một khi byte đầu tiên đã gửi, status 200 đã đi rồi** — cùng giới hạn với streaming HTML (file
`06`, `13`). Cách duy nhất là báo lỗi **trong chính stream**: CSV → một dòng cảnh báo; SSE → một event
`error`; NDJSON → một object `{ "error": ... }` cuối.

**Hệ quả thiết kế:** xác thực, validate, kiểm tra quyền **trước** `new ReadableStream`.

---

## 5. ⭐ Realtime: theo dõi trạng thái đơn hàng

### Vấn đề hiện tại

📄 `app/(store)/orders/[id]/page.tsx` render `<OrderStatusTimeline status={order.order_status} />`
(Server Component, đi theo `ORDER_PROGRESSION = ['pending', 'confirmed', 'shipping', 'delivered']` trong
`lib/orders/display.ts`). Trạng thái đổi ở **backend** (shop xác nhận, shipper nhận hàng), nhưng người
đang xem trang **không biết gì** — phải tự F5.

| Cách | Ưu | Nhược | Cho repo? |
| --- | --- | --- | --- |
| **Polling** (`router.refresh()` định kỳ) | Đơn giản nhất, không cần endpoint | Tốn request; trễ tới `interval` | ✅ Bắt đầu ở đây |
| **SSE** (Server-Sent Events) | Một chiều server→client; HTTP thường; tự reconnect | Chỉ text; 6 kết nối/domain trên HTTP/1.1 | ✅ Khi polling không đủ |
| **WebSocket** | Hai chiều, trễ thấp nhất | Cần server riêng (không chạy trên serverless function) | ❌ Quá mức — chỉ cần một chiều |

### Bước 1 — Polling trước. Nếu đủ tốt, dừng lại.

```tsx
// components/store/order-status-poller.tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { OrderStatus } from '@/types/order'

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled', 'failed']

export function OrderStatusPoller({ status, intervalMs = 20_000 }: { status: OrderStatus; intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    if (TERMINAL.includes(status)) return                     // đơn đã xong → không poll
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = setInterval(refreshIfVisible, intervalMs)    // tab ẩn → bỏ qua, tiết kiệm pin
    document.addEventListener('visibilitychange', refreshIfVisible)   // quay lại tab → refresh ngay
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [status, intervalMs, router])

  return null
}
```

```tsx
// app/(store)/orders/[id]/page.tsx
<OrderStatusTimeline status={order.order_status} />
<OrderStatusPoller status={order.order_status} />
```

**`router.refresh()`** yêu cầu server render lại route hiện tại và gửi RSC payload mới; **state của
Client Component được giữ** (file `13`) — người dùng đang gõ comment không mất gì.

⚖️ 20 giây/lần × đơn sống ~2 ngày ≈ 8.600 request cho **mỗi tab đang mở**. Ít người treo trang đơn hàng
lâu → chấp nhận được. **Nếu vậy, đừng làm SSE.**

### Bước 2 — SSE khi polling không đủ

```tsx
// app/api/orders/[id]/stream/route.ts
import { apiFetch } from '@/lib/api/server-client'
import { getClientId } from '@/lib/auth/session'
import type { Order, OrderStatus } from '@/types/order'

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled', 'failed']
const POLL_MS = 5_000
const MAX_DURATION_MS = 5 * 60_000        // tự đóng sau 5 phút; EventSource sẽ reconnect

export async function GET(request: Request, ctx: RouteContext<'/api/orders/[id]/stream'>) {
  // ⭐ Kiểm tra TRƯỚC khi mở stream
  if (!(await getClientId())) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: 'Invalid order id' }, { status: 400 })

  const encoder = new TextEncoder()
  let closed = false                        // dùng chung cho start() và cancel()
  let keepAlive: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    async start(controller) {
      const write = (chunk: string) => { if (!closed) controller.enqueue(encoder.encode(chunk)) }
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      // Comment SSE (dòng bắt đầu bằng ':') giữ kết nối sống qua proxy/load balancer
      keepAlive = setInterval(() => write(': keep-alive\n\n'), 15_000)
      request.signal.addEventListener('abort', () => { closed = true })   // client đóng tab

      try {
        let last: OrderStatus | null = null
        for (const startedAt = Date.now(); !closed && Date.now() - startedAt < MAX_DURATION_MS; ) {
          const order = await apiFetch<Order>(`/order/${id}`, { auth: true })
          if (order.order_status !== last) {
            last = order.order_status
            send('status', { status: last, trackingNumber: order.order_tracking_number ?? null })
          }
          if (TERMINAL.includes(order.order_status)) { send('done', { status: last }); break }
          await new Promise((r) => setTimeout(r, POLL_MS))
        }
      } catch (e) {
        console.error('[order-stream]', e)
        send('error', { message: 'Mất kết nối theo dõi đơn hàng' })   // báo lỗi TRONG stream
      } finally {
        clearInterval(keepAlive)
        if (!closed) { closed = true; controller.close() }
      }
    },
    cancel() {                              // consumer huỷ stream → dừng vòng lặp, không enqueue nữa
      closed = true
      clearInterval(keepAlive)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',            // tắt buffering của nginx
    },
  })
}
```

⚠️ **Phải dừng khi client ngắt kết nối** (`request.signal` + `cancel()`). Thiếu nó, vòng lặp vẫn gọi
backend mỗi 5 giây suốt 5 phút cho một tab đã đóng — và `enqueue` vào stream đã huỷ sẽ throw.

| Chi tiết bắt buộc | Thiếu thì sao |
| --- | --- |
| `Content-Type: text/event-stream` | `EventSource` không parse |
| `Cache-Control: no-cache, no-transform` | Proxy cache hoặc nén → stream bị giữ |
| `X-Accel-Buffering: no` | nginx buffer cả stream → event chỉ đến khi đóng kết nối |
| Keep-alive comment (`: ...`) | Proxy/LB đóng kết nối "idle" sau ~30–60s |
| Node runtime (mặc định — **đừng** đặt `runtime = 'edge'`) | Edge giới hạn thời gian thực thi |

Không cần `export const dynamic = 'force-dynamic'`: `GET` vốn đã dynamic, và handler còn đọc cookie.

**Định dạng SSE:**

```
event: status                  ← tên event (tuỳ chọn; mặc định "message")
data: {"status":"shipping"}    ← payload; nhiều dòng data liên tiếp được nối bằng \n
                               ← DÒNG TRỐNG kết thúc event (bắt buộc — thiếu là browser chờ mãi)
```

### Bước 3 — Client nhận event: realtime là trigger, không phải store

```tsx
// components/store/order-status-live.tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { OrderStatus } from '@/types/order'

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled', 'failed']

export function OrderStatusLive({ orderId, initialStatus }: { orderId: string; initialStatus: OrderStatus }) {
  const router = useRouter()

  useEffect(() => {
    if (TERMINAL.includes(initialStatus)) return              // đơn đã xong, không mở kết nối
    let last = initialStatus
    const es = new EventSource(`/api/orders/${orderId}/stream`)

    es.addEventListener('status', (e) => {
      const { status } = JSON.parse(e.data) as { status: OrderStatus }
      if (status === last) return                             // event đầu = trạng thái hiện tại → bỏ qua
      last = status
      toast.info(`Đơn hàng chuyển sang: ${status}`)
      router.refresh()                                        // Server Component render lại với dữ liệu mới
    })
    es.addEventListener('done', () => es.close())
    // Lỗi mạng: EventSource TỰ reconnect. Server trả non-200 → readyState CLOSED, không reconnect.

    return () => es.close()
  }, [orderId, initialStatus, router])

  return null
}
```

❌ Đừng gọi `toast`/`router.refresh()` **bên trong** updater của `setState` — updater phải pure, Strict
Mode gọi nó hai lần → toast đôi. Ở đây component **không cần state** vì nó không render gì.

```tsx
// app/(store)/orders/[id]/page.tsx
<OrderStatusTimeline status={order.order_status} />
<OrderStatusLive orderId={order._id} initialStatus={order.order_status} />
```

`OrderStatusLive` nhận event → `router.refresh()` → Server Component render lại. Nhờ đó
`OrderStatusTimeline` vẫn là Server Component (0 byte JS), không có hai nguồn sự thật, và mọi dữ liệu
liên quan (tracking number, ngày) cập nhật cùng lúc.

⚠️ **Giới hạn 6 kết nối/domain trên HTTP/1.1** (tính chung mọi tab): mở 6 tab đơn hàng là tab thứ 7 —
và mọi request khác tới domain — bị treo. HTTP/2 multiplex nên gần như không còn giới hạn này. Hosting
chưa có HTTP/2 → polling an toàn hơn.

---

## 6. Webhook: nhận callback từ cổng thanh toán

📄 `Order.order_payment.method` của repo nhận `'COD' | 'CARD' | 'MOMO'`. Với MOMO, cổng thanh toán sẽ
**POST vào URL của bạn** để báo kết quả — ca dùng route handler **không thể thay thế**.

```tsx
// app/api/webhooks/momo/route.ts
import crypto from 'node:crypto'
import { after } from 'next/server'
import { revalidateTag } from 'next/cache'

interface MomoPayload {
  orderId: string; requestId: string; resultCode: number; amount: number; transId: string; signature: string
}

/** Rút gọn — chuỗi ký thật của MoMo gồm nhiều field hơn theo thứ tự alphabet; xem tài liệu cổng. */
function verifySignature(p: MomoPayload, secret: string): boolean {
  const raw = `amount=${p.amount}&orderId=${p.orderId}&requestId=${p.requestId}&resultCode=${p.resultCode}&transId=${p.transId}`
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('hex'))
  const received = Buffer.from(String(p.signature))
  // So sánh THỜI GIAN HẰNG SỐ: `===` thoát sớm ở byte khác đầu tiên → đo thời gian để đoán dần
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

export async function POST(request: Request) {
  const secret = process.env.MOMO_SECRET_KEY
  if (!secret) return Response.json({ error: 'Not configured' }, { status: 500 })

  let payload: MomoPayload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 1. ⭐ XÁC THỰC TRƯỚC MỌI THỨ KHÁC
  if (!verifySignature(payload, secret)) return Response.json({ error: 'Invalid signature' }, { status: 401 })

  // 2. ⭐ IDEMPOTENCY — cổng sẽ GỬI LẠI nếu không nhận được 2xx
  if (await hasProcessedTransaction(payload.transId)) return Response.json({ received: true })

  // 3. Xử lý — các hàm *Transaction / *OrderPayment là giả định, gọi backend Express
  try {
    if (payload.resultCode === 0) await confirmOrderPayment(payload.orderId, payload.transId, payload.amount)
    else await failOrderPayment(payload.orderId, payload.resultCode)
    await markTransactionProcessed(payload.transId)
  } catch (e) {
    console.error('[webhook:momo] processing failed', e)
    return Response.json({ error: 'Processing failed' }, { status: 500 })   // ⭐ 500 để cổng THỬ LẠI
  }

  // 4. Next 16: revalidateTag cần tham số thứ hai (cacheLife profile). 'max' = stale-while-revalidate.
  revalidateTag('orders', 'max')

  // 5. Việc chậm, không ảnh hưởng kết quả → chạy SAU khi response đã gửi
  after(() => sendPaymentReceiptEmail(payload.orderId))

  return Response.json({ received: true })                 // trả 200 NHANH — cổng timeout sau vài giây
}
```

| # | Nguyên tắc | Bỏ đi thì |
| --- | --- | --- |
| 1 | **Xác thực signature TRƯỚC** khi tin bất kỳ field nào | Ai cũng POST được `{resultCode: 0}` → đơn "đã thanh toán" miễn phí |
| 2 | **`timingSafeEqual`**, không `===` | Timing attack đoán được signature |
| 3 | **Idempotency theo transaction ID** | Cổng gửi lại → xử lý thanh toán hai lần |
| 4 | **Trả 500 khi xử lý lỗi** | Cổng tưởng đã xong → không gửi lại → mất giao dịch |
| 5 | **Trả 200 nhanh** | Timeout → cổng gửi lại → nhân đôi tải |

**`after()` vs queue:** `after(cb)` chạy `cb` sau khi response đã gửi, trong cùng lần thực thi (bị giới
hạn bởi `maxDuration` của platform; vẫn chạy kể cả khi handler throw). Đủ cho việc nhẹ như email, log,
analytics. Việc **phải** thành công và có thể kéo dài (đối soát, gọi nhiều hệ thống) → ghi vào job queue
có retry.

```tsx
// ❌ Chặn response chờ gửi email — cổng có thể timeout và gửi lại
await sendPaymentReceiptEmail(orderId)
return Response.json({ received: true })

// ✅ Response đi ngay, email gửi sau
after(() => sendPaymentReceiptEmail(orderId))
return Response.json({ received: true })
```

⚠️ **Webhook route KHÔNG nằm trong `proxy.ts` matcher** — và phải giữ như vậy:

```tsx
// proxy.ts
export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
```

Webhook không có cookie session → nếu proxy chạy sẽ `redirectToLogin`. Thêm `/api/:path*` vào matcher
là webhook vỡ.

---

## 7. Route Handler và Caching

`GET` không cache mặc định (mục 2). Opt-in bằng route segment config (repo **chưa** bật
`cacheComponents`, nên dùng mô hình này):

```tsx
// app/api/products/featured/route.ts — dữ liệu công khai, cache 1 giờ
import { apiFetch } from '@/lib/api/server-client'
import type { ProductListResult } from '@/types/product'

export const revalidate = 3600

export async function GET() {
  const result = await apiFetch<ProductListResult>('/product?page=1&limit=12', { tags: ['products'] })
  return Response.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60' },
  })
}
```

⚠️ Đọc `request.headers`, `cookies()`, `headers()` trong handler → luôn dynamic, cấu hình cache không có
tác dụng. Endpoint cache được phải **không phụ thuộc người gọi**.

| Khai báo | Tầng | Ai đọc |
| --- | --- | --- |
| `export const revalidate = 3600` / `dynamic = 'force-static'` | **Next.js** (cache phía server) | Next server |
| Header `Cache-Control: s-maxage=…` | **CDN / browser** | Vercel, Cloudflare, browser |

Thường bạn muốn **cả hai**. `stale-while-revalidate=60` bảo CDN "trả bản cũ ngay, lấy bản mới ở
background".

> Khi bật `cacheComponents`, `GET` handler theo mô hình của page: prerender nếu không đọc dữ liệu
> runtime, và cache dữ liệu bằng `'use cache'` — nhưng **trong một hàm helper**, không đặt trực tiếp
> trong thân handler.

⚠️ **Dữ liệu riêng tư: luôn `Cache-Control: private, no-store`.** CDN cache response của người A rồi trả
cho người B là loại sự cố đã xảy ra ở nhiều công ty lớn.

---

## 8. Runtime: Node vs Edge

```tsx
export const runtime = 'nodejs'    // mặc định
export const runtime = 'edge'      // opt-in
```

| | Node (mặc định) | Edge |
| --- | --- | --- |
| Node API (`node:crypto`, `fs`, `Buffer`) | ✅ | ❌ (chỉ Web API, Web Crypto) |
| Kết nối sống lâu (SSE, export dài) | ✅ | ⚠️ Giới hạn thời gian thực thi |
| Thư viện npm | ✅ | ⚠️ Nhiều cái không chạy |
| Cold start / vị trí | Chậm hơn, một region | Nhanh, gần người dùng |

Mọi route handler trong chương này (webhook cần `node:crypto`, SSE, CSV export) đều để **mặc định Node**.
Edge chỉ đáng khi handler cực nhẹ và cần ở gần người dùng.

📄 Lưu ý về `proxy.ts`: từ Next 16, Proxy **mặc định chạy Node.js runtime** và **không** cho đặt
`runtime` (đặt là lỗi). `lib/auth/tokens.ts` dùng `atob` thay vì `Buffer` là thói quen tốt từ thời
middleware chạy Edge — vẫn đúng, nhưng không còn là bắt buộc.

---

## 9. When NOT to Use Route Handlers

| Đừng làm | Vì | Dùng gì |
| --- | --- | --- |
| Tạo `/api/products` để trang của mình fetch | Waterfall client→server, mất type safety | Server Component gọi `apiFetch` trực tiếp |
| Tạo `/api/cart/add` cho form của mình | Server Action làm được, có progressive enhancement | Server Action |
| Proxy toàn bộ backend qua `/api/*` | Thêm một chặng latency, trùng routing | Gọi backend từ Server Component |
| Đặt logic nghiệp vụ trong handler | Khó test | `lib/` + handler mỏng |

⚖️ **Trade-off:** route handler cho URL ổn định, toàn quyền status/header, streaming — đổi lại nó là
**endpoint công khai** (tự làm authn/authz/validate/rate-limit), không có type safety end-to-end như
Server Action, và không đổi được status sau byte đầu tiên. Realtime đổi "không cần F5" lấy kết nối sống
lâu (SSE) hoặc nhiều request (polling).

---

## 10. Best Practices

1. **Server Action cho UI của mình; Route Handler cho mọi thứ khác gọi vào.**
2. **Type context bằng `RouteContext<'/route'>`**; nhớ `await ctx.params`.
3. **Route handler là endpoint công khai** — authn, authz, validate body (`unknown`) như Server Action (file `11`).
4. **Xác thực + validate TRƯỚC khi mở stream.** Sau byte đầu tiên không đổi được status.
5. **Stream phải dừng khi client ngắt** (`request.signal`, `cancel()`).
6. **`Cache-Control: private, no-store` cho MỌI dữ liệu riêng tư.**
7. **`GET` mặc định dynamic** — cache là opt-in, và chỉ cho dữ liệu không phụ thuộc người gọi.
8. **Webhook:** verify signature bằng `timingSafeEqual`, idempotency theo transaction ID, trả 500 khi lỗi,
   việc chậm đưa vào `after()` hoặc queue.
9. **Bắt đầu bằng polling.** `router.refresh()` mỗi 20 giây đủ tốt thì đừng làm SSE.
10. **Realtime là trigger, không phải store:** nhận event → `router.refresh()` → Server Component render lại.

---

## Tự kiểm tra

1. Kể ba ca route handler không thể thay bằng Server Action.
2. `GET` handler ở Next 14 và Next 16 khác nhau thế nào về cache? Làm sao opt-in cache?
3. `RouteContext<'/api/orders/[id]/stream'>` cho bạn gì so với tự viết kiểu `params`?
4. Vì sao mọi kiểm tra có thể thất bại phải nằm **trước** `new ReadableStream`?
5. Điều gì xảy ra nếu SSE handler không lắng nghe `request.signal` / `cancel()`?
6. `X-Accel-Buffering: no` giải quyết gì? Triệu chứng khi thiếu?
7. Vì sao `OrderStatusLive` không dùng `useState` và `return null`?
8. Kể 5 nguyên tắc webhook và sự cố tương ứng nếu bỏ mỗi cái. `after()` khác queue ở đâu?
9. Vì sao webhook route **không** được nằm trong `proxy.ts` matcher?
10. `export const revalidate` và header `Cache-Control` khác nhau ở tầng nào?

➡️ Tiếp theo: `21-typescript-nang-cao-cho-react.md`
