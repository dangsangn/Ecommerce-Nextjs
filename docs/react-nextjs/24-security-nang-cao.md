# 24. Security nâng cao

> **Mục tiêu:** hiểu các lớp tấn công đặc thù của App Router — CSRF trên Server Actions, IDOR,
> path traversal qua `apiFetch`, CSP với nonce, taint API, và lỗ hổng ở chính tầng RSC của framework.
> Chương này tìm ra một vấn đề mà hơn chục chỗ trong repo cùng mắc.

---

## 1. Overview — mô hình mối đe doạ

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Browser    │────────▶│  Next.js (BFF)   │────────▶│  Backend     │
│  (KHÔNG     │         │  proxy.ts        │         │  Express     │
│   tin cậy)  │         │  Server Actions  │         │  (nguồn      │
│             │         │  Server Comps    │         │   phán quyết)│
└─────────────┘         └──────────────────┘         └──────────────┘
      │  Gửi được bất kỳ gì       │  Giữ API_KEY              │  Verify JWT
      │  Gọi thẳng action (POST)  │  Đọc cookie httpOnly      │  Kiểm tra ownership
```

**Năm điểm cần thuộc:**

1. **Next.js ở đây là BFF**, không phải nguồn phán quyết. Nó giữ `API_KEY` và cookie, gọi backend.
2. **Backend Express là nơi verify thật** — signature JWT, quyền sở hữu resource.
3. **Mọi thứ trong `formData`, `params`, `searchParams` là input của kẻ tấn công.**
4. **Mọi Server Action export từ file `'use server'` là một public POST endpoint.** Next 16 tạo action ID
   **mã hoá, không xác định** (đổi giữa các build) và loại action không dùng khỏi client bundle — giảm
   rủi ro, nhưng docs nói rõ: vẫn phải coi mỗi action là gọi được trực tiếp và **tự kiểm tra auth +
   authz bên trong từng action**. Hai lớp framework khác: body action giới hạn **1MB** mặc định
   (`serverActions.bodySizeLimit`), và biến closure của inline action được **mã hoá** — chạy nhiều
   instance thì phải đặt `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` giống nhau cho mọi instance.
5. **Giá trị action trả về cũng đi xuống client** (serialize như props). Chỉ trả thứ UI cần:

```tsx
// ❌ Trả nguyên response backend — lộ mọi field (shop_id nội bộ, giá vốn, cờ admin...)
return { ok: true, product: await apiFetch(`/product/${id}`, { auth: true }) }
// ✅ Chỉ field UI hiển thị
return { ok: true, message: 'Đã cập nhật sản phẩm' }
```

Các lớp tấn công đáng lo nhất: **IDOR**, **path traversal/SSRF** qua URL mà BFF gọi backend,
**rò rỉ secret**, và **lỗ hổng của chính framework** (mục 8).

---

## 2. ⭐ CSRF và Server Actions

**Cơ chế có sẵn:**

| Lớp | Chặn gì |
| --- | --- |
| Server Action **chỉ nhận POST** | Không trigger được bằng `<img src>`, link GET |
| Next so `Origin` với `Host` (hoặc `X-Forwarded-Host`) — lệch thì huỷ request | POST từ domain khác |
| 📄 `sameSite: 'lax'` trên cookie (`lib/auth/session.ts`, `proxy.ts`) | Cookie không đi kèm POST cross-site |

### ⚠️ Ba giới hạn

**(1) Sau reverse proxy đổi host → cấu hình `allowedOrigins`.** Nếu `Origin` là
`https://shop.example.com` mà Host/X-Forwarded-Host Next thấy lại khác, mọi Server Action bị từ chối:

```ts
// next.config.ts — option này vẫn nằm dưới experimental ở Next 16
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['shop.example.com', '*.shop.example.com'],
    },
  },
}
```

⚠️ Đừng thêm domain không thuộc bạn — đó là tự tay tắt bảo vệ CSRF.

**(2) Không bảo vệ được nếu có XSS.** JS chạy trên domain của bạn thì `Origin` đúng.

**(3) Route Handler không có sẵn bảo vệ này.** Nếu bạn thêm `app/api/.../route.ts` với `GET` có
side-effect, `sameSite: 'lax'` **vẫn gửi cookie** cho GET điều hướng top-level cross-site:

```ts
// ❌ app/api/cart/clear/route.ts — <img src="https://shop.example.com/api/cart/clear"> trên site khác
export async function GET() { await clearCart(); return Response.json({ ok: true }) }
// ✅ Side-effect chỉ qua POST/PATCH/DELETE, hoặc dùng Server Action
export async function POST(req: Request) { /* kiểm tra Origin + auth */ }
```

Đừng mutate trong render nữa — Next chặn set cookie/revalidate trong Server Component, nhưng
`if (searchParams.logout) await logout()` trong page vẫn là anti-pattern kiểu GET-có-side-effect.

---

## 3. ⚠️ IDOR — lỗ hổng lớn nhất về mặt kiến trúc

**IDOR** (Insecure Direct Object Reference) = đổi một ID để truy cập resource của người khác.

📄 `actions/product.actions.ts`:

```tsx
export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) { /* ... */ }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product published' }
}
```

**Kịch bản:** kẻ tấn công đăng ký một shop hợp pháp → bắt request của chính action này trong DevTools
Network (header `Next-Action` chứa action ID) → lấy product ID của shop khác từ URL công khai
`/products/xxx` → replay POST với `id` đó. **Điều duy nhất ngăn họ: backend kiểm tra product thuộc shop
của người gọi.**

Cùng mô hình ở `updateProductAction`, các action variations/SKU/draft/upload images (`formData.get('id')`),
`cancelOrderAction` (`orderId`), `deleteCommentAction` (`commentId`).

**Để backend làm nguồn phán quyết là thiết kế đúng.** Nhưng repo đang dựa 100% vào backend — một endpoint
quên kiểm tra ownership là không còn gì chặn. 📄 `actions/discount.actions.ts` có comment
`discount_shop_id: shopId, // required by DTO validation; server overrides it anyway` — backend không tin
client (tốt), nhưng API contract chưa nhất quán, nên giả định "backend luôn đúng" là rủi ro.

### Defense in depth ở BFF

```tsx
// lib/auth/require.ts
import 'server-only'
import { getAccessPayload } from '@/lib/auth/session'

export class AuthError extends Error {}

/** Chặn sớm theo role. ⚠️ Đọc JWT CHƯA verify signature — không phải bảo mật thật. */
export async function requireRole(role: string) {
  const payload = await getAccessPayload()
  if (!payload) throw new AuthError('Phiên đăng nhập đã hết hạn')
  if (!payload.roles?.includes(role)) throw new AuthError('Bạn không có quyền thực hiện hành động này')
  return payload
}

/** Kiểm tra ownership thật (tốn 1 GET) — chỉ cho mutation quan trọng. Backend VẪN phải kiểm tra. */
export async function requireProductOwnership(productId: ProductId) {
  const payload = await requireRole('shop')
  const product = await apiFetch<{ product_shop?: string }>(`/product/${productId}`, { auth: true })
  if (product.product_shop !== payload.userId) throw new AuthError('Sản phẩm này không thuộc shop của bạn')
}
```

```tsx
// actions/product.actions.ts
export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = ProductId.safeParse(formData.get('id'))      // ⭐ branded type (file 21)
  if (!id) return { ok: false, message: 'Mã sản phẩm không hợp lệ' }
  try {
    await requireRole('shop')                               // ⭐ chặn sớm
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: e.message }
    return { ok: false, message: errorMessage(e, 'Không đăng được sản phẩm') }
  }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Đã đăng sản phẩm' }
}
```

⚖️ **Đánh giá trung thực:** `requireRole` chặn sớm, cho thông báo tốt hơn, và buộc kẻ tấn công cần **hai**
bug cùng lúc — nhưng nó **không thay thế** việc backend verify. `requireProductOwnership` kiểm tra thật
nhưng tốn một round-trip.

---

## 4. ⚠️ Path Traversal / SSRF qua `apiFetch`

### Vấn đề

```bash
$ grep -rn 'apiFetch[^(]*(`' app components actions
app/(store)/page.tsx:22                        apiFetch(`/product${query}`)   ← query từ buildCatalogQuery, đã encode
app/(store)/products/[id]/page.tsx:22          apiFetch(`/product/${id}`)
app/(store)/products/[id]/page.tsx:43          apiFetch(`/comment?productId=${id}`)
app/(store)/orders/[id]/page.tsx:21            apiFetch(`/order/${id}`, { auth: true })
app/(seller)/seller/products/[id]/edit/page.tsx:17   apiFetch(`/product/${id}`, { auth: true })
app/(seller)/seller/discounts/page.tsx:14      apiFetch(`/discount/shop/${payload?.userId ?? ''}`)
actions/order.actions.ts:44                    apiFetch(`/order/${orderId}/cancel`, ...)
actions/product.actions.ts:109,153,199,220,242,272   `/product/${id}`, `/product/${id}/variations`, `/sku`,
                                               `/product/published/${id}`, `/draft/${id}`, `/upload/images/${id}`
actions/discount.actions.ts:74                 apiFetch(`/discount/code/${encodeURIComponent(code)}`)  ← DUY NHẤT có encode
```

**Hơn chục chỗ nội suy giá trị từ client thẳng vào path.** 📄 `lib/api/server-client.ts` ghép
`${BACKEND_URL}/api/v1${path}` rồi `fetch` — và URL parser **chuẩn hoá `..`**:

```js
new URL('http://api.local/api/v1/order/../../admin/users/cancel').toString()
// → 'http://api.local/admin/users/cancel'    ⚠️ đã ra khỏi /api/v1
```

Request đi tới endpoint khác **kèm `API_KEY` và token của người dùng**.

### Có khai thác được không?

Với `params`: khó — dynamic segment `[id]` khớp **một** segment, `/` không vào được trực tiếp. Nhưng đó là
bảo vệ **ngẫu nhiên**. Với `formData` thì **không có giới hạn đó**:

```tsx
// 📄 actions/order.actions.ts — kiểm tra duy nhất là "không rỗng"
const orderId = String(formData.get('orderId') ?? '')
if (!orderId) return { ok: false, message: 'Missing order id' }
await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
// orderId = "../../admin/shutdown" → PATCH /admin/shutdown/cancel, kèm API_KEY
```

### Sửa: hai lớp

**Lớp 1 — Branded type ở điểm vào** (file `21`): `OrderId.safeParse` chỉ nhận `/^[a-f\d]{24}$/i` —
không thể chứa `..` hay `/`.

```tsx
const orderId = OrderId.safeParse(formData.get('orderId'))
if (!orderId) return { ok: false, message: 'Mã đơn hàng không hợp lệ' }
```

**Lớp 2 — Phòng thủ trong `apiFetch`**, không phụ thuộc call site:

```tsx
// lib/api/server-client.ts
export function assertSafePath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`apiFetch: path phải là đường dẫn tương đối bắt đầu bằng "/" — ${JSON.stringify(path)}`)
  }
  const decoded = decodeURIComponent(path)            // chặn cả dạng encode %2e%2e%2f
  if (decoded.includes('..') || decoded.includes('\\')) {
    throw new Error(`apiFetch: path traversal blocked — ${JSON.stringify(path)}`)
  }
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  assertSafePath(path)                                  // ⭐ trước mọi thứ khác
  // ...phần còn lại giữ nguyên
}
```

Hàm pure → test được ngay (pattern `lib/` ở file `14`):

```tsx
// lib/api/__tests__/safe-path.test.ts
it('cho phép path bình thường', () => {
  expect(() => assertSafePath('/product?page=1&limit=12')).not.toThrow()
})
it('chặn traversal, kể cả đã encode', () => {
  expect(() => assertSafePath('/order/../../admin')).toThrow(/traversal/)
  expect(() => assertSafePath('/order/%2e%2e%2f%2e%2e%2fadmin')).toThrow(/traversal/)
})
it('chặn URL tuyệt đối và protocol-relative', () => {
  expect(() => assertSafePath('https://evil.example')).toThrow()
  expect(() => assertSafePath('//evil.example')).toThrow()
})
```

> **Nguyên tắc:** nội suy vào **URL, SQL, shell, đường dẫn file** → validate hoặc escape. "Framework có
> lẽ chặn" không phải lý do.

---

## 5. XSS trong RSC — hẹp hơn nhưng vẫn có

React escape mọi text: `<p>{comment.content}</p>` với `'<script>…'` hiện ra như text. 📄 Repo **không có
`dangerouslySetInnerHTML` nào** — điểm mạnh. Ba vector còn lại:

**(1) `href` với `javascript:`** — nếu sau này thêm "website của shop":

```tsx
// lib/security/safe-url.ts
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
export function safeExternalUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const url = new URL(raw)
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : undefined
  } catch { return undefined }
}

// Dùng
const shopUrl = safeExternalUrl(shop.website)
{shopUrl && <a href={shopUrl} target="_blank" rel="noopener noreferrer">Website của shop</a>}
```

React 19 đã **chặn** URL `javascript:` trong `href`/`src` (thay bằng một URL ném lỗi), nhưng đừng dựa vào
đó: validate vẫn cần cho `data:`, URL tới domain lừa đảo, và các nơi ngoài React (email, redirect).

**(2) `src` ảnh từ dữ liệu người dùng** — `data:image/svg+xml` có thể mang script trong một số ngữ cảnh.
Chuyển sang `next/image` với `remotePatterns` chỉ cho phép host bạn khai báo. Next 16 còn chặn tối ưu ảnh
từ IP nội bộ mặc định (`dangerouslyAllowLocalIP: false`) — giảm SSRF qua image optimizer.

**(3) Style injection** — `style={{ background: userColor }}` với `url(...)`. Repo dùng class Tailwind, tốt.

---

## 6. Content Security Policy với nonce

CSP là **lớp phòng thủ cuối** cho XSS: script inject vào không chạy được. Next cần inline script (RSC
payload `self.__next_f.push`, script thay Suspense fallback khi stream, bootstrap hydration) nên
`script-src 'self'` sẽ phá app. Giải pháp: **nonce** ngẫu nhiên mỗi request.

### Cách Next 16 xử lý nonce

1. `proxy.ts` sinh nonce, đặt CSP vào **request header** (để app đọc) và **response header** (để browser
   enforce).
2. Khi render, Next **tự parse** header `Content-Security-Policy` của request, lấy `'nonce-…'`.
3. Next **tự gắn nonce** vào script framework, bundle của page, inline script/style do Next sinh ra.
   **Không cần tự truyền nonce cho từng thẻ** — chỉ cần đọc `x-nonce` khi dùng `<Script>` bên thứ ba.

### Triển khai trong `proxy.ts`

📄 Repo dùng `proxy.ts` (file `12`). ⚠️ Ở Next 16, **proxy chạy Node.js runtime** (không còn Edge mặc định;
không cấu hình `runtime` được trong file proxy) — `Buffer` dùng được.

```ts
// proxy.ts
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  return [
    `default-src 'self'`,
    // strict-dynamic: script được tạo BỞI script có nonce cũng chạy → cần cho code splitting
    // dev cần 'unsafe-eval': React dùng eval để dựng lại stack lỗi server trong browser
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,   // dev: HMR chèn <style> không nonce
    `img-src 'self' blob: data: https://res.cloudinary.com`,   // ← host ảnh THẬT của bạn
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,            // chống <base> injection
    `form-action 'self'`,         // form chỉ submit về domain mình
    `frame-ancestors 'none'`,     // chống clickjacking
    `upgrade-insecure-requests`,
  ].join('; ')
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const withSecurityHeaders = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp)
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    return res
  }

  // 📄 Matcher hiện tại chỉ phủ /seller, /cart, /checkout, /orders → CSP sẽ KHÔNG áp dụng cho
  // storefront. Mở rộng matcher, nhưng chỉ chạy logic auth cho route cần đăng nhập:
  const needsAuth = /^\/(seller|cart|checkout|orders)(\/|$)/.test(req.nextUrl.pathname)
  if (!needsAuth) {
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
  }
  // ...logic auth hiện tại; NextResponse.next({ request: { headers: requestHeaders } })
  //    và bọc MỌI return (kể cả redirectToLogin) bằng withSecurityHeaders
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [   // bỏ qua request prefetch của next/link
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
```

Script bên thứ ba thì đọc nonce:

```tsx
// app/layout.tsx
import { headers } from 'next/headers'
import Script from 'next/script'

const nonce = (await headers()).get('x-nonce') ?? undefined
<Script src="https://www.googletagmanager.com/gtag/js" strategy="afterInteractive" nonce={nonce} />
```

### ⚠️ Ba cảnh báo

**(1) Nonce bắt buộc dynamic rendering.** Trang static được build sẵn, không có request để lấy nonce.
Repo đã dynamic hết (file `22`) nên không tốn thêm; app khác sẽ mất static/CDN cache. Nonce-CSP cũng
**không tương thích Partial Prerendering**. Muốn giữ static: thử CSP dựa trên hash với
`experimental.sri` (Subresource Integrity), hoặc chấp nhận `'unsafe-inline'`.

**(2) `style-src` với nonce có thể vỡ.** Thuộc tính `style={{…}}` và thư viện tự chèn `<style>` lúc runtime
(như `sonner`) không mang nonce. Nếu report thấy vi phạm style, nhượng bộ `style-src 'self' 'unsafe-inline'`
— style injection ít nguy hiểm hơn script injection nhiều.

**(3) Triển khai hai bước.** Bật thẳng gần như chắc chắn phá thứ bạn không nghĩ tới:

```ts
// Bước 1 (1–2 tuần): chỉ BÁO CÁO
res.headers.set('Content-Security-Policy-Report-Only', `${csp}; report-uri /api/csp-report`)
// Bước 2: log sạch → enforce
res.headers.set('Content-Security-Policy', csp)
```

```ts
// app/api/csp-report/route.ts
export async function POST(request: Request) {
  const report = await request.json().catch(() => null)
  console.warn('[csp-violation]', JSON.stringify(report)?.slice(0, 1000))
  return new Response(null, { status: 204 })
}
```

---

## 7. Taint API — chặn secret rò rỉ ra client

React có API thử nghiệm đánh dấu giá trị/object "không được gửi xuống client". Lọt qua ranh giới RSC →
**lỗi** thay vì rò rỉ im lặng. **Phải bật trong config**, nếu không import sẽ không hoạt động:

```ts
// next.config.ts
const nextConfig: NextConfig = { experimental: { taint: true } }
```

⚠️ Trạng thái ở Next 16.2 / React 19.2: vẫn là **experimental**, và docs ghi rõ bật cờ này **chuyển cả thư
mục `app` sang kênh React `experimental`** (không còn React stable/canary mặc định). Cân nhắc kỹ trước
khi bật trên production — với nhiều team, một Data Access Layer chỉ trả DTO (mục 1, điểm 5) là đủ.

```tsx
// lib/auth/session.ts
import 'server-only'
import { cache, experimental_taintObjectReference, experimental_taintUniqueValue } from 'react'

export const getAccessPayload = cache(async (): Promise<JwtPayload | null> => {
  const store = await cookies()
  const token = store.get(COOKIE.ACCESS)?.value
  if (!token) return null

  // ⭐ Token thô không bao giờ được xuống client.
  // Tham số 2 là "lifetime": giữ taint tới khi object này bị GC. Dùng object theo request (store),
  // KHÔNG dùng globalThis — taint token từng user mãi mãi = rò bộ nhớ.
  experimental_taintUniqueValue('Access token không được truyền cho Client Component', store, token)

  const payload = decodeJwt(token)
  if (payload) {
    experimental_taintObjectReference('Chỉ truyền field cụ thể của JwtPayload xuống client', payload)
  }
  return payload
})
```

```tsx
// ❌ Lỗi ngay khi render
const payload = await getAccessPayload()
return <AccountMenu payload={payload} />

// ✅ 📄 store-header.tsx đã làm đúng: dùng payload.email / payload.roles NGAY trong Server Component
<span className="max-w-40 truncate">{payload.email}</span>
// hoặc chỉ truyền field cần: <AccountMenu email={payload.email} />
```

⚠️ **Giới hạn:** `taintObjectReference` chỉ bắt **cùng reference** — `{ ...payload }` là object mới, taint
không theo. `taintUniqueValue` theo chính giá trị chuỗi nên chắc hơn, nhưng `token.slice(0)` hay biến đổi
khác thì không. Đây là **lưới an toàn cho lỗi vô tình**, không phải cơ chế bảo mật; vẫn phải lọc dữ liệu
trong Data Access Layer.

---

## 8. ⭐ Lỗ hổng ở chính framework — React2Shell và bài học "giữ bản vá"

Tháng 12/2025, **CVE-2025-55182 ("React2Shell", CVSS 10.0)**: lỗi deserialize trong giao thức RSC
("Flight") của `react-server-dom-*` cho phép **thực thi mã từ xa không cần đăng nhập** bằng một request
được dựng sẵn tới server. Ảnh hưởng React 19.0 → 19.2.0 và mọi framework dùng RSC (Next 15.x, 16.0.x).
Bản vá đầu tiên: React 19.0.1 / 19.1.2 / 19.2.1, Next 16.0.7 (và các nhánh 15.x tương ứng). Ngay sau đó
có thêm advisory trên cùng bề mặt: **CVE-2025-55184** (DoS — request làm server treo) và **CVE-2025-55183**
(lộ mã nguồn Server Function), rồi **CVE-2025-67779** (bản vá DoS chưa đủ) — vá ở React 19.2.3 và các
bản Next 16.0.x tiếp theo.

**Bài học cho repo:**

1. **App không cần "dùng Server Action" mới bị ảnh hưởng** — chỉ cần App Router (có endpoint RSC) là đủ.
   Mọi kiểm tra auth trong action/page của bạn đều vô nghĩa với lỗi ở tầng deserialize.
2. **Next tự vendor `react-server-dom-*`** (trong `next/dist/compiled`). Bản vá thực sự đến từ việc
   **nâng `next`**, không chỉ `react`/`react-dom` trong `package.json`.
3. **Pin version chính xác + theo dõi advisory.** Repo pin `next: "16.2.10"`, `react: "19.2.4"` — đều
   **mới hơn** mọi bản vá đợt 12/2025 (16.2 > 16.0.x, 19.2.4 > 19.2.3), nên không bị ảnh hưởng. Nhưng pin
   cũng nghĩa là **không tự nhận bản vá** cho advisory sau này:

```bash
pnpm audit --prod                  # có advisory nào cho next/react không?
pnpm outdated next react react-dom # có patch mới không?
pnpm up next@16.2.x react@19.2.x react-dom@19.2.x   # nâng trong cùng minor khi có bản vá
```

Bật Dependabot/Renovate cho security update, và đọc GitHub Security Advisories của `vercel/next.js` và
`facebook/react` — một CVE ở tầng framework vô hiệu hoá mọi lớp phòng thủ trong chương này.

---

## 9. Rate Limiting cho Server Actions

📄 `resendOtpAction` (`actions/auth.actions.ts`) chỉ kiểm tra `if (!email)` — **không rate limit**. Gọi 10.000
lần với email nạn nhân → email bombing + bạn trả phí gửi mail. Tương tự `loginAction` (brute force),
`signupAction` (tạo tài khoản hàng loạt).

```tsx
// lib/security/rate-limit.ts
import 'server-only'

/**
 * ⚠️ State trong bộ nhớ của MỘT instance — trên serverless/nhiều instance gần như vô dụng.
 * Production: Redis/Upstash, hoặc rate limit ở backend/WAF.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, { limit, windowMs }: { limit: number; windowMs: number }) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true as const }
  }
  if (b.count >= limit) return { ok: false as const, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  b.count += 1
  return { ok: true as const }
}
```

```tsx
// actions/auth.actions.ts
export async function resendOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().safeParse(formData.get('email'))      // Zod 4
  if (!parsed.success) return { ok: false, message: 'Email không hợp lệ' }
  const email = parsed.data

  // Theo email VÀ theo IP — chặn cả hai hướng lạm dụng
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  for (const key of [`otp:email:${email}`, `otp:ip:${ip}`]) {
    const check = rateLimit(key, { limit: 3, windowMs: 15 * 60 * 1000 })
    if (!check.ok) return { ok: false, message: `Thử lại sau ${Math.ceil(check.retryAfterSec / 60)} phút.` }
  }
  // ...gọi /auth/resend-otp như cũ
}
```

⚠️ `x-forwarded-for` **giả mạo được** nếu app không nằm sau proxy tin cậy set lại nó. Nơi đúng để rate
limit là **backend hoặc WAF/CDN**; bản ở BFF chỉ là lớp giảm nhẹ đầu tiên.

---

## 10. Log và PII

| Không bao giờ log | Thay bằng |
| --- | --- |
| Token, password, API key | Không log gì |
| Email, phone, địa chỉ | Hash hoặc ID |
| Tên file người dùng upload (`cmnd-nguyen-van-a.jpg`) | Số lượng + tổng size |
| Toàn bộ `formData` / request body / response | Chỉ field cần cho debug |

```tsx
// ❌ (từng có trong product.actions.ts — file 11) in metadata File, gồm tên file người dùng
console.log('🚀 ~ files:', files)
// ✅
console.info('[prepareImages]', { count: files.length, totalBytes: files.reduce((s, f) => s + f.size, 0) })
```

Chặn từ gốc bằng lint:

```js
// eslint.config.mjs
{ rules: { 'no-console': ['warn', { allow: ['warn', 'error', 'info'] }] } }
```

---

## 11. Checklist bảo mật cho repo

### 🔴 Sửa ngay

| # | Vấn đề | File | Mục |
| --- | --- | --- | --- |
| 1 | **Giữ framework được vá** — audit + theo dõi advisory Next/React | `package.json` | 8 |
| 2 | **Path traversal** — hơn chục `apiFetch` nội suy thô | page + action | 4 |
| 3 | **Open redirect** — `?redirect=` không validate | `login/page.tsx`, `auth.actions.ts` | file `09` |
| 4 | **Không validate file upload** (MIME, size, count) | `product.actions.ts`, `user.actions.ts` | file `11` |
| 5 | **Không rate limit** `resendOtp`, `login`, `signup` | `auth.actions.ts` | 9 |

### 🟠 Nên làm

| # | Vấn đề | Mục |
| --- | --- | --- |
| 6 | Không có CSP; matcher proxy không phủ storefront | 6 |
| 7 | Không có lớp authz ở BFF (`requireRole`) | 3 |
| 8 | Thiếu security header (`nosniff`, `referrer-policy`) | 6 |
| 9 | Chưa bật `experimental.taint` cho token/JWT payload | 7 |
| 10 | Chưa có lint rule `no-console` | 10 |

### 🟡 Cần xác nhận với backend

| # | Câu hỏi | Vì sao |
| --- | --- | --- |
| 11 | Backend kiểm tra **ownership** cho mọi mutation? | Lớp chống IDOR DUY NHẤT hiện tại |
| 12 | Refresh token có **rotation**? Grace window? | Quyết định mức nghiêm trọng của race (file `12`) |
| 13 | Backend rate limit ở tầng nào? | Rate limit ở BFF không đủ |
| 14 | JWT dùng thuật toán gì, secret quản lý ra sao? | Cần nếu muốn verify ở proxy (file `12`) |

**#11 quan trọng nhất về kiến trúc** — nếu câu trả lời là "không đầy đủ", repo có IDOR thật.

---

## 12. Best Practices

1. **Coi mọi Server Action là public POST endpoint** — auth + authz bên trong từng action.
2. **Validate mọi ID bằng branded type ở điểm vào** (`params`, `formData`, `searchParams`) và thêm
   `assertSafePath` vào `apiFetch`.
3. **Không nội suy giá trị chưa validate vào URL/SQL/shell/path.**
4. **`allowedOrigins` khi chạy sau reverse proxy**; side-effect không bao giờ qua GET.
5. **`requireRole` ở BFF là defense in depth, KHÔNG phải bảo mật** — ghi rõ trong comment.
6. **CSP nonce trong `proxy.ts`**, để Next tự gắn nonce; triển khai `report-only` trước; mở matcher phủ
   mọi route nhưng tách logic auth.
7. **Bật `experimental.taint`** cho secret, lifetime theo request — chỉ là lưới an toàn.
8. **Nâng `next` khi có advisory** — lỗi tầng RSC vô hiệu hoá mọi lớp khác.
9. **Rate limit ở backend/WAF**; **không log PII**; `rel="noopener noreferrer"` cho `target="_blank"`.

---

## Tự kiểm tra

1. Server Actions được bảo vệ CSRF bằng những lớp nào? Kể ba giới hạn.
2. Action ID mã hoá + dead code elimination có nghĩa là action an toàn không? Vì sao giá trị trả về của action cũng là bề mặt rò rỉ?
3. Mô tả kịch bản IDOR với `publishProductAction`. Điều gì thực sự ngăn nó?
4. Chỉ ra path traversal khai thác được trong `cancelOrderAction`. Vì sao `if (!orderId)` không đủ?
5. Next 16 lấy nonce từ đâu và gắn vào những gì? Khi nào bạn vẫn phải tự đọc `x-nonce`?
6. Vì sao nonce-CSP buộc dynamic rendering? Lựa chọn nào giữ được static?
7. Vì sao matcher hiện tại làm CSP không áp dụng cho storefront? Sửa thế nào mà không phá auth?
8. Taint API cần bật gì, và cái giá của việc bật là gì? Vì sao không dùng `globalThis` làm lifetime cho token?
9. React2Shell khác các lỗ hổng còn lại trong chương ở điểm nào? Vì sao nâng `next` quan trọng hơn nâng `react`?
10. Vì sao rate limit trong bộ nhớ gần vô dụng trên serverless?

---

## 🎓 Kết thúc

Đây là chương cuối. Bạn đã đi qua 24 chương: từ cơ chế Fiber bên trong React, qua kiến trúc App Router,
tới engineering thực tế (performance, a11y, security). Để ôn lại, quay về `README.md` (lộ trình đọc) và
checklist ở file `14` — rồi áp các bảng "danh sách sửa" của file `22`–`24` vào chính repo này.
