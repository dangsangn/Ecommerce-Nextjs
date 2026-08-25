# 24. Security nâng cao

> **Mục tiêu:** hiểu các lớp tấn công đặc thù của App Router — CSRF trên Server Actions, IDOR,
> path traversal qua `apiFetch`, CSP với nonce, và taint API. Chương này tìm ra một vấn đề mà 11 chỗ
> trong repo cùng mắc.

---

## 1. Overview

### Mô hình mối đe doạ của repo này

Trước khi nói về giải pháp, phải nói rõ **ai tấn công cái gì**:

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Browser    │────────▶│  Next.js (BFF)   │────────▶│  Backend     │
│  (KHÔNG     │         │  proxy.ts        │         │  Express     │
│   tin cậy)  │         │  Server Actions  │         │  (nguồn      │
│             │         │  Server Comps    │         │   phán quyết)│
└─────────────┘         └──────────────────┘         └──────────────┘
      │                          │                          │
      │  Có thể gửi bất kỳ gì    │  Giữ API_KEY             │  Verify JWT
      │  Có thể sửa cookie?      │  Đọc cookie httpOnly     │  Kiểm tra ownership
      │  Có thể gọi action ID    │  Gọi backend             │
```

**Bốn điểm cần thuộc:**

1. **Next.js ở đây là BFF (Backend For Frontend)**, không phải nguồn phán quyết. Nó giữ `API_KEY`
   và cookie, gọi backend.
2. **Backend Express là nơi verify thật** — signature JWT, quyền sở hữu resource.
3. **Mọi thứ trong `formData`, `params`, `searchParams` là input của kẻ tấn công.**
4. **Server Action ID nằm trong client bundle** → mọi action đều discoverable.

Từ mô hình này, các lớp tấn công đáng quan tâm nhất là: **IDOR** (gọi action với ID của người khác),
**SSRF/path traversal** (thao tác URL mà BFF gọi tới backend), và **rò rỉ secret**.

---

## 2. ⭐ CSRF và Server Actions

### Server Actions có bảo vệ CSRF sẵn — nhưng bạn cần biết giới hạn

**Cơ chế:** React/Next.js kiểm tra header `Origin` của POST request phải khớp với `Host`. Request
cross-site sẽ có `Origin` khác → bị từ chối.

Cộng với `sameSite: 'lax'` trên cookie (📄 `lib/auth/session.ts`):

```tsx
const common = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' }
```

`sameSite: 'lax'` không gửi cookie cho POST cross-site. Nên có **hai** lớp bảo vệ:

| Lớp | Chặn gì |
| --- | --- |
| Origin check của Next.js | Request POST từ domain khác |
| `sameSite: 'lax'` | Cookie không đi kèm POST cross-site |

### ⚠️ Ba giới hạn cần biết

**(1) Nếu bạn dùng reverse proxy, phải cấu hình `allowedOrigins`.**

Khi app chạy sau nginx/Cloudflare, `Host` mà Next.js thấy có thể là `localhost:3000`, còn `Origin` là
`https://shop.example.com` → **mọi Server Action bị từ chối**.

```tsx
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  experimental: {
    serverActions: {
      allowedOrigins: ['shop.example.com', 'www.shop.example.com'],
    },
  },
}
```

⚠️ **Đừng thêm `'*'` hoặc domain không thuộc bạn** — đó là tự tay tắt bảo vệ CSRF.

**(2) Origin check không bảo vệ được nếu có XSS.** Nếu kẻ tấn công chạy được JS trên domain của bạn,
`Origin` sẽ đúng. **CSRF protection không thay thế XSS protection.**

**(3) `sameSite: 'lax'` vẫn gửi cookie cho GET cross-site.** Nên bất kỳ action nào có thể trigger bằng
GET (không có trong repo, nhưng nếu bạn thêm route handler `GET /api/delete-something`) sẽ không được
bảo vệ. **Quy tắc: mọi thứ có side-effect phải là POST/PATCH/DELETE.**

---

## 3. ⚠️ IDOR — lỗ hổng lớn nhất về mặt kiến trúc

**IDOR** (Insecure Direct Object Reference) = kẻ tấn công đổi một ID để truy cập resource của người khác.

📄 `actions/product.actions.ts`:

```tsx
export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not publish the product') }
  }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product published' }
}
```

**Kịch bản tấn công:**

```
1. Kẻ tấn công đăng ký một shop hợp pháp
2. Mở DevTools, đọc action ID của publishProductAction từ client bundle
3. Lấy product ID của shop khác (từ URL công khai /products/xxx)
4. POST với action ID + formData { id: "<product của shop khác>" }
```

**Điều gì ngăn họ?** Chỉ một thứ: **backend phải kiểm tra product đó thuộc shop của người gọi.**

📄 Cùng vấn đề ở 5 action khác:

| Action | ID từ client | Ai kiểm tra ownership? |
| --- | --- | --- |
| `publishProductAction` | `formData.get('id')` | Chỉ backend |
| `unpublishProductAction` | `formData.get('id')` | Chỉ backend |
| `updateProductAction` | `formData.get('id')` | Chỉ backend |
| `addProductImagesAction` | `formData.get('id')` | Chỉ backend |
| `cancelOrderAction` | `formData.get('orderId')` | Chỉ backend |
| `deleteCommentAction` | `formData.get('commentId')` | Chỉ backend |

### Đây là kiến trúc hợp lệ — nhưng phải nói rõ

**Không sai** khi để backend là nguồn phán quyết. Đó là thiết kế đúng. **Nhưng:**

⚠️ **Repo hiện dựa 100% vào backend, không có lớp phòng thủ thứ hai.** Nếu backend có một endpoint quên
kiểm tra ownership, không có gì chặn lại.

📄 Và có một dấu hiệu đáng lo trong `actions/discount.actions.ts`:

```tsx
const body: Record<string, unknown> = {
  // ...
  discount_shop_id: shopId, // required by DTO validation; server overrides it anyway
```

Comment nói backend **ghi đè** `discount_shop_id`. Tốt — backend không tin client. Nhưng nó cũng cho
thấy backend có DTO yêu cầu field mà nó tự ghi đè, tức là API contract chưa nhất quán. Với những API
như vậy, giả định "backend luôn kiểm tra đúng" là giả định rủi ro.

### Defense in depth: kiểm tra ở BFF

```tsx
// lib/auth/require.ts
import 'server-only'
import { getAccessPayload } from '@/lib/auth/session'
import type { JwtPayload } from '@/types/api'

export class AuthError extends Error {
  constructor(message = 'Bạn không có quyền thực hiện hành động này') {
    super(message)
    this.name = 'AuthError'
  }
}

/** Bảo đảm có session với role yêu cầu. Throw AuthError nếu không. */
export async function requireRole(role: string): Promise<JwtPayload> {
  const payload = await getAccessPayload()
  if (!payload) throw new AuthError('Phiên đăng nhập đã hết hạn')
  if (!payload.roles?.includes(role)) throw new AuthError()
  return payload
}

/**
 * Kiểm tra resource thuộc về người gọi TRƯỚC khi mutate.
 *
 * Đây là lớp phòng thủ THỨ HAI — backend vẫn phải kiểm tra.
 * Nó tốn một request GET, nên chỉ dùng cho mutation quan trọng.
 */
export async function requireProductOwnership(productId: string): Promise<void> {
  const payload = await requireRole('shop')
  const { apiFetch } = await import('@/lib/api/server-client')
  const product = await apiFetch<{ product_shop?: string }>(`/product/${productId}`, { auth: true })
  if (product.product_shop && product.product_shop !== payload.userId) {
    throw new AuthError('Sản phẩm này không thuộc shop của bạn')
  }
}
```

```tsx
// actions/product.actions.ts
import { requireRole, AuthError } from '@/lib/auth/require'
import { ProductId } from '@/types/ids'

export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // ⭐ Branded type (file 21) — validate hình dạng ID, không chỉ "có tồn tại"
  const id = ProductId.safeParse(formData.get('id'))
  if (!id) return { ok: false, message: 'Mã sản phẩm không hợp lệ' }

  try {
    await requireRole('shop')          // ⭐ chặn sớm nếu không phải shop
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: e.message }
    return { ok: false, message: errorMessage(e, 'Không đăng được sản phẩm') }
  }
  revalidatePath('/seller/products')
  revalidateTag('products')
  return { ok: true, message: 'Đã đăng sản phẩm' }
}
```

⚖️ **Đánh giá trung thực:** `requireRole` **không phải bảo mật thật** — nó đọc JWT chưa verify signature
(nhớ file `12`). Nó là:

- **Chặn sớm** — giảm request rác tới backend
- **Defense in depth** — nếu backend có bug, cần hai bug cùng lúc mới bị khai thác
- **Thông báo tốt hơn** — "không có quyền" thay vì lỗi 403 chung

**Nó KHÔNG thay thế việc backend kiểm tra.** Đừng bao giờ nghĩ vậy.

`requireProductOwnership` mạnh hơn (kiểm tra thật) nhưng tốn một round-trip. Chỉ dùng cho mutation
quan trọng, hoặc bỏ hẳn nếu bạn tin backend.

---

## 4. ⚠️ Path Traversal / SSRF qua `apiFetch`

Đây là vấn đề mà **11 chỗ trong repo cùng mắc**.

### Vấn đề

```bash
$ grep -rn 'apiFetch[^(]*(`' app components actions
app/(seller)/seller/discounts/page.tsx:14:   apiFetch<Discount[]>(`/discount/shop/${payload?.userId ?? ''}`, ...)
app/(store)/products/[id]/page.tsx:20:       apiFetch<Product>(`/product/${id}`)
app/(store)/products/[id]/page.tsx:41:       apiFetch<Comment[]>(`/comment?productId=${id}`)
app/(seller)/seller/products/[id]/edit/page.tsx:15: apiFetch<Product>(`/product/${id}`, { auth: true })
app/(store)/orders/[id]/page.tsx:21:         apiFetch<Order>(`/order/${id}`, { auth: true })
actions/product.actions.ts:94:               apiFetch(`/product/${id}`, {...})
actions/product.actions.ts:117:              apiFetch(`/product/published/${id}`, {...})
actions/product.actions.ts:139:              apiFetch(`/product/draft/${id}`, {...})
actions/product.actions.ts:169:              apiFetch(`/product/upload/images/${id}`, {...})
actions/order.actions.ts:44:                 apiFetch(`/order/${orderId}/cancel`, {...})
actions/discount.actions.ts:74:              apiFetch(`/discount/code/${encodeURIComponent(code)}`)   ← DUY NHẤT có encode
```

**10 trong 11 chỗ nội suy giá trị từ client trực tiếp vào path.** Chỉ `discount/code` dùng
`encodeURIComponent`.

### Vì sao điều này nguy hiểm

📄 `lib/api/server-client.ts`:

```tsx
function baseUrl(): string {
  const url = process.env.BACKEND_URL
  if (!url) throw new Error('BACKEND_URL is not configured')
  return `${url}/api/v1`
}

const res = await fetch(`${baseUrl()}${path}`, { /* ... */ })
```

`fetch` chuẩn hoá URL bằng `URL` constructor — và **`URL` xử lý `..` như path traversal**:

```js
new URL('http://api.local/api/v1/product/../../admin/users').toString()
// → 'http://api.local/admin/users'    ⚠️ đã ra khỏi /api/v1
```

Nếu `id` chứa `../..`, request đi tới một endpoint hoàn toàn khác — **kèm theo `API_KEY` và
`authorization` header của người dùng**.

### Điều này có khai thác được không?

**Nói thẳng: với Next.js hiện tại, khả năng thấp.** Dynamic segment `[id]` khớp **một** path segment,
nên `/` không vào được trực tiếp. Encoded `%2F` thường bị chuẩn hoá hoặc từ chối.

**Nhưng đó là bảo vệ NGẪU NHIÊN, không phải bảo vệ CÓ CHỦ ĐÍCH.** Ba lý do phải sửa dù vậy:

1. **`formData` không có giới hạn đó.** `formData.get('id')` nhận **bất kỳ** chuỗi nào — kể cả
   `"../../admin/users"`. 6 trong 11 chỗ lấy ID từ `formData`.
2. **Hành vi chuẩn hoá URL có thể đổi** giữa các phiên bản Next.js / runtime.
3. **Ngay cả không traversal, ID rác vẫn tốn một request** tới backend và tạo log rác.

📄 **Ví dụ cụ thể khai thác được ngay hôm nay:**

```tsx
// actions/order.actions.ts
const orderId = String(formData.get('orderId') ?? '')
if (!orderId) return { ok: false, message: 'Missing order id' }
await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
```

Gửi `orderId = "../../admin/shutdown"` → path thành `/order/../../admin/shutdown/cancel` →
chuẩn hoá thành `/admin/shutdown/cancel` → **request PATCH tới một endpoint admin, kèm API_KEY.**

Kiểm tra duy nhất là `if (!orderId)` — chuỗi đó không rỗng, nên nó đi qua.

### Sửa: hai lớp

**Lớp 1 — Branded types ở mọi điểm vào** (file `21`):

```tsx
// actions/order.actions.ts
import { OrderId } from '@/types/ids'

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = OrderId.safeParse(formData.get('orderId'))
  if (!orderId) return { ok: false, message: 'Mã đơn hàng không hợp lệ' }
  // orderId đã được validate khớp /^[a-f\d]{24}$/i — không thể chứa `..` hay `/`
  try {
    await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Không huỷ được đơn hàng') }
  }
  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  return { ok: true, message: 'Đã huỷ đơn hàng' }
}
```

**Lớp 2 — Phòng thủ ở `apiFetch`**, để không phụ thuộc vào việc mọi call site đều đúng:

```tsx
// lib/api/server-client.ts
function baseUrl(): string {
  const url = process.env.BACKEND_URL
  if (!url) throw new Error('BACKEND_URL is not configured')
  return `${url}/api/v1`
}

/**
 * Chặn path traversal và URL tuyệt đối.
 *
 * Đây là lớp phòng thủ CUỐI — call site vẫn nên validate ID bằng branded type.
 * Nhưng lớp này bảo đảm một call site quên validate không tạo được lỗ hổng.
 */
function assertSafePath(path: string): void {
  if (!path.startsWith('/')) {
    throw new Error(`apiFetch: path must start with "/" — got ${JSON.stringify(path)}`)
  }
  // Chặn `..` ở dạng thô và dạng encode
  const decoded = decodeURIComponent(path)
  if (decoded.includes('..') || decoded.includes('\\')) {
    throw new Error(`apiFetch: path traversal blocked — ${JSON.stringify(path)}`)
  }
  // Chặn URL tuyệt đối và protocol-relative (SSRF tới host khác)
  if (/^\/\//.test(path) || /^[a-z][a-z\d+\-.]*:/i.test(decoded)) {
    throw new Error(`apiFetch: absolute URL blocked — ${JSON.stringify(path)}`)
  }
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  assertSafePath(path)                    // ⭐ trước mọi thứ khác

  let session: SessionHeaders | undefined
  if (opts.auth) {
    const store = await cookies()
    session = {
      clientId: store.get(COOKIE.CLIENT)?.value,
      accessToken: store.get(COOKIE.ACCESS)?.value,
    }
  }
  // ...phần còn lại giữ nguyên
}
```

**`assertSafePath` là hàm pure → test được ngay** (đúng pattern `lib/` ở file `14`):

```tsx
// lib/api/__tests__/safe-path.test.ts
import { describe, it, expect } from 'vitest'
import { assertSafePath } from '@/lib/api/server-client'   // cần export

describe('assertSafePath', () => {
  it('cho phép path bình thường', () => {
    expect(() => assertSafePath('/product/507f1f77bcf86cd799439011')).not.toThrow()
    expect(() => assertSafePath('/product?page=1&limit=12')).not.toThrow()
  })
  it('chặn path traversal', () => {
    expect(() => assertSafePath('/order/../../admin/users')).toThrow(/traversal/)
  })
  it('chặn traversal đã encode', () => {
    expect(() => assertSafePath('/order/%2e%2e%2f%2e%2e%2fadmin')).toThrow(/traversal/)
  })
  it('chặn URL tuyệt đối', () => {
    expect(() => assertSafePath('https://evil.example/steal')).toThrow(/absolute/)
  })
  it('chặn protocol-relative', () => {
    expect(() => assertSafePath('//evil.example/steal')).toThrow()
  })
  it('yêu cầu bắt đầu bằng /', () => {
    expect(() => assertSafePath('product/123')).toThrow(/must start/)
  })
})
```

> **Nguyên tắc chung:** khi bạn nội suy giá trị vào một **URL**, một **câu SQL**, một **shell command**,
> hay một **đường dẫn file** — validate hoặc escape. Không có ngoại lệ. Lý do "framework có lẽ chặn"
> không phải là lý do.

---

## 5. XSS trong RSC — hẹp hơn nhưng vẫn có

### React escape mặc định

```tsx
// ✅ An toàn — React escape mọi text
<p className="text-sm">{comment.content}</p>
// content = '<script>alert(1)</script>' → hiện ra như TEXT, không chạy
```

📄 Toàn bộ repo dùng cách này. **Không có `dangerouslySetInnerHTML` nào:**

```bash
$ grep -rn "dangerouslySetInnerHTML" app components
# (không có kết quả)
```

Đây là điểm mạnh.

### Ba vector XSS còn lại

**(1) `href` với `javascript:`**

```tsx
// ❌ Nếu URL đến từ dữ liệu người dùng
<a href={userProvidedUrl}>Xem</a>
// userProvidedUrl = "javascript:fetch('/api/steal?c='+document.cookie)"
```

Repo hiện chỉ dùng `href` với đường dẫn tự tạo (`/products/${id}`) nên an toàn. Nhưng nếu sau này thêm
"link website của shop":

```tsx
// lib/security/safe-url.ts
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Trả về URL an toàn để đưa vào href, hoặc undefined nếu không an toàn. */
export function safeExternalUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const url = new URL(raw)
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}
```

```tsx
const shopUrl = safeExternalUrl(shop.website)
{shopUrl ? (
  <a href={shopUrl} target="_blank" rel="noopener noreferrer">Website của shop</a>
) : null}
```

⚠️ **`rel="noopener noreferrer"` là bắt buộc với `target="_blank"`.** Không có `noopener`, trang đích
truy cập được `window.opener` và có thể điều hướng tab của bạn tới trang lừa đảo (tabnabbing).

**(2) `src` của ảnh với `data:` URI**

📄 Repo render URL ảnh từ backend:

```tsx
<img src={product.product_thumb} alt={product.product_name} />
```

`data:image/svg+xml,<svg onload="...">` có thể chạy script trong một số ngữ cảnh. Chuyển sang
`next/image` (file `13`) giải quyết luôn vấn đề này — `remotePatterns` chỉ cho phép host bạn khai báo.

**(3) Style injection**

```tsx
// ❌ Nếu color đến từ người dùng
<div style={{ background: userColor }} />
// userColor = 'url(javascript:...)' — bị chặn ở browser hiện đại, nhưng đừng thử
```

Repo không làm điều này (mọi style qua Tailwind class). Tốt.

---

## 6. Content Security Policy với nonce

CSP là **lớp phòng thủ cuối cùng** cho XSS: nếu kẻ tấn công inject được `<script>`, CSP ngăn nó chạy.

### Vấn đề với Next.js

Next.js **cần inline script** cho:
- RSC payload (`self.__next_f.push(...)`)
- Streaming: script thay thế Suspense fallback (file `13`)
- Hydration bootstrap

Nên `script-src 'self'` sẽ **phá vỡ app**. Giải pháp là **nonce**: một chuỗi ngẫu nhiên mỗi request,
và chỉ script có nonce đó được chạy.

### Triển khai trong `proxy.ts`

📄 Repo dùng `proxy.ts` (file `12`). Thêm CSP vào đó:

```tsx
// proxy.ts (thêm vào đầu function proxy)
function buildCsp(nonce: string, isDev: boolean): string {
  // 'strict-dynamic' cho phép script được TẠO BỞI script có nonce cũng chạy được
  // → cần cho code splitting của Next.js
  const scriptSrc = isDev
    ? `'self' 'unsafe-eval' 'unsafe-inline'`          // dev cần eval cho HMR
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind + next/font inject style động → cần unsafe-inline cho style
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://res.cloudinary.com`,   // ← host ảnh THẬT của bạn
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,        // chống clickjacking
    `form-action 'self'`,            // form chỉ submit về domain mình
    `base-uri 'self'`,               // chống <base> injection
    `object-src 'none'`,
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const isDev = process.env.NODE_ENV !== 'production'
  const nonce = crypto.randomUUID().replace(/-/g, '')   // Web Crypto — có ở Edge (file 12)
  const csp = buildCsp(nonce, isDev)

  // Truyền nonce xuống app qua request header
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  // ...logic auth hiện tại...

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('content-security-policy', csp)

  // Các header bảo mật khác — rẻ và đáng có
  res.headers.set('x-content-type-options', 'nosniff')
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  res.headers.set('x-frame-options', 'DENY')
  res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')

  return res
}
```

Và đọc nonce trong layout:

```tsx
// app/layout.tsx
import { headers } from 'next/headers'

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
```

⚠️ **Ba cảnh báo quan trọng:**

**(1) `matcher` của proxy phải phủ mọi route bạn muốn CSP.** 📄 Matcher hiện tại:

```tsx
export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
```

Không có `/`, `/products/:path*`, `/login`. Nên **CSP sẽ không áp dụng cho storefront** — chính nơi
nhận traffic công khai nhiều nhất.

Nhưng mở rộng matcher làm proxy chạy trên mọi request (và logic auth hiện tại sẽ redirect người chưa
đăng nhập!). **Cần tách hai việc:**

```tsx
export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production')

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const applySecurityHeaders = (res: NextResponse) => {
    res.headers.set('content-security-policy', csp)
    res.headers.set('x-content-type-options', 'nosniff')
    res.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
    return res
  }

  // Chỉ gate auth cho các route CẦN đăng nhập
  const needsAuth = /^\/(seller|cart|checkout|orders)(\/|$)/.test(req.nextUrl.pathname)
  if (!needsAuth) {
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  // ...logic auth hiện tại, bọc mọi return bằng applySecurityHeaders...
}

export const config = {
  // Mọi route TRỪ static asset
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**(2) `'unsafe-inline'` cho `style-src` là bắt buộc** với Tailwind + `next/font`. Đây là nhượng bộ thật —
CSP không bảo vệ được style injection. Đổi lại, style injection ít nguy hiểm hơn script injection nhiều.

**(3) Triển khai CSP theo hai bước.** Đừng bật thẳng ở production:

```tsx
// Bước 1: chỉ BÁO CÁO, không chặn — thu thập vi phạm trong 1-2 tuần
res.headers.set('content-security-policy-report-only', csp + '; report-uri /api/csp-report')

// Bước 2: sau khi log sạch, chuyển sang enforce
res.headers.set('content-security-policy', csp)
```

```tsx
// app/api/csp-report/route.ts
export const runtime = 'edge'

export async function POST(request: Request) {
  const report = await request.json().catch(() => null)
  console.warn('[csp-violation]', JSON.stringify(report)?.slice(0, 1000))
  return new Response(null, { status: 204 })
}
```

Bật CSP thẳng gần như chắc chắn sẽ phá một thứ gì đó bạn không nghĩ tới.

---

## 7. Taint API — chặn secret rò rỉ ra client

React có API thử nghiệm để **đánh dấu** một object hoặc giá trị là "không được gửi xuống client".
Nếu nó lọt qua ranh giới RSC, bạn nhận **lỗi build/runtime** thay vì rò rỉ im lặng.

```tsx
// lib/auth/session.ts
import 'server-only'
import { cache } from 'react'
import { experimental_taintObjectReference, experimental_taintUniqueValue } from 'react'
import { cookies } from 'next/headers'
import { COOKIE, decodeJwt } from '@/lib/auth/tokens'
import type { JwtPayload, Tokens } from '@/types/api'

export const getAccessPayload = cache(async (): Promise<JwtPayload | null> => {
  const store = await cookies()
  const token = store.get(COOKIE.ACCESS)?.value
  if (!token) return null

  // ⭐ Token thật KHÔNG BAO GIỜ được xuống client
  experimental_taintUniqueValue(
    'Access token không được truyền cho Client Component',
    globalThis,
    token,
  )

  const payload = decodeJwt(token)
  if (payload) {
    // ⭐ Cả object payload cũng không nên xuống client nguyên vẹn
    experimental_taintObjectReference(
      'JwtPayload chứa thông tin session — chỉ truyền các field cụ thể bạn cần',
      payload,
    )
  }
  return payload
})
```

Giờ nếu ai đó viết:

```tsx
// ❌ Lỗi ngay, thay vì rò rỉ
const payload = await getAccessPayload()
return <SomeClientComponent payload={payload} />
```

Bạn nhận lỗi rõ ràng thay vì có `roles`, `exp`, `userId` nằm trong RSC payload mà ai cũng đọc được.

📄 Cách đúng — chỉ truyền field cần thiết:

```tsx
// components/store/store-header.tsx đã làm đúng
const payload = await getAccessPayload()
const isShop = Boolean(payload?.roles?.includes('shop'))
// ...
<span className="hidden text-muted-foreground sm:inline">{payload.email}</span>
```

Nó dùng `payload.email` và `payload.roles` ngay trong Server Component, **không** truyền `payload`
xuống client. Đúng.

⚠️ **`experimental_` nghĩa là API có thể đổi.** Và taint **không** phải bảo vệ tuyệt đối — nó chỉ bắt
được việc truyền **cùng một reference/value**. `{ ...payload }` tạo object mới và taint không theo.
Coi nó là **lưới an toàn cho lỗi vô tình**, không phải cơ chế bảo mật.

---

## 8. Rate Limiting cho Server Actions

📄 `resendOtpAction` là ứng viên rõ nhất cho lạm dụng:

```tsx
export async function resendOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '')
  if (!email) return { ok: false, message: 'Email is required' }
  try {
    await apiFetch('/auth/resend-otp', { body: { email } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not resend the code') }
  }
  return { ok: true, message: 'Verification code sent' }
}
```

**Không có rate limit.** Kẻ tấn công gọi nó 10.000 lần với email của nạn nhân → nạn nhân nhận 10.000
email (email bombing), và bạn tốn phí gửi email.

Cùng vấn đề với `loginAction` (brute force mật khẩu) và `signupAction` (tạo hàng loạt tài khoản).

```tsx
// lib/security/rate-limit.ts
import 'server-only'

interface Bucket { count: number; resetAt: number }

/**
 * Rate limit trong bộ nhớ.
 *
 * ⚠️ GIỚI HẠN QUAN TRỌNG: state nằm trong bộ nhớ của MỘT instance.
 * Trên serverless (nhiều instance, cold start) nó gần như vô dụng.
 * Đây là biện pháp giảm nhẹ cho single-instance / dev.
 *
 * Production cần store dùng chung: Redis, Upstash, hoặc rate limit ở tầng backend/WAF.
 */
const buckets = new Map<string, Bucket>()

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { ok: true }
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { ok: true }
}
```

```tsx
// actions/auth.actions.ts
import { headers } from 'next/headers'
import { rateLimit } from '@/lib/security/rate-limit'

export async function resendOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.string().email() }).safeParse({ email: formData.get('email') })
  if (!parsed.success) return { ok: false, message: 'Email không hợp lệ' }
  const { email } = parsed.data

  // Rate limit theo email VÀ theo IP — chặn cả hai hướng lạm dụng
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  for (const key of [`otp:email:${email}`, `otp:ip:${ip}`]) {
    const check = rateLimit(key, { limit: 3, windowMs: 15 * 60 * 1000 })
    if (!check.ok) {
      return {
        ok: false,
        message: `Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(check.retryAfterSec / 60)} phút.`,
      }
    }
  }

  try {
    await apiFetch('/auth/resend-otp', { body: { email } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Không gửi lại được mã') }
  }
  return { ok: true, message: 'Đã gửi mã xác thực' }
}
```

⚠️ **Hai điểm cần nói rõ:**

**(1) `x-forwarded-for` có thể bị giả mạo** nếu app không nằm sau một proxy đáng tin cậy. Chỉ tin nó
khi bạn biết proxy nào đang set nó.

**(2) Rate limit trong bộ nhớ gần như vô dụng trên serverless.** Với 10 instance, kẻ tấn công được
10× limit. **Nơi đúng để rate limit là backend hoặc WAF/CDN.** Bản ở BFF chỉ là lớp giảm nhẹ đầu tiên.

---

## 9. Log và PII

📄 Nhắc lại từ file `11`:

```tsx
// actions/product.actions.ts
const files = formData.getAll('images').filter((f) => f instanceof File && f.size > 0)
console.log('🚀 ~ files:', files)          // ⚠️
```

Log này in metadata File — **bao gồm tên file người dùng**. Tên file có thể chứa PII:
`cmnd-nguyen-van-a-mat-truoc.jpg`, `hoa-don-0912345678.pdf`.

**Quy tắc log an toàn:**

| Không bao giờ log | Thay bằng |
| --- | --- |
| Token, password, API key | Không log gì |
| Email, phone, địa chỉ | Hash hoặc ID |
| Tên file người dùng upload | Số lượng + tổng size |
| Toàn bộ `formData` / request body | Chỉ các field cần cho debug |
| Toàn bộ response object | Status + một vài field |

```tsx
// Thay thế
console.info('[prepareImages]', { count: files.length, totalBytes: files.reduce((s, f) => s + (f as File).size, 0) })
```

Và cấu hình ESLint để chặn từ gốc:

```js
// eslint.config.mjs
{
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
}
```

`console.log` bị cảnh báo (nó thường là debug bỏ lại), `console.error`/`warn`/`info` được phép (chúng
thường có chủ đích).

---

## 10. Checklist bảo mật cho repo

### 🔴 Sửa ngay

| # | Vấn đề | File | Chương |
| --- | --- | --- | --- |
| 1 | **Path traversal** — 10/11 `apiFetch` nội suy thô | mọi page + action | mục 4 |
| 2 | **Open redirect** — `?redirect=` không validate | `login/page.tsx`, `auth.actions.ts` | `09` |
| 3 | **Không validate file upload** (MIME, size, count) | `product.actions.ts`, `user.actions.ts` | `11` |
| 4 | **`console.log` in tên file người dùng** | `product.actions.ts` | mục 9 |
| 5 | **Không rate limit** `resendOtp`, `login`, `signup` | `auth.actions.ts` | mục 8 |

### 🟠 Nên làm

| # | Vấn đề | Chương |
| --- | --- | --- |
| 6 | Không có CSP (và matcher không phủ storefront) | mục 6 |
| 7 | Không có lớp authz ở BFF (`requireRole`) | mục 3 |
| 8 | `Cache-Control` chưa set cho dữ liệu riêng tư (nếu thêm route handler) | `20` |
| 9 | Thiếu security header (`nosniff`, `referrer-policy`, `x-frame-options`) | mục 6 |
| 10 | Chưa dùng taint API cho JWT payload | mục 7 |

### 🟡 Cần xác nhận với backend

| # | Câu hỏi | Vì sao quan trọng | Chương |
| --- | --- | --- | --- |
| 11 | Backend có kiểm tra **ownership** cho mọi mutation? | Đây là lớp bảo mật DUY NHẤT hiện tại (IDOR) | mục 3 |
| 12 | Refresh token có **rotation** không? Có grace window? | Quyết định mức nghiêm trọng của race condition | `12` |
| 13 | Backend có rate limit ở tầng nào? | Rate limit ở BFF không đủ | mục 8 |
| 14 | JWT dùng thuật toán gì? Secret quản lý ra sao? | Cần biết nếu muốn verify ở Edge | `12` |

**Nhóm 🟡 quan trọng nhất về mặt kiến trúc.** Nếu câu trả lời cho #11 là "không đầy đủ", thì repo có
lỗ hổng IDOR thật — và mọi thứ khác trong danh sách này là thứ yếu.

---

## 11. Trade-offs

| Biện pháp | Lợi ích | Cái giá |
| --- | --- | --- |
| **Branded types cho ID** | Chặn path traversal + IDOR ở tầng kiểu | `.safeParse()` ở mọi điểm vào (file `21`) |
| **`assertSafePath`** | Lớp cuối, không phụ thuộc call site | Một hàm nữa trên hot path (rất nhẹ) |
| **`requireRole` ở BFF** | Defense in depth; chặn sớm | **Không phải bảo mật thật** (JWT chưa verify) — dễ bị hiểu sai |
| **`requireProductOwnership`** | Kiểm tra thật ở BFF | Một round-trip GET cho mỗi mutation |
| **CSP + nonce** | Lớp cuối chống XSS | Cần `unsafe-inline` cho style; dễ phá app; phải triển khai 2 bước |
| **Taint API** | Bắt rò rỉ vô tình | `experimental_`; không theo được `{...spread}` |
| **Rate limit ở BFF** | Chặn lạm dụng đơn giản | Gần vô dụng trên serverless; `x-forwarded-for` giả mạo được |
| **`no-console` lint rule** | Chặn PII trong log từ gốc | Phải allow-list các console có chủ đích |

**Nguyên tắc xuyên suốt:** không có biện pháp nào ở tầng BFF thay thế được việc backend làm đúng.
Chúng làm **giảm bề mặt tấn công** và biến **lỗ hổng im lặng** thành **lỗi ồn ào**.

---

## 12. Best Practices

1. **Validate mọi ID bằng branded type ở điểm vào** — `params`, `formData`, `searchParams`.
   Nó chặn cả path traversal và ID rác trong một bước.

2. **Thêm `assertSafePath` vào `apiFetch`.** Lớp phòng thủ không phụ thuộc vào việc mọi call site đúng.

3. **Đừng bao giờ nội suy giá trị chưa validate vào URL/SQL/shell/path.** "Framework có lẽ chặn"
   không phải lý do.

4. **Cấu hình `allowedOrigins` khi chạy sau reverse proxy** — nếu không, Server Actions vỡ.

5. **`requireRole` ở BFF là defense in depth, KHÔNG phải bảo mật.** Backend verify signature mới là
   nguồn phán quyết. Ghi rõ điều này vào code comment.

6. **CSP triển khai hai bước:** `report-only` 1-2 tuần → thu log → enforce.

7. **Mở rộng proxy matcher để phủ security header cho mọi route**, nhưng tách logic auth ra khỏi logic
   header.

8. **Rate limit ở backend/WAF, không chỉ ở BFF.** Bản BFF là lớp đầu, không phải lớp duy nhất.

9. **Không log PII.** Bật `no-console` lint rule để chặn `console.log` debug bỏ lại.

10. **`rel="noopener noreferrer"` cho mọi `target="_blank"`.**

11. **Xác nhận với backend team 4 câu hỏi ở nhóm 🟡.** Không giả định.

---

## Tự kiểm tra

1. Server Actions được bảo vệ CSRF bằng cơ chế gì? Kể ba giới hạn.
2. Mô tả kịch bản IDOR với `publishProductAction`. Điều gì thực sự ngăn nó?
3. Vì sao `requireRole` **không phải** bảo mật thật? Nó có giá trị gì?
4. Chỉ ra path traversal khai thác được trong `cancelOrderAction`. Vì sao `if (!orderId)` không đủ?
5. Vì sao "Next.js có lẽ chặn `%2F`" không phải lý do để bỏ qua validate?
6. Vì sao CSP của Next.js cần nonce chứ không dùng được `script-src 'self'`?
7. Vì sao `matcher` hiện tại làm CSP không áp dụng cho storefront? Sửa thế nào mà không phá auth?
8. Taint API bắt được gì và **không** bắt được gì?
9. Vì sao rate limit trong bộ nhớ gần vô dụng trên serverless?
10. Bốn câu hỏi bạn phải hỏi backend team là gì? Câu nào quan trọng nhất?

---

## 🎓 Kết thúc Phần D

Bạn đã đi qua 24 chương: từ cơ chế Fiber bên trong React, qua kiến trúc App Router, tới engineering
thực tế (performance, a11y, security).

➡️ Tiếp theo: `25-debugging-va-devtools.md` — bắt đầu Phần E (thực chiến)
