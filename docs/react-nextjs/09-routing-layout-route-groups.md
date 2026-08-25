# 09. Routing, Layout & Route Groups

> **Mục tiêu:** đọc được cây route của repo này, hiểu route group giải quyết vấn đề gì,
> biết vì sao `params`/`searchParams` là Promise, và nhận ra các file convention còn thiếu.

---

## 1. Overview

### File-system routing: thư mục = URL

Trong App Router, **cấu trúc thư mục quyết định URL**, và **tên file quyết định vai trò**:

| File | Vai trò | Bọc cái gì |
| --- | --- | --- |
| `page.tsx` | UI của route — **bắt buộc để URL truy cập được** | — |
| `layout.tsx` | Vỏ bọc dùng chung, **giữ state qua các lần navigate** | `page` và các layout con |
| `template.tsx` | Như layout nhưng **tạo lại** mỗi lần navigate | `page` |
| `loading.tsx` | Suspense fallback tự động | `page` |
| `error.tsx` | Error boundary (`'use client'`) | `page` |
| `not-found.tsx` | UI khi gọi `notFound()` hoặc route không tồn tại | — |
| `route.ts` | API endpoint (không phải UI) | — |

Và các quy ước đặt tên thư mục:

| Cú pháp | Ý nghĩa | Có trong URL? |
| --- | --- | --- |
| `products` | Segment tĩnh | ✅ `/products` |
| `[id]` | Segment động | ✅ `/products/abc` → `params.id = 'abc'` |
| `[...slug]` | Catch-all | ✅ `/a/b/c` → `params.slug = ['a','b','c']` |
| `[[...slug]]` | Catch-all tuỳ chọn | ✅ khớp cả `/` |
| `(group)` | **Route group** | ❌ **Không xuất hiện trong URL** |
| `_folder` | Private folder | ❌ Không tạo route |
| `@folder` | Named slot (parallel routes) | ❌ |

---

## 2. Mental Model

### 🧠 Layout như những chiếc hộp lồng nhau

Layout **không bị thay thế** khi bạn điều hướng trong phạm vi của nó. Chúng lồng vào nhau, và
`{children}` là cái lỗ để hộp con lọt vào:

```
┌─ app/layout.tsx ────────────────────────────────────────┐
│  <html> <body> {children} <Toaster/> </body> </html>    │
│                                                          │
│  ┌─ app/(seller)/seller/layout.tsx ──────────────────┐  │
│  │  <aside><SellerSidebar/></aside>                   │  │
│  │  <SellerMobileNav/>                                │  │
│  │  <main> {children} </main>                         │  │
│  │                                                     │  │
│  │  ┌─ app/(seller)/seller/products/page.tsx ─────┐  │  │
│  │  │  Danh sách sản phẩm                          │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Hệ quả cực kỳ quan trọng của việc "layout không bị thay thế":**

Khi bạn điều hướng từ `/seller/products` sang `/seller/discounts`:

- ✅ `SellerSidebar` **không** re-render → vị trí scroll của nó được giữ
- ✅ `SellerMobileNav` giữ nguyên state `open` (nếu drawer đang mở)
- ✅ Không có "nhấp nháy" ở phần vỏ
- ✅ **Chỉ `page.tsx` được fetch lại** — RSC payload nhỏ hơn nhiều so với tải cả trang

Đây là lý do App Router cho cảm giác như SPA dù render trên server.

### 🧠 Route group như thư mục để "phân loại", không phải "định tuyến"

`(store)` không tạo ra `/store`. Nó chỉ nói với Next.js: *"nhóm các route này lại để chúng dùng chung
một layout, nhưng đừng thêm gì vào URL."*

---

## 3. Cây route thật của repo này

```
app/
├── layout.tsx ......................... Root layout (html, body, font, Toaster)
├── globals.css
│
├── (auth)/ ............................ 🔓 Group: trang xác thực
│   ├── layout.tsx ..................... Căn giữa, card hẹp (max-w-sm)
│   ├── login/page.tsx ................. → /login
│   ├── signup/page.tsx ................ → /signup
│   └── verify-otp/page.tsx ............ → /verify-otp
│
├── (store)/ ........................... 🛍️ Group: mặt tiền cửa hàng
│   ├── layout.tsx ..................... StoreHeader + main + footer
│   ├── page.tsx ....................... → /            (danh mục sản phẩm)
│   ├── products/[id]/page.tsx ......... → /products/:id
│   ├── cart/page.tsx .................. → /cart
│   ├── checkout/page.tsx .............. → /checkout
│   ├── orders/page.tsx ................ → /orders
│   └── orders/[id]/page.tsx ........... → /orders/:id
│
└── (seller)/ .......................... 🏪 Group: dashboard người bán
    └── seller/
        ├── layout.tsx ................. Sidebar + mobile nav + main
        ├── page.tsx ................... → /seller
        ├── account/page.tsx ........... → /seller/account
        ├── products/
        │   ├── page.tsx ............... → /seller/products
        │   ├── new/page.tsx ........... → /seller/products/new
        │   └── [id]/edit/page.tsx ..... → /seller/products/:id/edit
        └── discounts/
            ├── page.tsx ............... → /seller/discounts
            └── new/page.tsx ........... → /seller/discounts/new
```

Chú ý cấu trúc `(seller)/seller/` — có **cả** group `(seller)` **và** segment thật `seller`.
Group không xuất hiện trong URL, nên URL là `/seller`, không phải `/seller/seller`.

---

## 4. ⭐ Route Group — vấn đề nó giải quyết

### Vấn đề: ba layout khác nhau, một cây URL

Repo này có ba vùng UI hoàn toàn khác nhau:

📄 `app/(store)/layout.tsx` — có header và footer:

```tsx
import { StoreHeader } from '@/components/store/store-header'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">© Shop</div>
      </footer>
    </div>
  )
}
```

📄 `app/(seller)/seller/layout.tsx` — có sidebar, không có header/footer:

```tsx
import { SellerSidebar } from '@/components/seller/seller-sidebar'
import { SellerMobileNav } from '@/components/seller/seller-mobile-nav'

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SellerSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <SellerMobileNav />
        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  )
}
```

📄 `app/(auth)/layout.tsx` — không header, không sidebar, chỉ một card căn giữa:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
```

**Không có route group, bạn phải làm gì?**

Nếu đặt phẳng `app/login/page.tsx`, `app/cart/page.tsx`, `app/seller/page.tsx` thì cả ba **cùng chia sẻ
`app/layout.tsx`** — chỉ có một layout cho tất cả. Bạn buộc phải viết logic điều kiện:

```tsx
// ❌ Cách phải làm nếu không có route group
'use client'   // buộc phải client vì cần usePathname!
export default function RootLayout({ children }) {
  const pathname = usePathname()
  const isAuth = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/verify-otp')
  const isSeller = pathname.startsWith('/seller')

  return (
    <html><body>
      {!isAuth && !isSeller ? <StoreHeader /> : null}
      {isSeller ? <SellerSidebar /> : null}
      <main className={isAuth ? 'flex items-center justify-center' : 'mx-auto max-w-6xl'}>
        {children}
      </main>
      {!isAuth && !isSeller ? <Footer /> : null}
    </body></html>
  )
}
```

Đây là code tệ theo nhiều cách:

| Vấn đề | Hệ quả |
| --- | --- |
| Phải là `'use client'` (cần `usePathname`) | **Toàn bộ app** trở thành client tree — mất hết lợi ích RSC |
| `StoreHeader` là `async` Server Component | **Không dùng được** trong client layout — phải viết lại |
| Logic route rải trong JSX | Thêm route mới = phải sửa điều kiện ở 4 chỗ, dễ quên |
| Mọi component của mọi vùng đều được import | Client bundle chứa cả sidebar seller khi người dùng đang ở trang login |

**Route group giải quyết tất cả bằng cách di chuyển thư mục.** Mỗi group có layout riêng, mỗi layout
là Server Component thuần, và Next.js chọn layout đúng dựa trên đường dẫn file — không cần một dòng
logic điều kiện nào.

### Route group còn dùng để làm gì

| Mục đích | Ví dụ |
| --- | --- |
| Layout khác nhau cho từng vùng | Repo này: `(store)`, `(seller)`, `(auth)` |
| Nhóm route theo team/domain | `(marketing)`, `(dashboard)`, `(admin)` |
| Tách `loading.tsx`/`error.tsx` theo vùng | `(store)/error.tsx` khác `(seller)/error.tsx` |
| Nhiều root layout | Đặt `layout.tsx` với `<html>` trong từng group (repo này không dùng) |

### ⚠️ Cạm bẫy: hai group không thể cùng sở hữu một URL

```
app/
├── (store)/page.tsx      → /
└── (marketing)/page.tsx  → /     ❌ LỖI: hai file cùng resolve về "/"
```

Next.js sẽ báo lỗi build. Repo này an toàn vì chỉ `(store)` có `page.tsx` ở cấp gốc của group.

---

## 5. `params` và `searchParams` là Promise (Next.js 15+)

📄 `app/(store)/orders/[id]/page.tsx`:

```tsx
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>      // ← Promise, không phải object
}) {
  const { id } = await params          // ← phải await
  let order: Order | null = null
  let error: string | null = null
  try {
    order = await apiFetch<Order>(`/order/${id}`, { auth: true })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load this order'
  }
  // ...
```

📄 `app/(store)/page.tsx`:

```tsx
export default async function StoreHomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
```

### Vì sao lại là Promise? Đây không phải để cho đẹp.

Nó cho phép Next.js **bắt đầu render phần tĩnh của trang TRƯỚC KHI biết giá trị động**.

Hình dung timeline:

```
Không có Promise (Next.js 14):
├─ Chờ có request đầy đủ
├─ Đọc params
└─ Render CẢ trang
   └─ Không thể prerender bất cứ gì nếu trang dùng params

Có Promise (Next.js 15+):
├─ Bắt đầu render ngay
├─ Render mọi phần KHÔNG cần params (header, nav, skeleton, layout)
├─ Gặp `await params` → tạm dừng đúng chỗ đó
└─ Params sẵn sàng → tiếp tục phần còn lại
```

Đây chính là ý tưởng đằng sau **Partial Prerendering**: một trang có thể vừa có phần tĩnh (prerender
tại build time, phục vụ từ CDN) vừa có phần động (render mỗi request), và ranh giới là chỗ bạn `await`.

> **Cách nghĩ đúng:** `params` là Promise vì việc **biết URL** là một "hoạt động động".
> Cũng như `cookies()` và `headers()` là async, vì lý do y hệt.

### Sai lầm nên tránh: `await` quá sớm

```tsx
// ❌ Chặn ngay dòng đầu → không prerender được gì
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div>
      <ExpensiveStaticHeader />       {/* phải chờ params dù không cần nó */}
      <Detail id={id} />
    </div>
  )
}

// ✅ Truyền Promise xuống, await ở đúng chỗ cần
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <ExpensiveStaticHeader />        {/* render ngay, không chờ */}
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />     {/* chỉ phần này chờ params */}
      </Suspense>
    </div>
  )
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await apiFetch<Order>(`/order/${id}`, { auth: true })
  return <OrderView order={order} />
}
```

Với repo này, các trang khá nhẹ nên `await` ở đầu không gây vấn đề đo được. Nhưng đây là pattern
đáng biết khi trang có phần tĩnh nặng.

### 📄 Ba cách xử lý searchParams trong repo

**(a) Tab — validate chặt (`products/page.tsx`):**

```tsx
const sp = await searchParams
const tab = sp.tab === 'published' ? 'published' : 'draft'
const page = Number(sp.page) > 0 ? Number(sp.page) : 1
```

Dùng whitelist: chỉ `'published'` được nhận, mọi giá trị khác về `'draft'`. Đây là cách xử lý input
không tin cậy đúng đắn — người dùng có thể gõ `?tab=<script>` vào URL.

**(b) Search query — trim (`page.tsx`):**

```tsx
const q = (sp.q ?? '').trim()
```

Rồi được encode ở `lib/products/catalog-query.ts`:

```tsx
if (trimmed) s += `&keySearch=${encodeURIComponent(trimmed)}`
```

`encodeURIComponent` là bắt buộc — nếu không, người dùng gõ `áo&limit=99999` sẽ inject thêm tham số
vào request tới backend.

**(c) Redirect target — có fallback (`login/page.tsx`):**

```tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect } = await searchParams
  return <LoginForm redirectTo={redirect || '/seller'} />
}
```

⚠️ **Đây là chỗ có rủi ro bảo mật thật: open redirect.**

`redirect` đi từ URL → prop → hidden input → Server Action:

📄 `actions/auth.actions.ts`:

```tsx
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  const redirectTo = (formData.get('redirect') as string) || '/'
  try {
    const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
    await setSession(data.tokens, data.user._id)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not sign you in') }
  }
  redirect(redirectTo)      // ← redirect tới giá trị người dùng kiểm soát
}
```

Kịch bản tấn công: gửi link `/login?redirect=https://evil.example/phish` cho nạn nhân. Họ đăng nhập
thật (trên domain thật, thấy URL đúng, thanh địa chỉ hợp lệ), rồi bị đẩy sang trang lừa đảo giống hệt
để "nhập lại mật khẩu".

**Cách sửa: chỉ cho phép đường dẫn nội bộ.**

```tsx
// lib/auth/safe-redirect.ts
/**
 * Chỉ nhận đường dẫn tương đối trong cùng site.
 * Chặn URL tuyệt đối (`https://…`) và protocol-relative (`//evil.com`).
 */
export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string') return fallback
  if (!target.startsWith('/')) return fallback     // chặn http://, https://, javascript:
  if (target.startsWith('//')) return fallback     // chặn //evil.com
  if (target.includes('\\')) return fallback       // chặn /\evil.com (một số browser coi là //)
  return target
}
```

```tsx
// actions/auth.actions.ts
import { safeRedirect } from '@/lib/auth/safe-redirect'
// ...
const redirectTo = safeRedirect(formData.get('redirect'), '/')
// ...
redirect(redirectTo)
```

Và vì `safeRedirect` là hàm pure, nó test được ngay — khớp với pattern `lib/` của repo:

```tsx
// lib/auth/__tests__/safe-redirect.test.ts
import { describe, it, expect } from 'vitest'
import { safeRedirect } from '@/lib/auth/safe-redirect'

describe('safeRedirect', () => {
  it('cho phép đường dẫn nội bộ', () => {
    expect(safeRedirect('/seller/products')).toBe('/seller/products')
  })
  it('chặn URL tuyệt đối', () => {
    expect(safeRedirect('https://evil.example')).toBe('/')
  })
  it('chặn protocol-relative', () => {
    expect(safeRedirect('//evil.example')).toBe('/')
  })
  it('chặn giá trị không phải string', () => {
    expect(safeRedirect(null)).toBe('/')
  })
})
```

> **Nguyên tắc:** mọi giá trị từ `searchParams` là **input của người dùng**. Xử lý nó với cùng mức
> nghi ngờ như bạn xử lý body của một request POST.

---

## 6. `layout.tsx` — hai giới hạn phải biết

### Giới hạn 1: Layout KHÔNG nhận `searchParams`

Layout chỉ nhận `children` và `params` (nếu ở trong segment động). **Không có `searchParams`.**

Đây là quyết định thiết kế có chủ đích: nếu layout nhận `searchParams`, nó sẽ phải re-render mỗi khi
query string đổi — và bạn mất toàn bộ lợi ích "layout không bị thay thế" ở mục 2.

📄 Đây là nguyên nhân của bug `SearchBox` đã nói ở file `02`:

```tsx
// app/(store)/layout.tsx
<StoreHeader />        {/* không thể truyền q — layout không có searchParams */}
```

**Cách xử lý:** component nào cần `searchParams` thì phải là Client Component dùng `useSearchParams()`
(và được bọc `<Suspense>`), hoặc nhận giá trị từ `page.tsx` thay vì từ layout.

### Giới hạn 2: Layout không re-render khi navigate trong phạm vi của nó

Đây thường là **ưu điểm** (giữ scroll, giữ state), nhưng đôi khi là bẫy:

📄 `components/store/store-header.tsx` fetch số lượng giỏ hàng:

```tsx
const cart = await apiFetch<Cart>('/cart', { auth: true })
cartCount = cart.cart_count_product ?? 0
```

Người dùng ở `/products/abc`, bấm "Add to cart". `addToCartAction` gọi:

📄 `actions/cart.actions.ts`:

```tsx
revalidatePath('/cart')
return { ok: true, message: 'Added to cart' }
```

Nó revalidate `/cart` — nhưng **`StoreHeader` nằm trong layout của `(store)`**, không phải trong
`/cart`. Badge số lượng **không cập nhật** cho tới khi người dùng navigate hoặc refresh.

**Ba cách sửa, theo mức độ:**

```tsx
// (a) Revalidate cả layout — đơn giản nhất, nhưng invalidate hết cache của (store)
revalidatePath('/', 'layout')

// (b) Dùng tag — chính xác hơn (chi tiết ở file 10)
// trong apiFetch: { tags: ['cart'] }
revalidateTag('cart')

// (c) Optimistic ở client — phản hồi tức thì, nhưng cần Context (xem file 07 mục cuối)
```

> **Bài học:** layout được cache riêng khỏi page. Nếu một Server Action đổi dữ liệu mà layout hiển
> thị, bạn phải revalidate **cả layout đó**, không chỉ page.

### `template.tsx` — khi bạn *muốn* remount

Nếu bạn cần layout **được tạo lại** mỗi lần navigate (để reset state, chạy lại animation vào trang,
hoặc log page view), dùng `template.tsx` thay vì `layout.tsx`:

```tsx
// app/(store)/template.tsx
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in duration-200">{children}</div>
}
```

Mỗi lần navigate → `<div>` mới → animation chạy lại. Với `layout.tsx`, nó chỉ chạy một lần.

---

## 7. ⚠️ Các convention còn thiếu trong repo

Repo hiện chỉ có `page.tsx` và `layout.tsx`. Đây là những gì còn thiếu và ảnh hưởng cụ thể:

### `not-found.tsx` + `notFound()` — vấn đề SEO thật

📄 Cách repo đang xử lý sản phẩm không tồn tại — `app/(store)/products/[id]/page.tsx`:

```tsx
if (error || !product) {
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-primary hover:underline">← Back to store</Link>
      <p className="text-sm text-destructive">{error ?? 'Product not found'}</p>
    </div>
  )
}
```

**Vấn đề: HTTP status code là `200 OK`.**

Hệ quả cụ thể:

| Ai bị ảnh hưởng | Hậu quả |
| --- | --- |
| Google | Index trang "Product not found" như một trang hợp lệ → soft 404, ảnh hưởng crawl budget |
| Monitoring/analytics | Không đếm được số lỗi 404 → không biết có link chết |
| CDN | Cache trang lỗi như trang bình thường |
| Client fetch | `res.ok === true` dù không có dữ liệu |

**Cách sửa:**

```tsx
// app/(store)/products/[id]/page.tsx
import { notFound } from 'next/navigation'
import { ApiError } from '@/lib/api/http'

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let product: Product
  try {
    product = await apiFetch<Product>(`/product/${id}`)
  } catch (e) {
    // 404 từ backend → 404 thật của Next.js
    if (e instanceof ApiError && e.status === 404) notFound()
    // Lỗi khác (500, network) → để error.tsx bắt
    throw e
  }
  // Từ đây `product` chắc chắn tồn tại — TypeScript cũng biết, không cần `product!`
```

```tsx
// app/(store)/not-found.tsx
import Link from 'next/link'

export default function StoreNotFound() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h2 className="text-xl font-semibold">Không tìm thấy trang</h2>
      <p className="text-sm text-muted-foreground">
        Nội dung bạn tìm không tồn tại hoặc đã bị xoá.
      </p>
      <Link href="/" className="text-sm text-primary hover:underline">← Về trang chủ</Link>
    </div>
  )
}
```

**Lợi ích phụ đáng chú ý:** `notFound()` **throw** (giống `redirect()`), nên TypeScript hiểu rằng
sau dòng đó `product` không thể là `null`. Điều này loại bỏ toàn bộ các dấu `!` trong file hiện tại:

```tsx
// Trước — cần `product!` vì TS không biết product đã được kiểm tra
<img key={img.public_id} src={img.url} alt={product!.product_name} ... />

// Sau — TS biết product: Product, không phải Product | null
<img key={img.public_id} src={img.url} alt={product.product_name} ... />
```

### `loading.tsx` và `error.tsx`

Đã trình bày chi tiết ở file `06`. Ưu tiên cao nhất: `orders/`, `orders/[id]/`, `products/[id]/`,
`seller/products/`.

### Cấu trúc đầy đủ nên có

```
app/
├── layout.tsx
├── global-error.tsx                  ← MỚI: lỗi ở root layout
├── (store)/
│   ├── layout.tsx
│   ├── error.tsx                     ← MỚI
│   ├── not-found.tsx                 ← MỚI
│   ├── loading.tsx                   ← MỚI
│   ├── page.tsx
│   ├── products/[id]/
│   │   ├── page.tsx
│   │   └── loading.tsx               ← MỚI (2 request tuần tự — chậm nhất)
│   └── orders/
│       ├── page.tsx
│       ├── loading.tsx               ← MỚI
│       └── [id]/
│           ├── page.tsx
│           └── loading.tsx           ← MỚI
└── (seller)/seller/
    ├── layout.tsx
    ├── error.tsx                     ← MỚI
    ├── loading.tsx                   ← MỚI
    └── products/
        ├── page.tsx
        └── loading.tsx               ← MỚI (có phân trang)
```

---

## 8. Điều hướng: `<Link>` vs `router.push` vs `redirect()`

Repo dùng cả ba, mỗi cái đúng chỗ:

| Cách | Chạy ở | Dùng khi | Ví dụ trong repo |
| --- | --- | --- | --- |
| `<Link href>` | Server hoặc client | Điều hướng người dùng chủ động bấm | `product-card.tsx`, `product-grid.tsx`, `seller-sidebar.tsx` |
| `router.push()` | Client | Điều hướng sau logic ở client | `search-box.tsx` |
| `router.replace()` | Client | Đổi URL **không** thêm vào history | `welcome-toast.tsx` (xoá `?welcome=1`) |
| `redirect()` | Server | Sau khi Server Action thành công | `auth.actions.ts`, `product.actions.ts`, `order.actions.ts` |

### `<Link>` và prefetching

`<Link>` không chỉ là `<a>`. Nó **prefetch** route đích khi link xuất hiện trong viewport (production build):

```tsx
<Link href={`/products/${product._id}`} className="group flex flex-col ...">
```

📄 `components/store/product-card.tsx` — cả card là một `<Link>`. Khi người dùng cuộn qua grid sản
phẩm, Next.js đã tải sẵn RSC payload của các trang chi tiết. Bấm vào → gần như tức thì.

Đây là lý do `router.push` **không nên** là mặc định: nó không có prefetch, và nó cần
`'use client'`. Chỉ dùng nó khi điều hướng phụ thuộc logic (như `search-box.tsx` cần đọc `formData`).

### `redirect()` — chi tiết dễ sai

📄 `actions/user.actions.ts` có một comment rất quan trọng:

```tsx
try {
  const data = await apiFetch<UpgradeData>('/user/me/upgrade-to-shop', { auth: true, body: parsed.data })
  await setSession(data.tokens, clientId)
} catch (e) {
  return { ok: false, message: errorMessage(e, 'Could not upgrade to a shop') }
}

revalidatePath('/seller/account')
// Send the new seller straight to their dashboard. `?welcome=1` triggers the
// success toast there (the form unmounts on redirect, so it can't toast itself).
// Must run OUTSIDE the try/catch above — redirect() throws NEXT_REDIRECT.
redirect('/seller?welcome=1')
```

**`redirect()` hoạt động bằng cách THROW một exception đặc biệt** (`NEXT_REDIRECT`). Next.js bắt
exception đó ở tầng framework và biến thành HTTP redirect.

Nghĩa là nếu bạn gọi `redirect()` **trong** `try/catch`:

```tsx
// ❌ BUG: catch bắt luôn NEXT_REDIRECT → redirect không xảy ra
try {
  await apiFetch('/auth/login', { body: parsed.data })
  redirect('/seller')            // throw NEXT_REDIRECT
} catch (e) {
  return { ok: false, message: 'Could not sign you in' }   // ← bắt cả redirect!
}
```

Người dùng đăng nhập **thành công** nhưng thấy thông báo lỗi và không được chuyển trang. Đây là bug
cực khó chẩn đoán, vì mọi thứ khác đều đúng.

📄 Repo tuân thủ đúng ở mọi action. `auth.actions.ts`:

```tsx
try {
  const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
  await setSession(data.tokens, data.user._id)
} catch (e) {
  return { ok: false, message: errorMessage(e, 'Could not sign you in') }
}
redirect(redirectTo)        // ← NGOÀI try/catch ✅
```

> **Quy tắc:** `redirect()` và `notFound()` luôn gọi **ngoài** `try/catch`.
> Nếu buộc phải gọi trong try, hãy re-throw: `if (isRedirectError(e)) throw e`.

---

## 9. Metadata

📄 `app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  title: "E-Commerce Seller",
  description: "Seller dashboard",
};
```

⚠️ **Đây là metadata duy nhất trong repo** — và nó có hai vấn đề:

1. **Nội dung không khớp.** Toàn bộ storefront (`/`, `/products/:id`, `/cart`, `/orders`) cũng dùng
   title "E-Commerce Seller" và description "Seller dashboard". Với một trang sản phẩm public, đây
   là title sai hoàn toàn cho SEO và cho tab browser.

2. **Không có metadata động.** Trang sản phẩm nên có title là tên sản phẩm.

**Cách sửa — metadata tĩnh cho từng group:**

```tsx
// app/(store)/layout.tsx
export const metadata: Metadata = {
  title: { default: 'SHOP', template: '%s | SHOP' },
  description: 'Mua sắm trực tuyến với hàng nghìn sản phẩm.',
}
```

`template: '%s | SHOP'` nghĩa là mọi page con chỉ cần khai báo phần riêng, Next.js tự nối:
`generateMetadata` trả `'Áo thun trắng'` → title thật là `'Áo thun trắng | SHOP'`.

**Metadata động cho trang sản phẩm:**

```tsx
// app/(store)/products/[id]/page.tsx
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const product = await apiFetch<Product>(`/product/${id}`)
    return {
      title: product.product_name,
      description: product.product_description ?? `${product.product_name} — ${product.product_type}`,
      openGraph: {
        title: product.product_name,
        images: product.product_thumb ? [{ url: product.product_thumb }] : [],
      },
    }
  } catch {
    return { title: 'Không tìm thấy sản phẩm' }
  }
}
```

**Câu hỏi quan trọng: `generateMetadata` và `page` cùng fetch `/product/${id}` — có gọi API hai lần?**

**Không.** Next.js **memoize** các `fetch` giống nhau trong cùng một request. Cả hai chia sẻ một
response. Đây chính là cơ chế mà file `10` sẽ giải thích chi tiết.

Nhưng có một điều kiện: `apiFetch` hiện đặt `cache: 'no-store'` mặc định — điều này ảnh hưởng tới
memoization. Xem file `10-data-fetching-caching.md` để hiểu chính xác cái gì được dedupe và cái gì không.

**Thêm `metadataBase` cho Open Graph:**

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  // ...
}
```

Không có nó, các URL tương đối trong `openGraph.images` sẽ không hợp lệ khi share link.

---

## 10. Trade-offs

| Lợi ích của App Router | Cái giá |
| --- | --- |
| Layout lồng nhau giữ state, chỉ page được fetch lại | Layout không nhận `searchParams` và không re-render → dễ có dữ liệu cũ (bug badge giỏ hàng) |
| Route group tách layout mà không đổi URL | Thêm một tầng thư mục; hai group không được cùng sở hữu một URL |
| `params`/`searchParams` async → cho phép partial prerendering | Phải `await`; `await` sai chỗ thì mất luôn lợi ích |
| Convention rõ ràng (`loading`, `error`, `not-found`) | Nhiều file để nhớ; thiếu chúng thì âm thầm mất UX (như repo hiện tại) |
| `<Link>` prefetch tự động | Prefetch tốn băng thông; cần tắt bằng `prefetch={false}` cho link ít dùng |
| `redirect()` khai báo, dùng được từ server | Nó **throw** — gọi trong try/catch là bug im lặng |

---

## 11. Best Practices

1. **Dùng route group cho mỗi "vùng" UI có layout riêng.** Đừng bao giờ viết layout với
   `if (pathname.startsWith(...))`.
2. **Coi mọi giá trị từ `searchParams` là input của người dùng.** Whitelist (`tab`), encode
   (`encodeURIComponent`), và validate redirect target.
3. **Sửa lỗ open redirect ở `login/page.tsx` + `loginAction`.** Đây là vấn đề bảo mật cụ thể nhất
   tìm thấy trong repo.
4. **Gọi `notFound()` thay vì render "Not found" inline.** Bạn được HTTP 404 đúng, SEO đúng, và
   TypeScript narrowing miễn phí.
5. **Luôn gọi `redirect()`/`notFound()` ngoài `try/catch`.**
6. **Thêm `loading.tsx` cho mọi route có fetch.** Đầu tư nhỏ, cải thiện UX rõ rệt.
7. **Metadata theo group, dùng `template` để nối.** Đừng để cả storefront mang title "Seller dashboard".
8. **Khi Server Action đổi dữ liệu mà layout hiển thị, nhớ revalidate cả layout.**

---

## Tự kiểm tra

1. Vì sao `(seller)/seller/page.tsx` cho ra URL `/seller` mà không phải `/seller/seller`?
2. Nếu không có route group, layout root phải làm gì? Kể ba vấn đề của cách đó.
3. Vì sao `params` là Promise? Điều đó cho phép Next.js làm gì?
4. Vì sao badge giỏ hàng trong `StoreHeader` không cập nhật sau "Add to cart"?
5. Chỉ ra lỗ open redirect trong repo và cách sửa.
6. `redirect()` hoạt động bằng cơ chế gì? Vì sao gọi nó trong `try/catch` là bug?
7. Vì sao `notFound()` cho bạn TypeScript narrowing miễn phí?

➡️ Tiếp theo: `10-data-fetching-caching.md`
