# 10. Data Fetching & Caching

> **Mục tiêu:** hiểu bốn tầng cache của Next.js, biết chính xác `cache: 'no-store'` tắt cái gì
> (và **không** tắt cái gì), và tìm ra hai bug revalidation thật trong repo này.

---

## 1. Overview

### Vấn đề: "cache" trong Next.js không phải một thứ

Đây là chủ đề gây nhầm lẫn nhất của App Router, vì từ "cache" bị dùng cho **bốn cơ chế khác nhau**,
ở bốn tầng khác nhau, với thời gian sống khác nhau.

Nếu bạn không phân biệt được chúng, mọi câu hỏi kiểu "vì sao dữ liệu của tôi không cập nhật?" sẽ trở
thành đoán mò. Nên hãy bắt đầu bằng bảng này:

| # | Tầng cache | Ở đâu | Sống bao lâu | Cache cái gì |
| --- | --- | --- | --- | --- |
| 1 | **Request Memoization** | Server | **Một lần render** | Kết quả `fetch` trùng nhau trong cùng một cây component |
| 2 | **Data Cache** | Server (persistent) | Qua nhiều request, nhiều deploy | Response của `fetch` |
| 3 | **Full Route Cache** | Server (build/ISR) | Tới khi revalidate | HTML + RSC payload của cả route |
| 4 | **Router Cache** | **Browser** (in-memory) | Một session, ngắn hạn | RSC payload cho client-side navigation |

Bốn tầng này **độc lập**. Tắt một cái không tắt các cái kia. Đây là điểm mấu chốt của cả chương.

---

## 2. Mental Model

### 🧠 Bốn tầng như một chuỗi cung ứng

```
      ┌──────────────────── SERVER ────────────────────┐    ┌── BROWSER ──┐
      │                                                 │    │              │
 API ─┼─▶ [2] Data Cache ─▶ [1] Memoization ─▶ Render ─┼───▶│ [4] Router  │
      │    (nhiều request)   (một lần render)     │      │    │    Cache    │
      │                                            ▼      │    │              │
      │                              [3] Full Route Cache │    │              │
      └─────────────────────────────────────────────────┘    └──────────────┘
```

- **[1] Memoization** giống như "trong một cuộc họp, ai hỏi cùng câu thì tôi trả lời một lần".
  Chỉ tồn tại trong phạm vi *một* lần render.
- **[2] Data Cache** giống như tủ lạnh: đồ mua về dùng cho nhiều bữa.
- **[3] Full Route Cache** giống như đồ ăn đã nấu sẵn đóng hộp: khách đến là có ngay.
- **[4] Router Cache** giống như đồ khách tự mang về: lần sau họ không cần đến quán.

### 🧠 Câu hỏi định hướng khi debug

Khi dữ liệu "không cập nhật", hỏi theo thứ tự này:

```
1. Dữ liệu có mới ở database chưa?           → nếu chưa, không phải lỗi cache
2. Server có gọi API mới không?               → tầng [2] Data Cache
3. Route có được render lại không?             → tầng [3] Full Route Cache
4. Browser có xin dữ liệu mới không?           → tầng [4] Router Cache
```

Đi sai thứ tự là lý do người ta rải `revalidatePath` khắp nơi mà vẫn không sửa được.

---

## 3. How It Works — `apiFetch` của repo này

📄 `lib/api/server-client.ts`:

```tsx
import 'server-only'
import { cookies } from 'next/headers'
import { COOKIE } from '@/lib/auth/tokens'
import { ApiError, buildHeaders, unwrap, type SessionHeaders } from '@/lib/api/http'

export interface FetchOptions {
  method?: string
  body?: unknown
  multipart?: FormData
  auth?: boolean
  tags?: string[]
  cache?: RequestCache
  signal?: AbortSignal
}

function baseUrl(): string {
  const url = process.env.BACKEND_URL
  if (!url) throw new Error('BACKEND_URL is not configured')
  return `${url}/api/v1`
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  let session: SessionHeaders | undefined
  if (opts.auth) {
    const store = await cookies()
    session = {
      clientId: store.get(COOKIE.CLIENT)?.value,
      accessToken: store.get(COOKIE.ACCESS)?.value,
    }
  }

  const json = !opts.multipart && opts.body !== undefined
  const headers = buildHeaders({ apiKey: process.env.API_KEY!, json, session })

  const method = opts.method ?? (opts.body !== undefined || opts.multipart ? 'POST' : 'GET')
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: opts.multipart ?? (json ? JSON.stringify(opts.body) : undefined),
    cache: opts.cache ?? 'no-store',        // ← QUYẾT ĐỊNH QUAN TRỌNG NHẤT
    next: opts.tags ? { tags: opts.tags } : undefined,
    signal: opts.signal,
  })
  return unwrap<T>(res)
}
```

Đây là một wrapper được thiết kế tốt. Vài chi tiết đáng học:

**(a) Method được suy ra thông minh:**

```tsx
const method = opts.method ?? (opts.body !== undefined || opts.multipart ? 'POST' : 'GET')
```

Có body → POST. Không có → GET. Nên hầu hết call site không cần khai báo method:

```tsx
await apiFetch<Cart>('/cart', { auth: true })                        // GET
await apiFetch('/cart', { auth: true, body: { productId, quantity } }) // POST
await apiFetch('/cart/quantity', { method: 'PATCH', auth: true, body: {...} })  // ghi đè
```

**(b) `auth: true` là opt-in, không phải mặc định.** So sánh hai call site:

```tsx
// app/(store)/page.tsx — danh mục công khai, KHÔNG gửi token
result = await apiFetch<ProductListResult>(`/product${query}`)

// app/(store)/cart/page.tsx — dữ liệu riêng tư, CÓ gửi token
cart = await apiFetch<Cart>('/cart', { auth: true })
```

Mặc định "không gửi credential" là lựa chọn đúng về bảo mật: bạn phải *chủ ý* gửi token, không phải
*chủ ý* không gửi. Sai sót theo hướng an toàn.

**(c) `unwrap` bóc envelope của backend:**

📄 `lib/api/http.ts`:

```tsx
export async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body && (body as { message?: string }).message) ||
      `Request failed (${res.status})`
    throw new ApiError(res.status, message as string)
  }
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}
```

Backend trả `{ message, statusCode, data }`. `unwrap` bóc lấy `data`, hoặc throw `ApiError` mang theo
**message thật từ backend** — nhờ đó người dùng thấy "Wrong password" thay vì "Request failed (400)".

`.catch(() => null)` xử lý trường hợp response không phải JSON (ví dụ HTML error page từ reverse proxy).
Không có nó, một lỗi 502 sẽ gây `SyntaxError` khó hiểu thay vì `ApiError`.

---

## 4. ⭐ `cache: 'no-store'` — tắt cái gì, và KHÔNG tắt cái gì

Đây là quyết định kiến trúc lớn nhất của repo, và cũng là chỗ dễ hiểu sai nhất.

### `no-store` TẮT: tầng [2] Data Cache

Mỗi lần `apiFetch` chạy → một request thật tới backend. Không có response nào được lưu lại giữa
các request khác nhau.

**Hệ quả phụ quan trọng:** vì mọi fetch là `no-store`, route chứa nó trở thành **dynamic** —
Next.js không thể prerender nó tại build time, và tầng [3] Full Route Cache cũng không áp dụng.

### `no-store` KHÔNG TẮT: tầng [4] Router Cache

Và đây là điểm mà nhiều người bỏ qua.

**Router Cache nằm ở browser.** Khi bạn điều hướng bằng `<Link>` từ `/orders` sang `/orders/abc`
rồi bấm Back, browser **không** xin lại dữ liệu — nó dùng RSC payload đã cache trong bộ nhớ.

Điều đó có nghĩa: `no-store` **không** đủ để bảo đảm người dùng thấy dữ liệu mới sau một mutation.
Bạn vẫn cần `revalidatePath`.

> **Đây là câu trả lời cho câu hỏi "nếu mọi thứ là `no-store`, tại sao vẫn cần `revalidatePath`?"**
>
> `revalidatePath` làm ba việc:
> 1. Xoá Data Cache cho path đó (ở đây không có gì để xoá — đã `no-store`)
> 2. Xoá Full Route Cache cho path đó (ở đây cũng không có)
> 3. **Đánh dấu path đó là "stale" trong Router Cache của client** ← đây mới là việc thực sự có tác dụng

### ⚖️ Đánh giá quyết định `no-store` mặc định

| Lợi ích | Cái giá |
| --- | --- |
| **Luôn đúng dữ liệu.** Không bao giờ có chuyện người dùng A thấy giỏ hàng của người dùng B | Mỗi page view = một round-trip tới backend |
| Không cần suy nghĩ về invalidation cho từng endpoint | Không tận dụng được CDN cho nội dung công khai |
| Đơn giản — một quy tắc cho tất cả | TTFB phụ thuộc hoàn toàn vào tốc độ backend |

**Với dữ liệu có xác thực, đây là lựa chọn đúng.** Cart, orders, seller products — cache những thứ này
là mời gọi lỗ hổng nghiêm trọng (người dùng thấy dữ liệu của người khác).

**Nhưng nó bỏ mất một cơ hội lớn:** danh mục sản phẩm công khai.

📄 `app/(store)/page.tsx`:

```tsx
result = await apiFetch<ProductListResult>(`/product${query}`)   // no-store, không auth
```

📄 `app/(store)/products/[id]/page.tsx`:

```tsx
product = await apiFetch<Product>(`/product/${id}`)              // no-store, không auth
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)  // no-store, không auth
```

**Ba request này không dùng token.** Response giống nhau cho mọi người dùng. Chúng **có thể** được
cache — và với một e-commerce, đây là dữ liệu được đọc nhiều nhất.

### Cách khai thác: thêm tags

`FetchOptions` **đã có** field `tags`, và nó **đã được** truyền vào `fetch`:

```tsx
next: opts.tags ? { tags: opts.tags } : undefined,
```

Nhưng **không một call site nào trong repo dùng nó**. Đây là một capability đã build xong nhưng chưa
được dùng.

**Bước 1 — bật cache cho dữ liệu công khai:**

```tsx
// app/(store)/products/[id]/page.tsx
product = await apiFetch<Product>(`/product/${id}`, {
  cache: 'force-cache',
  tags: ['products', `product:${id}`],
})
```

```tsx
// app/(store)/page.tsx
result = await apiFetch<ProductListResult>(`/product${query}`, {
  cache: 'force-cache',
  tags: ['products'],
})
```

**Bước 2 — invalidate khi seller đổi sản phẩm.** Sửa `actions/product.actions.ts`:

```tsx
import { revalidatePath, revalidateTag } from 'next/cache'

export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not publish the product') }
  }
  revalidatePath('/seller/products')     // dashboard của seller
  revalidateTag('products')              // ← MỚI: danh mục công khai
  revalidateTag(`product:${id}`)         // ← MỚI: trang chi tiết
  return { ok: true, message: 'Product published' }
}
```

**Bước 3 — comment cũng nên có tag riêng**, vì nó đổi thường xuyên hơn thông tin sản phẩm:

```tsx
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`, {
  cache: 'force-cache',
  tags: [`comments:${id}`],
})
```

```tsx
// actions/comment.actions.ts
revalidatePath(`/products/${productId}`)
revalidateTag(`comments:${productId}`)     // ← MỚI
```

**Kết quả:** trang sản phẩm được phục vụ từ cache (nhanh, không tải backend), nhưng cập nhật **ngay**
khi seller sửa hoặc khách comment.

### `revalidatePath` vs `revalidateTag` — chọn cái nào

| | `revalidatePath('/orders')` | `revalidateTag('products')` |
| --- | --- | --- |
| Phạm vi | Một URL cụ thể | Mọi fetch có tag đó, ở **bất kỳ** route nào |
| Bạn cần biết trước | Danh sách URL bị ảnh hưởng | Không — tag tự tìm |
| Phù hợp khi | Dữ liệu chỉ hiện ở một trang | Dữ liệu hiện ở nhiều trang |
| Rủi ro | **Dễ quên một URL** | Tag đặt quá rộng → invalidate quá nhiều |

Ví dụ minh hoạ sự khác biệt: một sản phẩm xuất hiện ở `/`, `/products/:id`, `/seller/products`, và
`/cart`. Với `revalidatePath`, bạn phải nhớ cả bốn. Với `revalidateTag('products')`, một dòng là đủ.

---

## 5. ⚠️ Hai bug revalidation thật trong repo

### Bug 1: Cancel order từ trang chi tiết không cập nhật trang đó

📄 `actions/order.actions.ts`:

```tsx
export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) return { ok: false, message: 'Missing order id' }
  try {
    await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not cancel the order') }
  }
  revalidatePath('/orders')                 // ← chỉ danh sách
  return { ok: true, message: 'Order cancelled' }
}
```

Nhưng `CancelOrderButton` được dùng ở **hai** chỗ:

📄 `components/store/order-card.tsx` (trang `/orders`):

```tsx
{order.order_status === 'pending' ? <CancelOrderButton orderId={order._id} /> : null}
```

📄 `app/(store)/orders/[id]/page.tsx` (trang `/orders/:id`):

```tsx
{order.order_status === 'pending' ? <CancelOrderButton orderId={order._id} /> : null}
```

**Kịch bản bug:**

```
1. Người dùng ở /orders/abc123, đơn hàng đang "pending"
2. Bấm "Cancel order"
3. Backend hủy đơn thành công ✅
4. revalidatePath('/orders') — nhưng người dùng đang ở /orders/abc123, KHÔNG phải /orders
5. Toast "Order cancelled" hiện ra ✅
6. NHƯNG: Badge vẫn hiện "pending". Timeline vẫn hiện "pending".
   Nút "Cancel order" VẪN CÒN.
7. Người dùng bấm lại → backend trả lỗi "Order already cancelled"
   → toast lỗi, người dùng bối rối: "vừa hủy được mà?"
```

**Cách sửa:**

```tsx
export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) return { ok: false, message: 'Missing order id' }
  try {
    await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not cancel the order') }
  }
  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)      // ← SỬA: cả trang chi tiết
  return { ok: true, message: 'Order cancelled' }
}
```

**Bài học tổng quát:** khi một component được dùng ở nhiều route, action của nó phải revalidate
**mọi** route đó. Đây chính là loại lỗi mà `revalidateTag` tránh được:

```tsx
// Cách bền hơn: gắn tag khi fetch
const result = await apiFetch<OrdersResult>('/order', { auth: true, tags: ['orders'] })
const order = await apiFetch<Order>(`/order/${id}`, { auth: true, tags: ['orders', `order:${id}`] })

// Rồi trong action chỉ cần:
revalidateTag('orders')     // hit cả hai trang, không cần biết URL nào
```

### Bug 2: Badge giỏ hàng không cập nhật (đã nói ở file `09`)

📄 `actions/cart.actions.ts`:

```tsx
revalidatePath('/cart')
```

Nhưng `StoreHeader` — nơi hiển thị badge — nằm trong `app/(store)/layout.tsx`, không phải trong
`/cart`. Sau khi "Add to cart" từ trang sản phẩm, badge không đổi.

**Cách sửa:**

```tsx
// (a) Đơn giản nhất — revalidate cả layout
revalidatePath('/', 'layout')

// (b) Chính xác hơn — dùng tag
// trong store-header.tsx và cart/page.tsx:
const cart = await apiFetch<Cart>('/cart', { auth: true, tags: ['cart'] })
// trong action:
revalidateTag('cart')
```

Tham số thứ hai của `revalidatePath` (`'page'` | `'layout'`) quyết định phạm vi:

| Lời gọi | Invalidate |
| --- | --- |
| `revalidatePath('/cart')` | Chỉ `page.tsx` của `/cart` |
| `revalidatePath('/cart', 'layout')` | Layout của `/cart` và **mọi route bên dưới** |
| `revalidatePath('/', 'layout')` | Layout root và **toàn bộ app** |

Cẩn thận với `revalidatePath('/', 'layout')` — nó là quả búa lớn, invalidate mọi thứ.

---

## 6. Request Memoization — tầng thường bị bỏ qua

### Vấn đề: cùng dữ liệu, fetch nhiều lần trong một render

📄 Trên trang `/cart`, hai component đều fetch `/cart`:

```tsx
// app/(store)/layout.tsx → components/store/store-header.tsx
const cart = await apiFetch<Cart>('/cart', { auth: true })
cartCount = cart.cart_count_product ?? 0
```

```tsx
// app/(store)/cart/page.tsx
cart = await apiFetch<Cart>('/cart', { auth: true })
```

Layout và page render trong **cùng một request**, cùng một cây component. Đây chính là tình huống mà
tầng **[1] Request Memoization** được thiết kế cho.

Cơ chế: Next.js mở rộng `fetch` để nhớ các request GET có cùng URL và cùng options trong phạm vi một
lần render cây component. Lần gọi thứ hai nhận lại kết quả của lần đầu.

⚠️ **Nhưng đừng tin — hãy xác minh.** Memoization có nhiều điều kiện (method, options, có cùng render
pass không), và hành vi có thể khác giữa các phiên bản. Cách kiểm tra rẻ nhất:

```tsx
// Tạm thêm vào lib/api/server-client.ts để đo
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  console.log(`[apiFetch] ${opts.method ?? 'GET'} ${path}`)
  // ...
}
```

Chạy `pnpm build && pnpm start`, mở `/cart`, đếm số dòng log cho `/cart` trong terminal server.
Nếu thấy hai dòng → không được dedupe.

### Đảm bảo dedupe rõ ràng bằng `cache()` của React

Với các hàm **không phải `fetch`** — như `getAccessPayload()` — memoization của Next.js không áp dụng.
Bạn phải tự bọc bằng `cache()`:

📄 `lib/auth/session.ts` hiện tại:

```tsx
export async function getAccessPayload(): Promise<JwtPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE.ACCESS)?.value
  return token ? decodeJwt(token) : null
}
```

Hàm này được gọi ở nhiều nơi trong **cùng một request**:

| File | Gọi để làm gì |
| --- | --- |
| `components/store/store-header.tsx` | Lấy email, kiểm tra `isShop`, quyết định fetch cart |
| `app/(seller)/seller/page.tsx` | Hiển thị email |
| `app/(seller)/seller/account/page.tsx` | Kiểm tra `isShop` |
| `app/(seller)/seller/discounts/page.tsx` | Lấy `userId` để build path |

Trên trang `/seller/account`, nó chạy **hai lần** (layout root không gọi, nhưng account page gọi, và
nếu sau này header cũng dùng thì thành hai). Mỗi lần đều decode base64 + `JSON.parse`.

**Với `cache()`:**

```tsx
import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { COOKIE, decodeJwt } from '@/lib/auth/tokens'
import type { JwtPayload, Tokens } from '@/types/api'

/**
 * Được cache trong phạm vi MỘT request: mọi component đọc payload đều chia sẻ
 * cùng một lần decode. `cache()` của React dedupe theo tham số — ở đây không có
 * tham số nên mỗi request chỉ decode một lần.
 */
export const getAccessPayload = cache(async (): Promise<JwtPayload | null> => {
  const store = await cookies()
  const token = store.get(COOKIE.ACCESS)?.value
  return token ? decodeJwt(token) : null
})

export const isShop = cache(async (): Promise<boolean> => {
  const payload = await getAccessPayload()
  return Boolean(payload?.roles?.includes('shop'))
})
```

**Lợi ích thật ở đây không phải hiệu năng** (decode JWT rất nhanh) mà là **tính nhất quán**: mọi
component trong một request thấy **cùng một** payload. Nếu không có `cache()` và proxy vừa refresh
token giữa hai lời gọi, hai component có thể thấy hai payload khác nhau — một bug cực khó tái hiện.

> **`cache()` là công cụ tổng quát hơn:** dùng nó cho *mọi* hàm truy cập dữ liệu không dùng `fetch`
> (đọc cookie, query database qua ORM, gọi thư viện SDK).

---

## 7. Static vs Dynamic Rendering

### Cái gì làm một route trở thành dynamic

| Thứ bạn dùng | Kết quả |
| --- | --- |
| `cookies()` | Route → dynamic |
| `headers()` | Route → dynamic |
| `searchParams` (dùng thật, không chỉ khai báo) | Route → dynamic |
| `fetch(..., { cache: 'no-store' })` | Fetch đó không cache; route → dynamic |
| `export const dynamic = 'force-dynamic'` | Route → dynamic (tường minh) |
| `connection()` | Route → dynamic |

### Repo này: 100% dynamic — và một quan sát thú vị

Mọi trang trong repo đều dynamic, vì:

1. `apiFetch` mặc định `cache: 'no-store'`
2. `apiFetch({ auth: true })` gọi `cookies()`
3. Hầu hết trang gọi `getAccessPayload()` → `cookies()`

**Điểm thú vị:** ngay cả trang danh mục công khai `app/(store)/page.tsx` — không dùng `auth`, không
đọc cookie trực tiếp — **vẫn** là dynamic. Vì sao?

Vì nó nằm trong `app/(store)/layout.tsx`, và layout đó render `<StoreHeader />`, và `StoreHeader`
gọi `getAccessPayload()` → `cookies()`.

```
app/(store)/layout.tsx
 └── StoreHeader ──▶ getAccessPayload() ──▶ cookies()  ← LÀM CẢ NHÁNH THÀNH DYNAMIC
 └── {children}
      └── app/(store)/page.tsx  ← bị "lây" dynamic
```

> **Nguyên tắc:** dynamic **lan lên trên**. Một `cookies()` ở bất kỳ đâu trong cây làm cả route đó
> dynamic. Đây là lý do việc *đặt* dynamic API ở đâu quan trọng, không chỉ việc *có dùng* nó.

**Điều đó có sai không?** Với repo này thì **không** — header phải hiển thị trạng thái đăng nhập và
số lượng giỏ hàng, hai thứ vốn dĩ per-user. Đây là dynamic hợp lý.

Nhưng nếu bạn muốn danh mục được phục vụ từ CDN, đây là chỗ cần tách:

```tsx
// app/(store)/layout.tsx
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      {/* Phần tĩnh của header render ngay; phần per-user stream sau */}
      <StoreHeaderShell>
        <Suspense fallback={<HeaderUserSkeleton />}>
          <StoreHeaderUser />     {/* ← chỉ component NÀY gọi cookies() */}
        </Suspense>
      </StoreHeaderShell>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">© Shop</div>
      </footer>
    </div>
  )
}
```

Đây chính là mô hình **Partial Prerendering**: vỏ tĩnh + đảo động, ranh giới là Suspense boundary.
Cùng một cơ chế đã giải thích ở file `06` với `useSearchParams`.

---

## 8. Sửa waterfall — đo lường cụ thể

Nhắc lại từ file `06`, giờ với con số:

📄 `app/(store)/products/[id]/page.tsx` — hiện tại:

```tsx
product = await apiFetch<Product>(`/product/${id}`)             // 150ms
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`) // 150ms
const currentUserId = await getClientId()                        // ~0ms (đọc cookie)
// Tổng: ~300ms
```

Ba mức cải thiện:

```tsx
// Mức 1: song song → 150ms
const [productRes, commentsRes] = await Promise.allSettled([
  apiFetch<Product>(`/product/${id}`),
  apiFetch<Comment[]>(`/comment?productId=${id}`),
])

// Mức 2: song song + Suspense → sản phẩm hiện ở 150ms, comments stream sau
// (xem code đầy đủ ở file 06, mục 5)

// Mức 3: song song + Suspense + cache tag → sản phẩm hiện ở ~5ms từ cache
product = await apiFetch<Product>(`/product/${id}`, {
  cache: 'force-cache',
  tags: ['products', `product:${id}`],
})
```

| Cấu hình | Thời gian thấy sản phẩm | Tải lên backend |
| --- | --- | --- |
| Hiện tại | ~300ms | 2 request / page view |
| Song song | ~150ms | 2 request / page view |
| Song song + Suspense | ~150ms | 2 request / page view |
| + cache tag | ~5ms (cache hit) | ~0 (chỉ khi invalidate) |

Với một trang sản phẩm được xem hàng nghìn lần giữa hai lần sửa, mức 3 giảm tải backend gần như hoàn toàn.

---

## 9. Ghi chú về Next.js 16: `cacheComponents` và `use cache`

Next.js 16 đang đưa vào một mô hình cache tường minh hơn, thay vì suy ra từ các dynamic API. Ý tưởng
cốt lõi: bạn **đánh dấu rõ** cái gì được cache bằng directive `'use cache'`:

```tsx
async function getPublicCatalog(query: string) {
  'use cache'
  return apiFetch<ProductListResult>(`/product${query}`)
}
```

Thay vì "route này dynamic vì có ai đó gọi `cookies()` ở đâu đó", bạn nói rõ "hàm này được cache".
Đây là hướng đi hợp lý — nó biến cache từ **hệ quả ngầm** thành **quyết định tường minh**.

⚠️ Đây là tính năng đang phát triển và cấu hình có thể đổi giữa các bản. Trước khi áp vào production,
hãy đọc release notes của đúng phiên bản Next.js bạn đang dùng (`16.2.10`), và **đừng bật nó cùng lúc
với các thay đổi khác** — bạn sẽ không biết cái gì gây ra vấn đề gì.

Nguyên tắc chung cho mọi thay đổi về cache: **đo trước, đo sau, đổi một thứ mỗi lần.**

---

## 10. When to Use — bảng quyết định

| Loại dữ liệu | Cấu hình | Lý do |
| --- | --- | --- |
| Riêng tư, per-user (cart, orders, account) | `{ auth: true }` + `no-store` | Cache là lỗ bảo mật |
| Công khai, đổi ít (chi tiết sản phẩm) | `force-cache` + tag | Đọc nhiều, ghi ít |
| Công khai, đổi vừa (danh mục, comment) | `force-cache` + tag hẹp | Vẫn cache được, invalidate chính xác |
| Công khai, đổi theo thời gian (tồn kho) | `next: { revalidate: 60 }` | Không cần chính xác tuyệt đối |
| Ghi (POST/PATCH/DELETE) | Không cache (tự động) | Mutation không bao giờ cache |

## 11. When NOT to Cache

- **Dữ liệu có xác thực, trừ khi tag chứa user ID.** Một cache key thiếu user ID là một lỗ hổng
  nghiêm trọng: người dùng A thấy dữ liệu của B.
- **Dữ liệu phải chính xác tuyệt đối tại thời điểm đọc.** Số dư, tồn kho lúc thanh toán, giá cuối cùng.
- **Dữ liệu chỉ được đọc một lần** (trang cảm ơn sau khi đặt hàng). Cache không có ai hưởng.
- **Khi bạn không biết cái gì invalidate nó.** Cache không có chiến lược invalidation rõ ràng sẽ
  biến thành dữ liệu cũ mãi mãi — tệ hơn không cache.

---

## 12. Trade-offs

| Lợi ích của caching | Cái giá |
| --- | --- |
| Giảm tải backend đáng kể | Rủi ro dữ liệu cũ — và nghiêm trọng nhất là **rò rỉ giữa các user** nếu key sai |
| TTFB nhanh hơn nhiều, phục vụ từ CDN được | Phải thiết kế và bảo trì chiến lược invalidation |
| Chịu tải tốt hơn khi traffic tăng | Debug khó: "dữ liệu này đến từ tầng cache nào?" |
| Chi phí hạ tầng thấp hơn | Bốn tầng cache độc lập → nhiều tổ hợp có thể sai |

| Lợi ích của `no-store` (cách repo chọn) | Cái giá |
| --- | --- |
| Luôn đúng; không thể rò rỉ dữ liệu qua cache | Mỗi page view = round-trip backend |
| Không cần nghĩ về invalidation | Không tận dụng được CDN cho nội dung công khai |
| Đơn giản, một quy tắc | TTFB bị giới hạn bởi tốc độ backend |

**Vì sao `no-store` là điểm khởi đầu đúng:** "chậm nhưng đúng" luôn tốt hơn "nhanh nhưng sai" cho dữ
liệu người dùng. Tối ưu bằng cách **mở cache có chọn lọc** cho dữ liệu công khai — không phải bằng
cách bật cache toàn cục rồi tìm chỗ tắt.

---

## 13. Best Practices

1. **Phân biệt bốn tầng cache trước khi debug.** Đi theo thứ tự: DB → Data Cache → Route Cache → Router Cache.

2. **`no-store` mặc định, `force-cache` + tag có chọn lọc.** Mặc định an toàn, tối ưu có chủ đích.

3. **Sửa hai bug revalidation đã nêu:** thêm `revalidatePath(\`/orders/${orderId}\`)` vào
   `cancelOrderAction`, và xử lý badge giỏ hàng trong layout.

4. **Ưu tiên `revalidateTag` khi dữ liệu hiện ở nhiều trang.** Nó loại bỏ hẳn class bug "quên một URL".

5. **Bọc `cache()` cho mọi hàm đọc dữ liệu không dùng `fetch`.** `getAccessPayload` là ứng viên rõ nhất —
   lợi ích chính là tính nhất quán, không phải tốc độ.

6. **Đặt dynamic API ở nơi hẹp nhất.** `cookies()` trong một component nhỏ + Suspense, thay vì trong
   layout — để phần còn lại prerender được.

7. **Đo, đừng đoán.** Thêm `console.log` vào `apiFetch`, chạy production build, đếm request.
   Đây là cách kiểm tra memoization và cache rẻ nhất.

8. **Không bao giờ cache dữ liệu per-user mà không có user ID trong tag.** Đây là lỗi bảo mật nghiêm
   trọng nhất mà caching có thể gây ra.

---

## Tự kiểm tra

1. Kể bốn tầng cache của Next.js, chỗ chúng nằm, và thời gian sống của mỗi cái.
2. `cache: 'no-store'` tắt tầng nào? **Không** tắt tầng nào?
3. Nếu mọi fetch là `no-store`, tại sao `revalidatePath` vẫn cần thiết?
4. Chỉ ra bug trong `cancelOrderAction` và cách sửa. Cách nào bền hơn?
5. Vì sao `app/(store)/page.tsx` là dynamic dù không đọc cookie?
6. `cache()` của React khác Request Memoization của Next.js ở điểm nào? Khi nào cần cái nào?
7. Lỗi bảo mật nghiêm trọng nhất mà caching có thể gây ra là gì?

➡️ Tiếp theo: `11-server-actions-va-forms.md`
