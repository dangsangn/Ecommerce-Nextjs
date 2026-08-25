# 20. Route Handlers, Streaming & Realtime

> **Mục tiêu:** biết khi nào cần `route.ts` (và khi nào Server Action đủ), viết được streaming
> response bằng Web Streams, và dựng theo dõi trạng thái đơn hàng realtime bằng SSE —
> áp dụng trực tiếp vào tính năng order tracking của repo.

---

## 1. Overview

### Repo này chưa có `route.ts` nào — và điều đó đúng

```bash
$ find app -name "route.ts"
# (không có kết quả)
```

Mọi mutation đi qua Server Actions. Mọi đọc dữ liệu đi qua Server Components. **Đây là kiến trúc đúng**
cho một app chỉ có một client là chính nó.

Vậy khi nào bạn *thực sự* cần route handler?

### Bảng quyết định: Server Action vs Route Handler

| Nhu cầu | Dùng | Vì sao |
| --- | --- | --- |
| Form submit, mutation từ UI của mình | **Server Action** | Ít code, type-safe, progressive enhancement |
| Đọc dữ liệu để render | **Server Component** | Không cần endpoint |
| **Webhook từ bên thứ ba** | **Route Handler** | Họ POST vào một URL cố định, không biết action ID |
| **Mobile app / client ngoài gọi vào** | **Route Handler** | Cần URL ổn định, JSON contract |
| **Streaming response** (SSE, chunked) | **Route Handler** | Server Action trả một giá trị, không phải stream |
| **Trả file** (PDF, CSV, image) | **Route Handler** | Cần set `Content-Type`, `Content-Disposition` |
| **Cần kiểm soát HTTP status/header** | **Route Handler** | Server Action không set được status |
| Health check / monitoring | **Route Handler** | `/api/health` phải là URL cố định |
| `robots.txt`, `sitemap.xml`, OG image | **Route Handler** hoặc file convention | Cần content-type riêng |

> **Nguyên tắc:** Server Action cho **UI của bạn**. Route Handler cho **mọi thứ khác gọi vào**.

---

## 2. Mental Model

### 🧠 Route Handler là một hàm `(Request) => Response`

Không có gì React trong đó. Nó là Web Platform thuần:

```tsx
// app/api/health/route.ts
export async function GET(request: Request): Promise<Response> {
  return Response.json({ status: 'ok' })
}
```

Bạn export một function **cho mỗi HTTP method** bạn muốn hỗ trợ:

```tsx
export async function GET(req: Request) { /* ... */ }
export async function POST(req: Request) { /* ... */ }
export async function PATCH(req: Request) { /* ... */ }
export async function DELETE(req: Request) { /* ... */ }
// Method không export → tự động trả 405 Method Not Allowed
```

**Điểm mấu chốt:** vì đây là `Request`/`Response` chuẩn Web, mọi thứ bạn biết về HTTP đều áp dụng —
và code này chạy được ở cả Node runtime và Edge runtime (nếu không dùng Node API).

---

## 3. Cấu trúc một Route Handler đúng chuẩn

```tsx
// app/api/orders/[id]/invoice/route.ts
import { NextRequest } from 'next/server'
import { apiFetch } from '@/lib/api/server-client'
import { ApiError } from '@/lib/api/http'
import { getClientId } from '@/lib/auth/session'
import type { Order } from '@/types/order'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },     // ⭐ params là Promise, như page
) {
  // 1. XÁC THỰC — route handler là endpoint công khai, giống Server Action (file 11)
  const clientId = await getClientId()
  if (!clientId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 2. VALIDATE input
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return Response.json({ error: 'Invalid order id' }, { status: 400 })
  }

  // 3. LÀM VIỆC
  let order: Order
  try {
    order = await apiFetch<Order>(`/order/${id}`, { auth: true })
  } catch (e) {
    if (e instanceof ApiError) {
      return Response.json({ error: e.message }, { status: e.status })
    }
    console.error('[invoice] unexpected', e)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }

  // 4. TRẢ VỀ với header đúng
  const csv = buildInvoiceCsv(order)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoice-${id.slice(-6)}.csv"`,
      'Cache-Control': 'private, no-store',        // hoá đơn là dữ liệu riêng tư
    },
  })
}

function buildInvoiceCsv(order: Order): string {
  const rows = [['Sản phẩm', 'Số lượng', 'Đơn giá']]
  for (const shop of order.order_products) {
    for (const item of shop.item_products) {
      rows.push([item.name, String(item.quantity), String(item.price)])
    }
  }
  // BOM ﻿ để Excel nhận UTF-8 (tiếng Việt không bị lỗi font)
  return '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}
```

**Bốn chi tiết đáng học:**

**(1) `params` là Promise** — giống `page.tsx` (file `09`), cùng lý do.

**(2) `ApiError.status` được dùng trực tiếp** làm HTTP status. Đây là nơi `status` trong `ApiError`
(file `10`, mục "chưa dùng") cuối cùng phát huy giá trị: nó map 1:1 sang response.

**(3) `Cache-Control: private, no-store`** cho dữ liệu riêng tư. **Bắt buộc** — nếu thiếu, CDN hoặc
proxy có thể cache hoá đơn của người này và trả cho người khác. Đây là lỗ bảo mật nghiêm trọng nhất
mà route handler có thể gây ra.

**(4) BOM `﻿` cho CSV tiếng Việt.** Không có nó, Excel mở file và hiện "Ãáo thun" thay vì "Áo thun".
Loại chi tiết chỉ biết khi đã từng bị.

---

## 4. ⭐ Streaming Response với Web Streams

Server Action trả về **một giá trị**. Route handler có thể trả về **một dòng dữ liệu chảy dần**.

### Ví dụ: export toàn bộ sản phẩm ra CSV

Vấn đề: seller có 50.000 sản phẩm. Build cả CSV trong memory rồi trả về:
- Tốn ~50MB RAM cho một request
- TTFB rất chậm (phải fetch hết mọi trang trước khi gửi byte đầu)
- Có thể timeout

```tsx
// app/api/seller/products/export/route.ts
import { apiFetch } from '@/lib/api/server-client'
import { getAccessPayload } from '@/lib/auth/session'
import type { ProductListResult } from '@/types/product'

const PAGE_SIZE = 100

function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

export async function GET() {
  const payload = await getAccessPayload()
  if (!payload?.roles?.includes('shop')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Gửi BOM + header NGAY → browser bắt đầu tải file lập tức
        controller.enqueue(encoder.encode('﻿'))
        controller.enqueue(encoder.encode('id,name,type,price,quantity\n'))

        let page = 1
        let hasNext = true
        while (hasNext) {
          const result = await apiFetch<ProductListResult>(
            `/product/list/published?page=${page}&limit=${PAGE_SIZE}`,
            { auth: true },
          )
          for (const p of result.data) {
            const line = [
              csvCell(p._id),
              csvCell(p.product_name),
              csvCell(p.product_type),
              csvCell(p.product_price),
              csvCell(p.product_quantity),
            ].join(',')
            controller.enqueue(encoder.encode(line + '\n'))
          }
          hasNext = result.pagination.hasNextPage
          page += 1
        }
        controller.close()
      } catch (e) {
        console.error('[export] failed at streaming', e)
        // ⚠️ Đã gửi byte rồi → KHÔNG đổi được status thành 500.
        // Cách duy nhất: viết một dòng lỗi vào chính file để người dùng thấy.
        controller.enqueue(encoder.encode('\n"LỖI: xuất dữ liệu bị ngắt, file không đầy đủ"\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="products.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
```

**Lợi ích đo được:**

| | Build hết rồi trả | Streaming |
| --- | --- | --- |
| TTFB | ~30 giây (50k sản phẩm) | **~200ms** |
| RAM peak | ~50MB | **~100KB** (một trang) |
| Người dùng thấy gì | Trang treo 30s | Dialog "Save file" hiện ngay, progress tăng dần |
| Timeout risk | Cao | Thấp (kết nối luôn có dữ liệu) |

⚠️ **Điểm quan trọng ở khối `catch`:** một khi đã `enqueue` byte đầu tiên, response đã được gửi với
status 200. **Bạn không thể đổi thành 500.** Đây là cùng giới hạn đã nói ở file `06` (streaming HTML)
và file `13`.

Cách xử lý duy nhất là **báo lỗi trong chính nội dung stream**. Với CSV: một dòng cảnh báo. Với SSE:
một event `error`. Với JSON stream: một object `{ error: ... }` cuối cùng.

**Hệ quả thiết kế:** làm mọi việc **có thể thất bại** (xác thực, validate, kiểm tra quyền) **TRƯỚC**
khi mở stream. Ở ví dụ trên, `getAccessPayload` và kiểm tra role đều nằm trước `new ReadableStream`.

---

## 5. ⭐ Realtime: theo dõi trạng thái đơn hàng bằng SSE

Đây là ứng dụng có giá trị nhất cho repo này.

### Vấn đề hiện tại

📄 `components/store/order-status-timeline.tsx` hiển thị tiến trình đơn hàng:

```tsx
import { ORDER_PROGRESSION } from '@/lib/orders/display'

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  if (status === 'cancelled' || status === 'failed') { /* ... */ }
  const currentIndex = ORDER_PROGRESSION.indexOf(status)
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {ORDER_PROGRESSION.map((step, i) => {
        const done = i <= currentIndex
        // ...
      })}
    </ol>
  )
}
```

📄 `lib/orders/display.ts`:

```tsx
export const ORDER_PROGRESSION: OrderStatus[] = ['pending', 'confirmed', 'shipping', 'delivered']
```

**Trạng thái này thay đổi ở phía backend** (khi shop xác nhận, khi shipper nhận hàng). Nhưng người dùng
đang xem `/orders/abc123` **không biết gì** — họ phải tự F5.

Đây chính là trải nghiệm mà một app giao hàng **không được** có.

### Ba lựa chọn kỹ thuật

| Cách | Ưu | Nhược | Phù hợp với repo? |
| --- | --- | --- | --- |
| **Polling** (`setInterval` + `router.refresh()`) | Đơn giản nhất, không cần backend mới | Tốn request; trễ tới `interval` | ✅ Bắt đầu ở đây |
| **SSE** (Server-Sent Events) | Một chiều server→client; dùng HTTP thường; tự reconnect | Chỉ text; giới hạn 6 kết nối/domain trên HTTP/1.1 | ✅ **Đúng nhất cho ca này** |
| **WebSocket** | Hai chiều, độ trễ thấp nhất | Cần server riêng (không chạy trên serverless function); phức tạp hơn | ❌ Quá mức — ta chỉ cần một chiều |

**Vì sao SSE là đúng cho order tracking:** dữ liệu chỉ đi **một chiều** (server → client), là **text**,
và tần suất **thấp** (vài lần trong cả vòng đời đơn hàng). SSE làm đúng việc đó với một `Response`
thường và tự động reconnect miễn phí.

### Bước 1 — Cách đơn giản trước: polling

Luôn bắt đầu ở đây. Nếu nó đủ tốt, dừng lại.

```tsx
// components/store/order-status-poller.tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { OrderStatus } from '@/types/order'

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled', 'failed']

/**
 * Refresh trang định kỳ khi đơn hàng còn đang chạy.
 * Dừng hẳn khi đã tới trạng thái cuối — không polling vô ích.
 */
export function OrderStatusPoller({
  status,
  intervalMs = 20_000,
}: {
  status: OrderStatus
  intervalMs?: number
}) {
  const router = useRouter()

  useEffect(() => {
    if (TERMINAL.includes(status)) return          // đơn đã xong → không poll

    const tick = () => {
      // Không poll khi tab đang ẩn — tiết kiệm pin và request
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = setInterval(tick, intervalMs)

    // Refresh ngay khi người dùng quay lại tab
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, intervalMs, router])

  return null
}
```

Gắn vào trang chi tiết:

```tsx
// app/(store)/orders/[id]/page.tsx
<OrderStatusTimeline status={order.order_status} />
<OrderStatusPoller status={order.order_status} />
```

**`router.refresh()` làm gì?** Nó yêu cầu server render lại route hiện tại và gửi RSC payload mới.
State của Client Component **được giữ** (nhớ file `13`: soft navigation không thay fiber). Nên nếu
người dùng đang gõ một comment, họ không mất gì.

**Ba chi tiết làm poller này tốt:**
- Dừng khi trạng thái là terminal — không có polling vĩnh viễn
- Không poll khi tab ẩn (`visibilityState`) — tiết kiệm pin trên mobile
- Refresh **ngay** khi quay lại tab — người dùng thấy dữ liệu mới lập tức, không chờ hết interval

⚖️ **Đánh giá:** với 20 giây/lần và đơn hàng sống ~2 ngày, đó là ~8.600 request cho mỗi tab đang mở.
Nếu ít người mở trang đơn hàng lâu, hoàn toàn chấp nhận được. **Nếu vậy, đừng làm SSE.**

### Bước 2 — SSE khi polling không đủ

```tsx
// app/api/orders/[id]/stream/route.ts
import { apiFetch } from '@/lib/api/server-client'
import { getClientId } from '@/lib/auth/session'
import type { Order, OrderStatus } from '@/types/order'

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled', 'failed']
const POLL_MS = 5_000
const MAX_DURATION_MS = 5 * 60 * 1000     // tự đóng sau 5 phút; client sẽ reconnect

// SSE cần kết nối sống lâu → Node runtime, không Edge
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'    // không bao giờ cache

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // ⭐ Mọi kiểm tra CÓ THỂ THẤT BẠI phải nằm TRƯỚC khi mở stream
  const clientId = await getClientId()
  if (!clientId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return Response.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const startedAt = Date.now()

      /** Format một SSE event. Định dạng: "event: X\ndata: Y\n\n" */
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }

      const finish = () => {
        if (closed) return
        closed = true
        controller.close()
      }

      // Comment SSE (dòng bắt đầu bằng ':') để giữ kết nối sống qua proxy
      const keepAlive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keep-alive\n\n'))
      }, 15_000)

      let lastStatus: OrderStatus | null = null

      try {
        while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
          const order = await apiFetch<Order>(`/order/${id}`, { auth: true })

          if (order.order_status !== lastStatus) {
            lastStatus = order.order_status
            send('status', {
              status: order.order_status,
              trackingNumber: order.order_tracking_number ?? null,
            })
          }

          if (TERMINAL.includes(order.order_status)) {
            send('done', { status: order.order_status })
            break
          }

          await new Promise((r) => setTimeout(r, POLL_MS))
        }
      } catch (e) {
        console.error('[order-stream]', e)
        // Đã gửi byte → báo lỗi TRONG stream, không đổi được HTTP status
        send('error', { message: 'Mất kết nối theo dõi đơn hàng' })
      } finally {
        clearInterval(keepAlive)
        finish()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',      // tắt buffering của nginx — nếu không, event bị giữ lại
    },
  })
}
```

**Năm chi tiết bắt buộc mà thiếu là không hoạt động:**

| Chi tiết | Thiếu thì sao |
| --- | --- |
| `Content-Type: text/event-stream` | Browser coi là text thường, `EventSource` không parse |
| `Cache-Control: no-cache, no-transform` | Proxy có thể cache hoặc nén → stream bị giữ |
| `X-Accel-Buffering: no` | **nginx buffer cả stream** → event chỉ đến khi đóng kết nối |
| Keep-alive comment (`: ...`) | Proxy/load balancer đóng kết nối "idle" sau ~30-60s |
| `runtime = 'nodejs'` | Edge runtime có giới hạn thời gian thực thi ngắn |

**Định dạng SSE** — chỉ ba quy tắc:
```
event: status          ← tên event (tuỳ chọn; mặc định là "message")
data: {"status":"shipping"}   ← payload, phải một dòng
                       ← DÒNG TRỐNG kết thúc event (bắt buộc!)
```

Dòng trống là chỗ dễ quên nhất. Không có nó, browser chờ mãi.

### Bước 3 — Client nhận event

```tsx
// components/store/order-status-live.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { OrderStatus } from '@/types/order'

const TERMINAL: OrderStatus[] = ['delivered', 'cancelled', 'failed']

const LABELS: Record<OrderStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
  failed: 'Thất bại',
}

export function OrderStatusLive({
  orderId,
  initialStatus,
}: {
  orderId: string
  initialStatus: OrderStatus
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)

  useEffect(() => {
    if (TERMINAL.includes(initialStatus)) return     // đơn đã xong, không mở kết nối

    const es = new EventSource(`/api/orders/${orderId}/stream`)

    es.addEventListener('status', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { status: OrderStatus }
      setStatus((prev) => {
        if (prev !== data.status) {
          toast.info(`Đơn hàng: ${LABELS[data.status]}`)
          // Lấy lại toàn bộ dữ liệu server (tracking number, thời gian…)
          router.refresh()
        }
        return data.status
      })
    })

    es.addEventListener('done', () => es.close())

    es.addEventListener('error', () => {
      // EventSource TỰ reconnect khi lỗi mạng — đây là lợi ích chính của SSE.
      // Nhưng nếu server chủ động đóng (readyState CLOSED) thì không reconnect.
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[order-stream] server closed the connection')
      }
    })

    return () => es.close()
  }, [orderId, initialStatus, router])

  // Component này chỉ điều phối — hiển thị vẫn do OrderStatusTimeline (Server Component)
  return null
}
```

Gắn vào trang:

```tsx
// app/(store)/orders/[id]/page.tsx
<OrderStatusTimeline status={order.order_status} />
<OrderStatusLive orderId={order._id} initialStatus={order.order_status} />
```

**Chú ý thiết kế:** `OrderStatusLive` **không render UI**. Nó nhận event, toast, rồi gọi `router.refresh()`
để Server Component render lại với dữ liệu mới. Nhờ đó:

- `OrderStatusTimeline` vẫn là **Server Component** (0 byte JS)
- Không có hai nguồn sự thật cho trạng thái
- Mọi dữ liệu liên quan (tracking number, ngày) cũng được cập nhật, không chỉ status

Đây là pattern **"realtime như một trigger, không phải như một store"** — và nó đơn giản hơn nhiều so
với việc tự quản state ở client.

⚠️ **Giới hạn của SSE cần biết:** trên HTTP/1.1, browser giới hạn **6 kết nối đồng thời mỗi domain**.
Nếu người dùng mở 6 tab đơn hàng, tab thứ 7 (và mọi request khác!) bị chặn. Trên HTTP/2 giới hạn cao
hơn nhiều (multiplexing). **Kiểm tra hosting của bạn có HTTP/2 chưa** — nếu chưa, polling an toàn hơn.

---

## 6. Webhook: nhận callback từ cổng thanh toán

📄 Repo có `order_payment.method` với `'COD' | 'CARD' | 'MOMO'`. Với CARD và MOMO, cổng thanh toán
sẽ **POST vào URL của bạn** để báo kết quả. Đây là ca dùng route handler **không thể thay thế** —
MoMo không biết gì về Server Action ID.

```tsx
// app/api/webhooks/momo/route.ts
import crypto from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'

export const runtime = 'nodejs'          // cần node:crypto
export const dynamic = 'force-dynamic'

interface MomoPayload {
  orderId: string
  requestId: string
  resultCode: number
  amount: number
  transId: string
  signature: string
}

/**
 * Xác thực HMAC bằng so sánh THỜI GIAN HẰNG SỐ.
 *
 * So sánh chuỗi thường (===) thoát sớm ở byte đầu khác nhau → kẻ tấn công
 * đo thời gian để đoán dần signature. timingSafeEqual luôn mất cùng thời gian.
 */
function verifySignature(payload: MomoPayload, secret: string): boolean {
  const raw = [
    `amount=${payload.amount}`,
    `orderId=${payload.orderId}`,
    `requestId=${payload.requestId}`,
    `resultCode=${payload.resultCode}`,
    `transId=${payload.transId}`,
  ].join('&')

  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(payload.signature, 'utf8')
  if (a.length !== b.length) return false        // timingSafeEqual throw nếu khác độ dài
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.MOMO_SECRET_KEY
  if (!secret) {
    console.error('[webhook:momo] MOMO_SECRET_KEY not configured')
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }

  let payload: MomoPayload
  try {
    payload = (await request.json()) as MomoPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 1. ⭐ XÁC THỰC TRƯỚC MỌI THỨ KHÁC
  if (!verifySignature(payload, secret)) {
    console.warn('[webhook:momo] invalid signature', { orderId: payload.orderId })
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 2. ⭐ IDEMPOTENCY — cổng thanh toán sẽ GỬI LẠI nếu không nhận được 2xx
  const alreadyProcessed = await hasProcessedTransaction(payload.transId)
  if (alreadyProcessed) {
    return Response.json({ received: true })     // 200, không xử lý lại
  }

  // 3. Xử lý
  try {
    if (payload.resultCode === 0) {
      await confirmOrderPayment(payload.orderId, payload.transId, payload.amount)
    } else {
      await failOrderPayment(payload.orderId, payload.resultCode)
    }
    await markTransactionProcessed(payload.transId)
  } catch (e) {
    console.error('[webhook:momo] processing failed', e)
    // ⭐ Trả 500 để cổng thanh toán THỬ LẠI. Đừng trả 200 khi chưa xử lý xong.
    return Response.json({ error: 'Processing failed' }, { status: 500 })
  }

  // 4. Invalidate cache để người dùng thấy trạng thái mới
  revalidatePath('/orders')
  revalidatePath(`/orders/${payload.orderId}`)
  revalidateTag('orders')

  // 5. Trả 200 NHANH — cổng thanh toán thường timeout sau 5-10 giây
  return Response.json({ received: true })
}
```

**Năm nguyên tắc webhook — mỗi cái tương ứng một sự cố production thật:**

| # | Nguyên tắc | Điều gì xảy ra nếu bỏ |
| --- | --- | --- |
| 1 | **Xác thực signature TRƯỚC** khi đọc bất kỳ field nào | Bất kỳ ai POST được `{resultCode: 0}` → đơn hàng "đã thanh toán" miễn phí |
| 2 | **`timingSafeEqual`**, không `===` | Timing attack đoán được signature |
| 3 | **Idempotency theo transaction ID** | Cổng gửi lại → cộng tiền hai lần |
| 4 | **Trả 500 khi xử lý lỗi** | Cổng nghĩ đã xong → không gửi lại → mất giao dịch |
| 5 | **Trả 200 nhanh, việc chậm để queue** | Timeout → cổng gửi lại → nhân đôi tải |

⚠️ **Về nguyên tắc 5:** nếu việc xử lý mất >3 giây (gửi email, gọi nhiều API), hãy **ghi vào queue rồi
trả 200 ngay**:

```tsx
await enqueueJob({ type: 'process-payment', payload })
return Response.json({ received: true })
```

Trong repo này, `confirmOrderPayment` gọi backend Express — nhanh. Nhưng nếu sau này thêm gửi email
hoá đơn, hãy tách ra.

⚠️ **Và một điều nữa: webhook route KHÔNG nằm trong `proxy.ts` matcher.**

📄 `proxy.ts`:

```tsx
export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
```

`/api/webhooks/momo` không khớp → proxy không chạy. **Đây là điều đúng** (webhook không có cookie
session, sẽ bị `redirectToLogin`). Nhưng nếu bạn thêm `/api/:path*` vào matcher, webhook sẽ vỡ.
Hãy nhớ điều này.

---

## 7. Route Handler và Caching

Route handler `GET` **mặc định là dynamic** trong Next.js hiện đại. Muốn cache, phải khai báo:

```tsx
// Cache tĩnh, revalidate mỗi giờ
export const revalidate = 3600

export async function GET() {
  const result = await apiFetch<ProductListResult>('/product?page=1&limit=12', {
    cache: 'force-cache',
    tags: ['products'],
  })
  return Response.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60' },
  })
}
```

**Hai tầng cache khác nhau — đừng nhầm:**

| Khai báo | Tầng nào | Ai đọc |
| --- | --- | --- |
| `export const revalidate = 3600` | **Next.js Full Route Cache** (file `10`) | Next.js server |
| Header `Cache-Control: s-maxage=3600` | **CDN / browser** | Vercel Edge, Cloudflare, browser |

Bạn thường muốn **cả hai**. Và `stale-while-revalidate=60` nói với CDN: *"trả bản cũ ngay, đồng thời
lấy bản mới ở background"* — người dùng không bao giờ chờ.

⚠️ **Với dữ liệu riêng tư, luôn `private, no-store`:**

```tsx
headers: { 'Cache-Control': 'private, no-store' }
```

Thiếu dòng này trên một endpoint trả dữ liệu người dùng là lỗ bảo mật: CDN cache response của người A
và trả cho người B. **Đây là loại lỗi đã xảy ra ở nhiều công ty lớn.**

---

## 8. Runtime: Node vs Edge cho Route Handler

```tsx
export const runtime = 'nodejs'    // mặc định
export const runtime = 'edge'      // opt-in
```

| | Node runtime | Edge runtime |
| --- | --- | --- |
| Cold start | ~100-500ms | **~5ms** |
| Node API (`crypto`, `fs`, `Buffer`) | ✅ | ❌ (chỉ Web Crypto) |
| Kết nối sống lâu (SSE, streaming dài) | ✅ | ⚠️ Giới hạn thời gian ngắn |
| Vị trí | Một region | **Gần người dùng** |
| Thư viện npm nặng | ✅ | ⚠️ Nhiều cái không chạy |

**Chọn theo bảng này:**

| Route handler | Runtime | Vì sao |
| --- | --- | --- |
| Webhook MoMo | `nodejs` | Cần `node:crypto` cho `timingSafeEqual` |
| SSE order stream | `nodejs` | Kết nối sống lâu |
| CSV export | `nodejs` | Chạy lâu, nhiều request tuần tự |
| `/api/health` | `edge` | Cực nhanh, không cần gì |
| Redirect / geo-routing | `edge` | Cần ở gần người dùng |

📄 Nhớ lại file `12`: `proxy.ts` chạy Edge, nên `lib/auth/tokens.ts` phải dùng `atob` thay
`Buffer.from`. Cùng ràng buộc áp dụng cho route handler chạy `runtime = 'edge'`.

---

## 9. When NOT to Use Route Handlers

| Đừng làm | Vì | Dùng gì |
| --- | --- | --- |
| Tạo `/api/products` để trang của mình fetch | Waterfall client→server; mất type safety; thêm code vô ích | Server Component gọi `apiFetch` trực tiếp |
| Tạo `/api/cart/add` cho form của mình | Server Action làm được, ít code hơn, có progressive enhancement | Server Action |
| Proxy toàn bộ backend qua `/api/*` | Thêm một chặng latency; trùng lặp routing | Gọi backend trực tiếp từ Server Component |
| Đặt logic nghiệp vụ trong route handler | Không test được dễ | `lib/` + route handler mỏng |

📄 **Repo này KHÔNG có `route.ts` nào, và đó là điểm mạnh.** Mọi thứ đi qua Server Component +
Server Action. Chỉ thêm route handler khi có một **client ngoài** (webhook, mobile, streaming) —
đúng ba ca đã nêu ở chương này.

---

## 10. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| URL ổn định cho client ngoài (webhook, mobile) | Là **endpoint công khai** — phải tự làm authn/authz/validate/rate-limit |
| Kiểm soát đầy đủ status code và header | Không có type safety end-to-end như Server Action |
| Streaming response (SSE, chunked, file lớn) | Không đổi được status sau byte đầu tiên |
| Chọn runtime được (`edge` cho tốc độ) | Phải biết ràng buộc runtime; code có thể phải viết hai kiểu |
| Trả file với `Content-Disposition` | Dễ quên `Cache-Control: private` → lỗ bảo mật |

| Realtime: lợi ích | Cái giá |
| --- | --- |
| Người dùng thấy trạng thái ngay, không F5 | Kết nối sống lâu tốn tài nguyên server |
| SSE tự reconnect | Giới hạn 6 kết nối/domain trên HTTP/1.1 |
| `router.refresh()` giữ được state client | Mỗi refresh là một round-trip render server |
| Polling cực đơn giản | Tốn request; trễ tới `interval` |

---

## 11. Best Practices

1. **Server Action cho UI của mình; Route Handler cho mọi thứ khác gọi vào.** Đừng tạo `/api/*` để
   chính app của mình dùng.

2. **Xác thực + validate TRƯỚC khi mở stream.** Sau byte đầu tiên bạn không đổi được status.

3. **Route handler cũng là endpoint công khai** — authn, authz, validate input, giống Server Action
   (file `11`).

4. **`Cache-Control: private, no-store` cho MỌI dữ liệu riêng tư.** Không thương lượng.

5. **Webhook: verify signature bằng `timingSafeEqual`, idempotency theo transaction ID, trả 500 khi
   lỗi để được gửi lại.**

6. **SSE cần đủ 5 chi tiết:** content-type, `no-cache, no-transform`, `X-Accel-Buffering: no`,
   keep-alive comment, và `runtime = 'nodejs'`.

7. **Bắt đầu bằng polling.** Nếu `router.refresh()` mỗi 20 giây đủ tốt, đừng làm SSE.

8. **Realtime là trigger, không phải store.** Nhận event → `router.refresh()` → Server Component
   render lại. Đừng giữ bản sao dữ liệu ở client.

9. **Dừng polling/SSE ở trạng thái terminal** và khi tab ẩn.

10. **Logic nghiệp vụ trong `lib/`, route handler chỉ điều phối** — để test được (file `14`).

---

## Tự kiểm tra

1. Khi nào cần route handler thay vì Server Action? Kể ba ca không thể thay thế.
2. Vì sao mọi kiểm tra có thể thất bại phải nằm **trước** `new ReadableStream`?
3. `X-Accel-Buffering: no` giải quyết vấn đề gì? Thiếu nó thì triệu chứng là gì?
4. Vì sao `OrderStatusLive` `return null` thay vì tự render timeline?
5. Kể 5 nguyên tắc webhook và sự cố production tương ứng nếu bỏ mỗi cái.
6. Vì sao `timingSafeEqual` chứ không `===` khi so signature?
7. Vì sao webhook route **không nên** nằm trong `proxy.ts` matcher?
8. `export const revalidate` và header `Cache-Control` khác nhau ở tầng nào?
9. Giới hạn 6 kết nối của SSE ảnh hưởng thế nào? Khi nào nó không còn là vấn đề?
10. Vì sao repo không có `route.ts` nào lại là điểm mạnh?

➡️ Tiếp theo: `21-typescript-nang-cao-cho-react.md`
