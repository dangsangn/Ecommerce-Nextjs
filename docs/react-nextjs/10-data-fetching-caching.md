# 10. Data Fetching & Caching

> **Mục tiêu:** phân biệt các tầng cache của Next.js 16, biết chính xác `cache: 'no-store'` tắt cái gì
> (và **không** tắt cái gì), hiểu Server Action làm mới UI thế nào, và nắm mô hình mới
> **Cache Components** (`'use cache'`, `cacheLife`, `cacheTag`, `updateTag`).

---

## 1. Overview

### Next.js 16 có HAI mô hình cache — repo đang dùng mô hình cũ

| | **Mô hình "previous"** (repo này) | **Cache Components** (mới, Next 16) |
| --- | --- | --- |
| Bật bằng | Mặc định | `cacheComponents: true` trong `next.config.ts` |
| Cache dữ liệu | `fetch(..., { cache: 'force-cache', next: { tags, revalidate } })`, `unstable_cache` | `'use cache'` + `cacheLife()` + `cacheTag()` |
| Cấu hình route | `export const dynamic / revalidate / fetchCache` | Không dùng nữa — thay bằng `'use cache'` + `cacheLife` |
| Static + dynamic trong một route | Không — cả route static **hoặc** dynamic | **Partial Prerendering**: static shell + đảo dynamic trong `<Suspense>` |
| Vô hiệu hoá | `revalidatePath`, `revalidateTag(tag, profile)`, `updateTag`, `refresh` | Như bên trái |

📄 `next.config.ts` của repo **không** có `cacheComponents` → mọi thứ trong chương này (trừ §9) là mô hình
"previous". Docs chính thức của 16.2 gọi nó là *Caching and Revalidating (Previous Model)*.

Điểm chung của cả hai từ Next 15: **`fetch` không còn được cache mặc định.**

### "Cache" không phải một thứ

| # | Tầng | Ở đâu | Sống bao lâu | Cache cái gì |
| --- | --- | --- | --- | --- |
| 1 | **Request Memoization** | Server | **Một request render** | `fetch` GET trùng URL + options trong cùng cây component |
| 2 | **Data Cache** | Server (persistent) | Qua nhiều request, nhiều deploy | Response của `fetch` có `force-cache` / `revalidate` |
| 3 | **Full Route Cache** (prerender) | Server | Tới khi revalidate | HTML + RSC payload của route **static** |
| 4 | **Client Cache** (trước gọi là *Router Cache*) | **Browser** (in-memory) | Tới khi reload / bị invalidate | RSC payload cho client-side navigation |

Các tầng này **độc lập**. Tắt một cái không tắt các cái kia — đó là điểm mấu chốt của cả chương.

---

## 2. Mental Model

### 🧠 Bốn tầng như một chuỗi cung ứng

```
      ┌──────────────────── SERVER ────────────────────┐    ┌── BROWSER ──┐
 API ─┼─▶ [2] Data Cache ─▶ [1] Memoization ─▶ Render ─┼───▶│ [4] Client  │
      │    (nhiều request)   (một lần render)     │      │    │    Cache     │
      │                              [3] Full Route Cache │    │              │
      └─────────────────────────────────────────────────┘    └──────────────┘
```

- **[1]** "Trong một cuộc họp, ai hỏi cùng câu thì trả lời một lần."
- **[2]** Tủ lạnh: mua một lần, dùng nhiều bữa.
- **[3]** Đồ ăn nấu sẵn đóng hộp: khách đến là có.
- **[4]** Đồ khách tự mang về: lần sau khỏi đến quán.

### 🧠 Thứ tự hỏi khi "dữ liệu không cập nhật"

```
1. DB đã có dữ liệu mới chưa?          → chưa: không phải lỗi cache
2. Server có gọi lại API không?         → [2] Data Cache
3. Route có được render lại không?      → [3] Full Route Cache
4. Browser có xin payload mới không?    → [4] Client Cache
```

Đi sai thứ tự là lý do người ta rải `revalidatePath` khắp nơi mà vẫn không sửa được.

---

## 3. `apiFetch` của repo

📄 `lib/api/server-client.ts` (rút gọn):

```tsx
import 'server-only'
import { cookies, headers as requestHeaders } from 'next/headers'

async function currentClientIp(): Promise<string | undefined> {
  try {
    const h = await requestHeaders()
    return pickClientIp(h.get('x-forwarded-for'), Number(process.env.TRUST_PROXY ?? 0))
  } catch {
    return undefined // ngoài request (build, script)
  }
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  let session: SessionHeaders | undefined
  if (opts.auth) {
    const store = await cookies()
    session = { clientId: store.get(COOKIE.CLIENT)?.value, accessToken: store.get(COOKIE.ACCESS)?.value }
  }

  const json = !opts.multipart && opts.body !== undefined
  const headers = buildHeaders({ apiKey: process.env.API_KEY!, json, session, clientIp: await currentClientIp() })

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

Ba chi tiết đáng học:

- **Method được suy ra:** có body → POST, không → GET. Call site gọn:
  `apiFetch<Cart>('/cart', { auth: true })` (GET) vs `apiFetch('/cart', { auth: true, body: {...} })` (POST).
- **`auth: true` là opt-in.** Danh mục công khai (`app/(store)/page.tsx`) không gửi token; giỏ hàng
  (`app/(store)/cart/page.tsx`) phải *chủ ý* gửi. Sai sót theo hướng an toàn.
- **Luôn gọi `headers()`** để chuyển IP người dùng thật qua header `x-end-user-ip`. Chi tiết này có hai
  hệ quả về cache — xem §4 và §7.

📄 `lib/api/http.ts` — `unwrap` bóc envelope `{ message, statusCode, data }` của backend, hoặc throw
`ApiError` mang **message thật** ("Wrong password" thay vì "Request failed (400)"). `res.json().catch(() => null)`
đỡ trường hợp response là HTML (502 từ reverse proxy) — nếu không sẽ là một `SyntaxError` khó hiểu.

---

## 4. ⭐ `cache: 'no-store'` — tắt cái gì, KHÔNG tắt cái gì

### TẮT: [2] Data Cache (và kéo theo [3])

Mỗi lần `apiFetch` chạy = một request thật tới backend. Route chứa fetch `no-store` không thể prerender
→ **dynamic** → [3] Full Route Cache không áp dụng.

### KHÔNG TẮT: [4] Client Cache

Client Cache nằm ở browser. Từ Next 15, **page** không còn được cache khi điều hướng bằng `<Link>`
(`staleTimes.dynamic` mặc định = 0), nhưng:

- **layout** và `loading` state vẫn được tái sử dụng khi điều hướng client-side;
- **Back/Forward** dùng lại payload đã có, không hỏi server.

```
/orders  ──Link──▶  /orders/abc  ──(hủy đơn bằng cách khác)──▶  Back
                                                              └─ /orders hiện lại bản CŨ trong bộ nhớ
```

### Vì sao repo `no-store` 100% vẫn cần `revalidatePath`?

Vì cách **Server Action** trả UI về. Đọc trực tiếp từ source 16.2.10
(`server/app-render/action-handler.js`, `client/.../server-action-reducer.js`):

| Trong action bạn gọi | Response của action | Client |
| --- | --- | --- |
| Không gọi gì | **Chỉ** giá trị trả về, không có UI mới (`skipPageRendering`) | Giữ nguyên UI cũ → toast "Đã hủy" nhưng badge vẫn "pending" |
| `revalidatePath(...)` / `updateTag(...)` / `cookies().set(...)` | Server **render lại trang hiện tại từ root** và gửi kèm | Áp UI mới + xoá Client Cache |
| `refresh()` | Render lại phần dynamic của trang hiện tại | Áp UI mới, không đụng cache dữ liệu |
| `revalidateTag(tag, 'max')` | **Không** render lại ("server actions don't pull their own writes") | Trang hiện tại vẫn cũ tới lần truy cập sau |

Nghĩa là trong repo này, `revalidatePath` **không** xoá được gì ở [2]/[3] (vì đã `no-store`) — việc
có tác dụng của nó là *bắt action gửi UI mới về và xoá Client Cache*.

⚠️ Với dữ liệu không cache, công cụ đúng ngữ nghĩa trong Next 16 là `refresh()`:

```tsx
'use server'
import { refresh } from 'next/cache'

export async function removeFromCartAction(_prev: ActionState, formData: FormData) {
  await apiFetch('/cart', { method: 'DELETE', auth: true, body: { /* ... */ } })
  refresh()   // "render lại trang tôi đang đứng" — header badge, cart list đều mới
  return { ok: true, message: 'Item removed' }
}
```

### ⚖️ Đánh giá `no-store` mặc định

| Lợi ích | Cái giá |
| --- | --- |
| Luôn đúng; không thể rò dữ liệu user A sang user B qua cache | Mỗi page view = round-trip backend |
| Không phải nghĩ invalidation cho từng endpoint | Không tận dụng CDN cho nội dung công khai |
| Một quy tắc cho tất cả | TTFB phụ thuộc hoàn toàn tốc độ backend |

Với cart, orders, seller products — đúng. Nhưng nó bỏ lỡ **danh mục sản phẩm công khai**: không dùng
token, giống nhau với mọi người, đọc nhiều nhất.

### Cách khai thác: `force-cache` + tags — và một cái bẫy

`FetchOptions` đã có `tags` và đã truyền vào `next.tags`, nhưng **chưa call site nào dùng**.

⚠️ **Bẫy:** cache key của Data Cache gồm URL + method + **headers** + body. `apiFetch` luôn gửi
`x-end-user-ip` → bật `force-cache` thẳng trên `apiFetch` sẽ tạo **một entry cho mỗi IP** — gần như
không có cache hit. Cần một fetcher công khai riêng, không header theo user:

```tsx
// lib/api/public-client.ts
import 'server-only'
import { unwrap } from '@/lib/api/http'

export async function publicFetch<T>(path: string, tags: string[]): Promise<T> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${path}`, {
    headers: { 'x-api-key': process.env.API_KEY! },   // giống nhau cho mọi người
    cache: 'force-cache',
    next: { tags },
  })
  return unwrap<T>(res)
}
```

```tsx
// app/(store)/products/[id]/page.tsx
const raw = await publicFetch<unknown>(`/product/${id}`, ['products', `product:${id}`])
const comments = await publicFetch<Comment[]>(`/comment?productId=${id}`, [`comments:${id}`])
```

Invalidate khi seller đổi sản phẩm — 📄 `actions/product.actions.ts`, `publishProductAction`:

```tsx
import { revalidatePath, revalidateTag } from 'next/cache'

// ... sau khi PATCH /product/published/:id thành công
revalidatePath('/seller/products')        // dashboard seller (đang đứng ở đây)
revalidateTag('products', 'max')          // danh mục công khai: stale-while-revalidate
revalidateTag(`product:${id}`, 'max')
```

Comment là trường hợp **read-your-own-writes**: người vừa comment phải thấy comment của mình ngay →
`updateTag`, không phải `revalidateTag(..., 'max')`:

```tsx
// actions/comment.actions.ts
import { updateTag } from 'next/cache'
updateTag(`comments:${productId}`)        // hết hạn ngay + render lại trang hiện tại
```

### `revalidateTag` (Next 16) — chữ ký mới

```tsx
revalidateTag('products')          // ❌ deprecated (lỗi TypeScript): hết hạn ngay, request sau bị block
revalidateTag('products', 'max')   // ✅ đánh dấu stale; request sau nhận bản cũ, fetch mới ở background
updateTag('products')              // ✅ chỉ trong Server Action: hết hạn ngay, user thấy ngay thay đổi của mình
```

| | `revalidatePath('/orders')` | `revalidateTag('products', 'max')` | `updateTag('comments:1')` |
| --- | --- | --- | --- |
| Phạm vi | Một path (hoặc pattern + `'page'`/`'layout'`) | Mọi dữ liệu mang tag, ở **bất kỳ** route nào | Như tag |
| Gọi ở | Server Action, Route Handler | Server Action, Route Handler (webhook) | **Chỉ** Server Action |
| Ngữ nghĩa | Hết hạn | Stale-while-revalidate | Read-your-own-writes |
| Rủi ro | Quên một URL | Tag quá rộng | — |

Một sản phẩm xuất hiện ở `/`, `/products/:id`, `/seller/products`, `/cart`: `revalidatePath` bắt bạn
nhớ cả bốn; một tag là đủ.

---

## 5. ⚠️ Hai chỗ revalidate "lệch path" trong repo

### `cancelOrderAction` chỉ revalidate danh sách

📄 `actions/order.actions.ts`:

```tsx
export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // ... PATCH /order/:id/cancel
  revalidatePath('/orders')                 // ← chỉ danh sách
  return { ok: true, message: 'Order cancelled' }
}
```

Nhưng `CancelOrderButton` dùng ở **hai** nơi: `components/store/order-card.tsx` (`/orders`) và
`app/(store)/orders/[id]/page.tsx` (`/orders/:id`).

### `cartActions` chỉ revalidate `/cart`

📄 `actions/cart.actions.ts` — `addToCartAction` gọi `revalidatePath('/cart')`, nhưng badge giỏ hàng nằm
trong `StoreHeader` của `app/(store)/layout.tsx`, và người dùng đang đứng ở `/products/:id`.

### Thực tế ở 16.2: chưa thành bug — nhưng đang dựa vào hành vi tạm thời

Như bảng ở §4: **bất kỳ** lời gọi `revalidatePath` nào trong action đều khiến server render lại trang
hiện tại *từ root* — source có ghi `// TODO: only revalidate if the path matches`. Docs chính thức của
`revalidatePath` cũng viết: *"Currently, it also causes all previously visited pages to refresh… This
behavior is temporary."* Nên hôm nay badge và trạng thái đơn **vẫn** cập nhật; khi Next sửa TODO đó,
hai chỗ này sẽ thành bug thật (toast "Order cancelled" nhưng nút Cancel vẫn còn).

Cách sửa không phụ thuộc chi tiết cài đặt:

```tsx
// ❌ ngầm dựa vào "revalidate gì cũng render lại trang hiện tại"
revalidatePath('/orders')

// ✅ nói đúng ý: list + chi tiết
revalidatePath('/orders')
revalidatePath(`/orders/${orderId}`)

// ✅ hoặc, vì dữ liệu no-store: "làm mới trang tôi đang đứng"
refresh()
```

Cho badge trong layout: `revalidatePath('/', 'layout')` (búa lớn — invalidate toàn app) hoặc `refresh()`.

| Lời gọi | Invalidate |
| --- | --- |
| `revalidatePath('/cart')` | Trang `/cart` |
| `revalidatePath('/cart', 'layout')` | Layout `/cart` và mọi route bên dưới |
| `revalidatePath('/products/[id]', 'page')` | Mọi trang khớp pattern (bắt buộc có `type` khi dùng pattern) |
| `revalidatePath('/', 'layout')` | Toàn bộ app |

**Bài học tổng quát:** component dùng ở nhiều route → action của nó phải làm mới **mọi** route đó, hoặc
dùng tag để không cần biết URL.

---

## 6. Request Memoization và `cache()` của React

📄 Trên `/cart`, hai component cùng fetch `/cart` trong **một** request:

```tsx
// components/store/store-header.tsx (trong app/(store)/layout.tsx)
const cart = await apiFetch<Cart>('/cart', { auth: true })

// app/(store)/cart/page.tsx
cart = await apiFetch<Cart>('/cart', { auth: true })
```

Next.js memoize `fetch` **GET** có cùng URL + options trong cùng cây render (layout, page,
`generateMetadata`; **không** áp dụng trong Route Handler). Field `cache` không nằm trong key — `no-store`
vẫn được dedupe trong một request. Ngoại lệ: truyền `signal` (hoặc method khác GET/HEAD) thì **không** dedupe.

⚠️ Xác minh thay vì tin: thêm tạm `console.log(\`[apiFetch] ${method} ${path}\`)` vào `apiFetch`, chạy
`pnpm build && pnpm start`, mở `/cart`, đếm dòng log.

### Hàm không phải `fetch` → tự bọc `cache()`

📄 `lib/auth/session.ts` — `getAccessPayload()` (đọc cookie + decode JWT) được gọi ở `store-header.tsx`,
`app/(seller)/seller/page.tsx`, `seller/account/page.tsx`, `seller/discounts/page.tsx`. Memoization của
Next không áp dụng cho nó.

```tsx
import 'server-only'
import { cache } from 'react'

// Dedupe trong phạm vi MỘT request (key = tham số; ở đây không có tham số)
export const getAccessPayload = cache(async (): Promise<JwtPayload | null> => {
  const store = await cookies()
  const token = store.get(COOKIE.ACCESS)?.value
  return token ? decodeJwt(token) : null
})
```

Lợi ích chính là **tính nhất quán**, không phải tốc độ: mọi component trong một request thấy cùng một
payload, kể cả khi proxy vừa refresh token giữa hai lần gọi.

| | Memoization của Next | `cache()` của React | Data Cache / `'use cache'` |
| --- | --- | --- | --- |
| Áp cho | `fetch` GET | Bất kỳ hàm async nào | `fetch` / hàm được đánh dấu |
| Sống | Một request | Một request | Qua nhiều request |
| An toàn với dữ liệu per-user | Có | Có | Chỉ khi key chứa user |

---

## 7. Static vs Dynamic Rendering (mô hình previous)

| Thứ bạn dùng | Kết quả |
| --- | --- |
| `cookies()`, `headers()`, `draftMode()` | Route → dynamic |
| `searchParams` (đọc giá trị) | Route → dynamic |
| `fetch(..., { cache: 'no-store' })` | Route → dynamic |
| `connection()` (thay cho `unstable_noStore`) | Route → dynamic |
| `export const dynamic = 'force-dynamic'` | Route → dynamic (tường minh) |

```tsx
import { connection } from 'next/server'

export default async function FlashSalePage() {
  await connection()                     // "đoạn dưới phải chạy lúc có request"
  const endsAt = Date.now() + 15 * 60_000
  return <Countdown endsAt={endsAt} />
}
```

### Repo này: 100% dynamic

1. `apiFetch` mặc định `no-store`.
2. `apiFetch` **luôn** gọi `headers()` (lấy client IP) — nên ngay cả fetch công khai cũng làm route dynamic.
3. `app/(store)/layout.tsx` render `StoreHeader` → `getAccessPayload()` → `cookies()`.

```
app/(store)/layout.tsx
 └── StoreHeader ──▶ cookies()            ← cả nhánh (store) dynamic
 └── {children}
      └── app/(store)/page.tsx ──▶ apiFetch ──▶ headers() + no-store   ← tự nó cũng dynamic
```

Với mô hình previous, **một** request-time API ở bất kỳ đâu trong cây → **cả route** dynamic. Muốn trang
danh mục prerender được, phải gỡ **cả ba** nguyên nhân — và kể cả vậy, layout per-user vẫn kéo cả route
về dynamic. Tách "vỏ tĩnh + đảo động" trong cùng một route chỉ làm được với **Cache Components** (§9).

---

## 8. Sửa waterfall

📄 `app/(store)/products/[id]/page.tsx` — hiện tại tuần tự:

```tsx
detail = normalizeProductDetail(await apiFetch<unknown>(`/product/${id}`))   // ~150ms
// ... (early return nếu lỗi)
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)             // ~150ms, chờ cái trên
const currentUserId = await getClientId()
// Tổng ≈ 300ms trước khi gửi byte nào
```

```tsx
// ✅ Song song: hai request không phụ thuộc nhau → khởi động cùng lúc
const [detailRes, commentsRes] = await Promise.allSettled([
  apiFetch<unknown>(`/product/${id}`),
  apiFetch<Comment[]>(`/comment?productId=${id}`),
])
if (detailRes.status === 'rejected') return <ProductError error={detailRes.reason} />
const detail = normalizeProductDetail(detailRes.value)
const comments = commentsRes.status === 'fulfilled' ? commentsRes.value : []   // comments lỗi ≠ trang lỗi
```

| Cấu hình | Thấy sản phẩm | Tải backend |
| --- | --- | --- |
| Hiện tại (tuần tự) | ~300ms | 2 request / view |
| `Promise.allSettled` song song | ~150ms | 2 request / view |
| Song song + comments trong `<Suspense>` (file `06`) | ~150ms, comments stream sau | 2 request / view |
| + `publicFetch` có tag (§4) | ~vài ms khi cache hit | ~0 giữa hai lần invalidate |

---

## 9. Mô hình mới: Cache Components (`cacheComponents: true`)

Thay vì *suy ra* "route này dynamic vì ai đó gọi `cookies()`", bạn **đánh dấu tường minh** cái gì được
cache. Mặc định: **không gì được cache**, mọi thứ chạy lúc request — trừ khi có `'use cache'`.

```ts
// next.config.ts
const nextConfig: NextConfig = { cacheComponents: true }
```

Bật flag này cũng là cách duy nhất để có **Partial Prerendering** ở Next 16 (`experimental.ppr` và
`experimental_ppr` đã bị bỏ; `experimental.dynamicIO`/`useCache` cũng được thay bằng flag này).

### `'use cache'` + `cacheLife` + `cacheTag`

```tsx
// lib/catalog.ts
import { cacheLife, cacheTag } from 'next/cache'

export async function getProduct(id: string) {
  'use cache'
  cacheLife('hours')                  // profile: seconds | minutes | hours | days | weeks | max
  cacheTag('products', `product:${id}`)
  // tham số `id` tự thành một phần cache key; header không theo user
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/product/${id}`, {
    headers: { 'x-api-key': process.env.API_KEY! },
  })
  return unwrap<unknown>(res)
}
```

`'use cache'` dùng được ở hai mức: **data** (hàm như trên) và **UI** (đặt đầu một component/page/layout).
`cacheLife`/`cacheTag` đã stable ở 16 (không còn `unstable_`). `unstable_cache` được thay bằng
`'use cache'`.

### Quy tắc bắt buộc

```tsx
// ❌ Không gọi request-time API bên trong scope cache — lỗi ngay
async function getCart() {
  'use cache'
  const store = await cookies()
  // ...
}

// ✅ Đọc ở ngoài, truyền giá trị vào làm tham số (thành cache key)
async function CartBadge() {
  const userId = (await cookies()).get(COOKIE.CLIENT)?.value
  return <CachedBadge userId={userId} />
}
async function CachedBadge({ userId }: { userId?: string }) {
  'use cache'
  // ...
}
```

⚠️ Vì vậy `apiFetch` hiện tại (gọi `headers()`, `cookies()`) **không** dùng được trong `'use cache'` —
cần fetcher công khai như `publicFetch` ở §4. (Ngoại lệ: `'use cache: private'` cho phép đọc
`cookies()`/`headers()` nhưng chỉ cache trong bộ nhớ browser, không lưu ở server — vẫn **experimental** ở 16.2.)

Dữ liệu không cache + request-time API phải nằm trong `<Suspense>`, nếu không build báo lỗi
"Uncached data was accessed outside of `<Suspense>`". Đổi lại, phần còn lại được prerender thành **static
shell**:

```tsx
// app/(store)/layout.tsx — dưới Cache Components
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header>
        <Logo />                                       {/* static shell */}
        <Suspense fallback={<HeaderUserSkeleton />}>
          <HeaderUser />                               {/* cookies() + cart: stream lúc request */}
        </Suspense>
      </header>
      <main>{children}</main>
    </>
  )
}
```

### Đối chiếu

| Previous | Cache Components |
| --- | --- |
| `fetch(url, { cache: 'force-cache', next: { tags: ['p'] } })` | `'use cache'` + `cacheTag('p')` |
| `next: { revalidate: 3600 }` / `export const revalidate = 3600` | `cacheLife('hours')` |
| `export const dynamic = 'force-dynamic'` | Bỏ đi — không cache là mặc định |
| `unstable_noStore()` | Bỏ đi; cần ép request-time thì `await connection()` + `<Suspense>` |
| `unstable_cache(fn, keys, { tags })` | `'use cache'` (key tự suy từ tham số) |

⚠️ Bật `cacheComponents` là một migration (Suspense boundary, bỏ segment config) — đừng làm cùng lúc với
thay đổi khác. **Đo trước, đo sau, đổi một thứ mỗi lần.**

---

## 10. Bảng quyết định

| Loại dữ liệu | Previous (repo) | Cache Components |
| --- | --- | --- |
| Per-user (cart, orders) | `{ auth: true }` + `no-store`; action dùng `refresh()`/`revalidatePath` | Không `'use cache'`, đặt trong `<Suspense>` |
| Công khai, ít đổi (chi tiết SP) | `force-cache` + tag, `revalidateTag(tag, 'max')` | `'use cache'` + `cacheLife('hours')` + `cacheTag` |
| User vừa sửa, phải thấy ngay | `updateTag` trong Server Action | `updateTag` |
| Đổi theo thời gian (tồn kho hiển thị) | `next: { revalidate: 60 }` | `cacheLife('minutes')` |
| Webhook từ backend báo đổi dữ liệu | Route Handler + `revalidateTag(tag, 'max')` (cần hết hạn ngay: `revalidateTag(tag, { expire: 0 })`) | Như bên trái |

### Khi KHÔNG nên cache

- **Dữ liệu có xác thực mà key không chứa user ID** — user A thấy dữ liệu của B. Lỗi bảo mật nghiêm trọng
  nhất caching có thể gây ra.
- **Dữ liệu phải chính xác tại thời điểm đọc:** tồn kho lúc thanh toán, giá cuối cùng.
- **Dữ liệu chỉ đọc một lần** (trang cảm ơn sau đặt hàng).
- **Khi không biết cái gì invalidate nó** — cache không có chiến lược invalidation = dữ liệu cũ mãi mãi.

"Chậm nhưng đúng" tốt hơn "nhanh nhưng sai" cho dữ liệu người dùng: `no-store` là điểm khởi đầu đúng;
tối ưu bằng cách **mở cache có chọn lọc** cho dữ liệu công khai.

---

## 11. Best Practices

1. **Biết mình đang ở mô hình nào** (`cacheComponents` bật hay không) trước khi đọc docs hay debug.
2. **Debug theo thứ tự:** DB → Data Cache → Route Cache → Client Cache.
3. **Mutation trong Server Action phải báo cho Next:** `updateTag` (dữ liệu có cache) hoặc `refresh()` /
   `revalidatePath` (dữ liệu `no-store`). Không gọi gì = UI không đổi.
4. **`revalidateTag` luôn có tham số thứ hai** (`'max'`); cần read-your-writes thì `updateTag`.
5. **Revalidate đúng mọi route bị ảnh hưởng** — đừng dựa vào việc 16.2 tình cờ render lại trang hiện tại.
6. **Cache key phải sạch:** fetcher công khai không gửi header per-user; dữ liệu per-user phải có user ID trong key.
7. **Bọc `cache()` cho hàm đọc dữ liệu không dùng `fetch`** (`getAccessPayload`).
8. **Đo, đừng đoán:** log trong `apiFetch`, chạy production build, đếm request.

---

## Tự kiểm tra

1. Repo đang ở mô hình cache nào? Dấu hiệu nào trong `next.config.ts` cho biết?
2. `cache: 'no-store'` tắt tầng nào, **không** tắt tầng nào?
3. Server Action không gọi `revalidatePath`/`updateTag`/`refresh` thì response của nó chứa gì?
4. Khác nhau giữa `revalidateTag(tag, 'max')`, `updateTag(tag)` và `refresh()`? Cái nào gọi được trong Route Handler?
5. Vì sao bật `force-cache` thẳng trên `apiFetch` gần như không có cache hit?
6. Vì sao `'use cache'` không thể bọc `apiFetch` hiện tại?
7. `cache()` của React khác Request Memoization của Next và `'use cache'` ở điểm nào?

➡️ Tiếp theo: `11-server-actions-va-forms.md`
