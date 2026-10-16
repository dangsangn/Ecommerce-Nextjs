# 09. Routing, Layout & Route Groups

> **Mục tiêu:** đọc được cây route của repo, hiểu route group giải quyết vấn đề gì, biết vì sao
> `params`/`searchParams` là Promise, và nhận ra các file convention còn thiếu.

---

## 1. Overview

### File-system routing: thư mục = URL, tên file = vai trò

| File | Vai trò | Bọc cái gì |
| --- | --- | --- |
| `page.tsx` | UI của route — **bắt buộc để URL truy cập được** | — |
| `layout.tsx` | Vỏ dùng chung, **giữ state qua các lần navigate** | `page` và layout con |
| `template.tsx` | Như layout nhưng **mount lại** mỗi lần navigate | `page` |
| `loading.tsx` | Suspense fallback tự động | `page` + segment con |
| `error.tsx` | Error boundary (`'use client'`) | `page` + segment con |
| `not-found.tsx` | UI khi gọi `notFound()` trong segment; URL không khớp route nào chỉ do **root** `app/not-found.tsx` xử lý | — |
| `default.tsx` | Fallback cho slot của parallel route | — |
| `route.ts` | HTTP endpoint (không phải UI) | — |

| Cú pháp thư mục | Ý nghĩa | Có trong URL? |
| --- | --- | --- |
| `products` | Segment tĩnh | ✅ `/products` |
| `[id]` | Segment động | ✅ `/products/abc` → `id = 'abc'` |
| `[...slug]` / `[[...slug]]` | Catch-all / catch-all tuỳ chọn | ✅ `/a/b/c` → `['a','b','c']` |
| `(group)` | **Route group** | ❌ |
| `_folder` | Private folder | ❌ không tạo route |
| `@slot` | Parallel route slot | ❌ — Next 16 **bắt buộc** có `default.tsx` cho mỗi slot, thiếu là build lỗi (file `19`) |

---

## 2. Mental Model

### 🧠 Layout như những chiếc hộp lồng nhau

```
┌─ app/layout.tsx ─────────────────────────────────────────┐
│  <html><body> {children} <Toaster/> </body></html>       │
│  ┌─ app/(seller)/seller/layout.tsx ───────────────────┐  │
│  │  <aside><SellerSidebar/></aside> <SellerMobileNav/> │  │
│  │  <main> {children} </main>                          │  │
│  │  ┌─ app/(seller)/seller/products/page.tsx ──────┐   │  │
│  │  │  Danh sách sản phẩm                           │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Điều hướng `/seller/products` → `/seller/discounts`:

- ✅ `SellerSidebar`, `SellerMobileNav` **không mount lại** — giữ scroll, giữ state `open` của drawer
- ✅ Server **chỉ render segment thay đổi** (page), layout dùng chung không bị fetch lại

### 🧠 Route group = "phân loại", không phải "định tuyến"

`(store)` không tạo `/store`. Nó chỉ nói: *"nhóm các route này để dùng chung một layout, đừng thêm gì vào URL."*

---

## 3. Cây route thật của repo

```
app/
├── layout.tsx ......................... Root (html, body, font, Toaster, metadata)
├── (auth)/ ............................ 🔓 header gọn + card căn giữa (max-w-sm)
│   ├── login/ signup/ verify-otp/
│   └── forgot-password/ reset-password/
├── (store)/ ........................... 🛍️ StoreHeader + main + footer
│   ├── page.tsx ....................... → /
│   ├── products/[id]/page.tsx ......... → /products/:id
│   ├── cart/ checkout/ ................ → /cart, /checkout
│   └── orders/page.tsx, orders/[id]/ .. → /orders, /orders/:id
└── (seller)/seller/ ................... 🏪 Sidebar + mobile nav
    ├── page.tsx ....................... → /seller
    ├── account/ ....................... → /seller/account
    ├── products/ (page, new/, [id]/edit/)
    └── discounts/ (page, new/)
```

`(seller)/seller/` có **cả** group `(seller)` **và** segment thật `seller` → URL là `/seller`, không phải
`/seller/seller`.

---

## 4. ⭐ Route Group — vấn đề nó giải quyết

Ba vùng UI khác hẳn nhau:

| Group | 📄 Layout | Vỏ |
| --- | --- | --- |
| `(store)` | `app/(store)/layout.tsx` | `<StoreHeader />` (async, đọc cookie) + `<main>` + footer perks |
| `(seller)` | `app/(seller)/seller/layout.tsx` | `<aside><SellerSidebar/></aside>` + `<SellerMobileNav/>` + `<main>` |
| `(auth)` | `app/(auth)/layout.tsx` | Header logo + một card căn giữa |

**Không có route group**, cả ba chia sẻ `app/layout.tsx` và bạn phải viết:

```tsx
// ❌ Layout điều kiện theo pathname
'use client'   // buộc phải client vì cần usePathname!
export default function RootLayout({ children }) {
  const pathname = usePathname()
  const isAuth = ['/login', '/signup', '/verify-otp'].some((p) => pathname.startsWith(p))
  const isSeller = pathname.startsWith('/seller')
  return (
    <html><body>
      {!isAuth && !isSeller ? <StoreHeader /> : null}   {/* async Server Component — KHÔNG dùng được ở đây */}
      {isSeller ? <SellerSidebar /> : null}
      <main className={isAuth ? 'flex justify-center' : 'mx-auto max-w-7xl'}>{children}</main>
    </body></html>
  )
}
```

| Vấn đề | Hệ quả |
| --- | --- |
| `'use client'` ở root | Mất `metadata` export, mọi thứ import từ đây vào bundle |
| `StoreHeader` là async Server Component | Không render được từ client layout |
| Logic route rải trong JSX | Thêm route = sửa điều kiện nhiều chỗ, dễ quên (`/forgot-password` đã bị quên ở trên) |

**Route group giải quyết bằng cách di chuyển thư mục** — mỗi group một layout Server Component, không một
dòng điều kiện.

Công dụng khác: nhóm theo team/domain (`(marketing)`, `(admin)`); `error.tsx`/`loading.tsx` riêng cho
từng vùng; **nhiều root layout** (mỗi group có `layout.tsx` riêng chứa `<html>` — repo không dùng).

```
// ⚠️ Hai group không được cùng resolve về một URL
app/(store)/page.tsx      → /
app/(marketing)/page.tsx  → /     ❌ build lỗi
```

---

## 5. `params` và `searchParams` là Promise

📄 `app/(store)/orders/[id]/page.tsx`, `app/(store)/page.tsx`:

```tsx
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // ...
}

export default async function StoreHomePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  // ...
}
```

**Next 15** đổi sang Promise nhưng vẫn cho truy cập đồng bộ (kèm cảnh báo). **Next 16 bỏ hẳn truy cập đồng
bộ** — `params.id` không `await` là lỗi. Áp dụng cho `params` của `page`, `layout`, `route`, `default` và
image route (`opengraph-image`, `icon`...); `searchParams` (chỉ `page` có — layout/route không nhận);
cùng với `cookies()`, `headers()`, `draftMode()`. `generateMetadata` nhận cùng `params`/`searchParams` Promise.

```tsx
// ❌ Next 16: lỗi
export default function Page({ params }: { params: { id: string } }) {
  return <Detail id={params.id} />
}

// ✅ Helper global `PageProps` do `next dev` / `next build` / `next typegen` sinh ra
export default async function Page(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params
  return <Detail id={id} />
}

// ✅ `LayoutProps` — params + slot (@modal...) có kiểu, suy ra từ cây thư mục; không cần import
export default async function ProductLayout(props: LayoutProps<'/products/[id]'>) {
  const { id } = await props.params
  return <section data-product={id}>{props.children}</section>
}
```

Route literal là **URL**, không chứa route group: `PageProps<'/products/[id]'>`, không phải
`'/(store)/products/[id]'`. Thêm route mới mà type báo lỗi → chạy lại `next dev`/`next typegen`.

### Vì sao là Promise?

Biết URL/request là **thông tin chỉ có lúc request**. Biến nó thành Promise cho framework render được
mọi thứ **không** phụ thuộc vào nó trước, và chỉ dừng ở đúng chỗ `await`.

⚠️ Lợi ích này chỉ hiện thực khi có **Partial Prerendering = `cacheComponents: true`** (file `10` §9). Repo
đang ở mô hình cũ: route nào đọc request data thì **cả route** dynamic, nên `await` ở đầu page không làm
mất gì đo được. Dưới Cache Components, pattern đúng là:

```tsx
// ✅ Truyền Promise xuống, await bên trong Suspense — phần còn lại vào static shell
export default function Page({ params }: PageProps<'/orders/[id]'>) {
  return (
    <>
      <OrderPageHeader />                         {/* static shell */}
      <Suspense fallback={<OrderSkeleton />}>
        <OrderDetail params={params} />           {/* chỉ phần này chờ request */}
      </Suspense>
    </>
  )
}

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await apiFetch<Order>(`/order/${id}`, { auth: true })
  return <OrderView order={order} />
}
```

### 📄 Ba cách xử lý `searchParams` trong repo

**(a) Whitelist** — `app/(seller)/seller/products/page.tsx`:

```tsx
const tab = sp.tab === 'published' ? 'published' : 'draft'
const page = Number(sp.page) > 0 ? Number(sp.page) : 1
```

Mọi giá trị lạ (`?tab=<script>`) về `'draft'`.

**(b) Trim + encode** — `app/(store)/page.tsx` → `lib/products/catalog-query.ts`:

```tsx
if (trimmed) s += `&keySearch=${encodeURIComponent(trimmed)}`
```

Không encode thì `áo&limit=99999` inject thêm tham số vào request tới backend.

**(c) Redirect target** — `app/(auth)/login/page.tsx`:

```tsx
const { redirect, reset } = await searchParams
return <LoginForm redirectTo={redirect || '/seller'} justReset={reset === '1'} />
```

⚠️ **Lỗ open redirect thật.** `redirect` đi URL → prop → hidden input → 📄 `actions/auth.actions.ts`:

```tsx
const redirectTo = (formData.get('redirect') as string) || '/'
// ... đăng nhập
redirect(redirectTo)      // ← giá trị người dùng kiểm soát
```

Gửi nạn nhân `/login?redirect=https://evil.example/phish` → họ đăng nhập thật trên domain thật → bị đẩy
sang trang giả "nhập lại mật khẩu". (Server Action `redirect()` tới URL tuyệt đối sẽ thành hard navigation
sang domain đó.)

```tsx
// lib/auth/safe-redirect.ts — chỉ nhận đường dẫn nội bộ
export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string') return fallback
  if (!target.startsWith('/')) return fallback     // http:, https:, javascript:
  if (target.startsWith('//')) return fallback     // //evil.com
  if (target.includes('\\')) return fallback       // /\evil.com (một số browser hiểu là //)
  return target
}

// actions/auth.actions.ts
const redirectTo = safeRedirect(formData.get('redirect'), '/')
```

Hàm pure → test ngay bằng Vitest (`lib/auth/__tests__/`):

```tsx
it('chặn URL tuyệt đối và protocol-relative', () => {
  expect(safeRedirect('https://evil.example')).toBe('/')
  expect(safeRedirect('//evil.example')).toBe('/')
  expect(safeRedirect('/seller/products')).toBe('/seller/products')
})
```

> **Nguyên tắc:** mọi giá trị từ `searchParams` là **input người dùng** — nghi ngờ như body của POST.

---

## 6. `layout.tsx` — hai giới hạn phải biết

### Giới hạn 1: Layout KHÔNG nhận `searchParams`

Layout nhận `children` và `params`, **không có `searchParams`** — nếu có, nó phải render lại mỗi khi query
đổi, mất lợi ích "layout không mount lại".

📄 Hệ quả trong repo (bug `SearchBox` ở file `02`): `app/(store)/layout.tsx` render `<StoreHeader />` mà
**không thể** truyền `q`. Cách xử lý: component cần query thì là Client Component dùng `useSearchParams()`
(bọc `<Suspense>`), hoặc lấy từ `page.tsx`.

### Giới hạn 2: Layout không render lại khi navigate trong phạm vi của nó

Thường là ưu điểm, nhưng dữ liệu hiển thị ở layout có thể cũ. Ví dụ: 📄 `StoreHeader` hiển thị badge giỏ
hàng; `addToCartAction` (📄 `actions/cart.actions.ts`) chỉ gọi `revalidatePath('/cart')` trong khi người
dùng đang ở `/products/:id`.

Ở Next 16.2 badge **vẫn cập nhật** — vì bất kỳ revalidation nào trong Server Action đều khiến server render
lại **trang hiện tại từ root** (gồm cả layout) và gửi kèm response (chi tiết + trích source: file `10` §4–5).
Nhưng đó là hành vi tạm thời được ghi TODO trong source; đừng dựa vào nó. Nói đúng ý:

```tsx
// ❌ ngầm dựa vào "revalidate gì cũng render lại trang hiện tại"
revalidatePath('/cart')

// ✅ (a) dữ liệu no-store: làm mới trang đang đứng, gồm layout
import { refresh } from 'next/cache'
refresh()

// ✅ (b) búa lớn: invalidate layout (store) và mọi trang bên dưới
revalidatePath('/', 'layout')

// ✅ (c) phản hồi tức thì: optimistic badge qua Context client (file 07)
```

### `template.tsx` — khi bạn *muốn* mount lại

```tsx
// app/(store)/template.tsx — mỗi lần navigate tạo <div> mới → animation chạy lại, state con reset
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in duration-200">{children}</div>
}
```

Dùng để chạy lại animation vào trang, reset form, hoặc effect "page view" theo từng lần điều hướng.

---

## 7. ⚠️ Các convention còn thiếu trong repo

Repo chỉ có `page.tsx` và `layout.tsx`.

### `not-found.tsx` + `notFound()` — vấn đề SEO thật

📄 `app/(store)/products/[id]/page.tsx` hiện render lỗi inline:

```tsx
if (error || !detail) {
  return (
    <div className="space-y-4">
      <Link href="/">← Back to store</Link>
      <p className="text-sm text-destructive">{error ?? 'Product not found'}</p>
    </div>
  )
}
```

→ **HTTP 200**. Google index "Product not found" như trang hợp lệ (soft 404), monitoring không đếm được
link chết, CDN cache trang lỗi như trang thường.

```tsx
// ✅ app/(store)/products/[id]/page.tsx
import { notFound } from 'next/navigation'
import { ApiError } from '@/lib/api/http'

let detail: ProductDetail
try {
  detail = normalizeProductDetail(await apiFetch<unknown>(`/product/${id}`))
} catch (e) {
  if (e instanceof ApiError && e.status === 404) notFound()   // 404 thật
  throw e                                                       // 500/network → error.tsx
}
// từ đây `detail` chắc chắn có — notFound() trả về `never`, TS tự narrow
```

```tsx
// app/(store)/not-found.tsx
export default function StoreNotFound() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h2 className="text-xl font-semibold">Không tìm thấy trang</h2>
      <Link href="/" className="text-sm text-primary hover:underline">← Về trang chủ</Link>
    </div>
  )
}
```

⚠️ Status 404 chỉ có khi `notFound()` chạy **trước** khi stream bắt đầu. Nếu segment có `loading.tsx`
(hoặc `notFound()` nằm trong một `<Suspense>`), header 200 đã gửi; Next chèn `<meta name="robots"
content="noindex">` thay thế. Thêm `loading.tsx` cho `products/[id]` (file `06`) là đánh đổi điều này.

### `loading.tsx`, `error.tsx`, `global-error.tsx`

Chi tiết ở file `06` và `16`. Cấu trúc nên có:

```
app/
├── global-error.tsx              ← lỗi ở root layout
├── not-found.tsx                 ← URL không khớp route nào (group not-found không bắt được)
├── (store)/
│   ├── error.tsx, not-found.tsx
│   ├── products/[id]/loading.tsx
│   └── orders/loading.tsx, orders/[id]/loading.tsx
└── (seller)/seller/
    ├── error.tsx
    └── products/loading.tsx
```

---

## 8. Điều hướng: `<Link>` vs `router.push` vs `redirect()`

| Cách | Chạy ở | Dùng khi | Ví dụ trong repo |
| --- | --- | --- | --- |
| `<Link href>` | Server hoặc client | Người dùng bấm | `product-card.tsx`, `product-grid.tsx`, `seller-sidebar.tsx` |
| `router.push()` | Client | Điều hướng sau logic client | `search-box.tsx` |
| `router.replace()` | Client | Đổi URL **không** thêm history | `welcome-toast.tsx` (xoá `?welcome=1`) |
| `redirect()` | Server | Sau Server Action / trong Server Component | `auth.actions.ts`, `user.actions.ts`, `order.actions.ts` |

### `<Link>` và prefetching (chỉ ở production)

| Route đích | `prefetch` mặc định (`"auto"`) |
| --- | --- |
| Static | Prefetch **toàn bộ** route + dữ liệu |
| Dynamic | Chỉ prefetch tới **`loading.tsx` gần nhất** — không có `loading.tsx` thì gần như không có gì để dùng ngay |

📄 `components/store/product-card.tsx` bọc cả card trong `<Link>` tới `/products/:id` — một route
**dynamic** không có `loading.tsx`. Nên cuộn qua grid **không** tải sẵn trang chi tiết; bấm vào vẫn phải chờ
server render. Thêm `products/[id]/loading.tsx` → skeleton được prefetch, bấm là thấy ngay. (`prefetch={true}`
ép prefetch toàn bộ, kể cả dynamic — tốn băng thông, cân nhắc với grid 12 sản phẩm.)

`router.push` không prefetch và cần `'use client'` → chỉ dùng khi điều hướng phụ thuộc logic (như
`search-box.tsx` đọc `formData`).

### `redirect()` throw — đừng gọi trong `try/catch`

`redirect()` (và `notFound()`) hoạt động bằng cách **throw** một lỗi đặc biệt (`NEXT_REDIRECT`) mà framework bắt.

```tsx
// ❌ catch nuốt luôn NEXT_REDIRECT → đăng nhập thành công nhưng thấy lỗi, không chuyển trang
try {
  await apiFetch('/auth/login', { body: parsed.data })
  redirect('/seller')
} catch (e) {
  return { ok: false, message: 'Could not sign you in' }
}

// ✅ Repo làm đúng — 📄 actions/auth.actions.ts, actions/user.actions.ts
try {
  const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
  await setSession(data.tokens, data.user._id)
} catch (e) {
  return { ok: false, message: errorMessage(e, 'Could not sign you in') }
}
redirect(redirectTo)        // NGOÀI try/catch
```

Nếu buộc phải gọi trong `try`, re-throw lỗi của framework bằng `unstable_rethrow` (`next/navigation`):

```tsx
} catch (e) {
  unstable_rethrow(e)        // ném lại NEXT_REDIRECT / notFound / lỗi dynamic của Next
  return { ok: false, message: 'Could not sign you in' }
}
```

📄 `actions/user.actions.ts` có comment mẫu: *"Must run OUTSIDE the try/catch above — redirect() throws NEXT_REDIRECT."*

---

## 9. Metadata

📄 `app/layout.tsx` — metadata **duy nhất** của repo:

```tsx
export const metadata: Metadata = { title: "E-Commerce Seller", description: "Seller dashboard" }
```

Cả storefront public (`/`, `/products/:id`) mang title "E-Commerce Seller" — sai cho SEO và tab browser;
trang sản phẩm không có title động.

```tsx
// app/(store)/layout.tsx — metadata theo group + template
export const metadata: Metadata = {
  title: { default: 'SHOP', template: '%s | SHOP' },
  description: 'Mua sắm trực tuyến từ các shop uy tín.',
}
```

```tsx
// app/(store)/products/[id]/page.tsx — metadata động
export async function generateMetadata({ params }: PageProps<'/products/[id]'>): Promise<Metadata> {
  const { id } = await params
  try {
    const { spu } = normalizeProductDetail(await apiFetch<unknown>(`/product/${id}`))
    return {
      title: spu.product_name,                       // → "Áo thun trắng | SHOP"
      description: spu.product_description ?? spu.product_name,
      openGraph: { images: spu.product_thumb ? [{ url: spu.product_thumb }] : [] },
    }
  } catch {
    return { title: 'Không tìm thấy sản phẩm' }
  }
}
```

**`generateMetadata` và page cùng fetch `/product/${id}` — gọi API hai lần?** Không: Next memoize `fetch`
GET cùng URL + options trong một request, kể cả `no-store` (file `10` §6).

**Streaming metadata:** với trang dynamic, Next gửi UI trước và chèn thẻ metadata khi `generateMetadata`
xong — `generateMetadata` chậm không chặn TTFB. Riêng bot không chạy JS (ví dụ `facebookexternalhit`,
cấu hình bằng `htmlLimitedBots`) vẫn được chờ để có thẻ trong `<head>`.

Thêm `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')` ở root layout để
URL tương đối trong `openGraph.images` thành URL tuyệt đối khi share link.

---

## 10. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Layout lồng nhau giữ state, chỉ segment đổi được render | Layout không nhận `searchParams`, dữ liệu ở layout dễ cũ |
| Route group tách layout không đổi URL | Thêm tầng thư mục; hai group không được trùng URL |
| `params`/`searchParams` async → nền tảng cho PPR | Phải `await` mọi nơi; lợi ích chỉ thật khi bật Cache Components |
| Convention rõ (`loading`, `error`, `not-found`, `default`) | Thiếu chúng thì âm thầm mất UX/SEO (repo hiện tại) |
| `<Link>` prefetch tự động | Route dynamic không có `loading.tsx` gần như không được prefetch |
| `redirect()` khai báo, dùng từ server | Nó **throw** — trong `try/catch` là bug im lặng |

---

## 11. Best Practices

1. **Route group cho mỗi vùng UI có layout riêng** — không bao giờ `if (pathname.startsWith(...))` trong layout.
2. **`searchParams` là input người dùng:** whitelist, `encodeURIComponent`, validate redirect target.
3. **Sửa open redirect** ở `login/page.tsx` + `loginAction` bằng `safeRedirect`.
4. **`notFound()` thay vì render "Not found" inline** — 404 thật, narrowing miễn phí; nhớ tương tác với `loading.tsx`.
5. **`redirect()`/`notFound()` ngoài `try/catch`**, hoặc `unstable_rethrow`.
6. **`loading.tsx` cho route dynamic có fetch** — vừa streaming vừa giúp prefetch.
7. **Metadata theo group với `template`**, `generateMetadata` cho trang sản phẩm.
8. **Action đổi dữ liệu hiển thị ở layout** → `refresh()` hoặc `revalidatePath(..., 'layout')`, nói đúng ý.

---

## Tự kiểm tra

1. Vì sao `(seller)/seller/page.tsx` cho URL `/seller`?
2. Không có route group, layout root phải làm gì? Kể ba vấn đề.
3. Next 16 thay đổi gì với `params` so với Next 15? Lợi ích của việc là Promise chỉ thật sự có khi nào?
4. Vì sao badge giỏ hàng *hiện* vẫn cập nhật sau "Add to cart", và vì sao vẫn nên sửa?
5. Chỉ ra lỗ open redirect trong repo và cách sửa.
6. Vì sao cuộn qua grid sản phẩm không prefetch trang chi tiết? Sửa thế nào?
7. Khi nào `notFound()` trả về 404, khi nào chỉ là 200 + `noindex`?

➡️ Tiếp theo: `10-data-fetching-caching.md`
