# 11 — Routing nâng cao: Layout, Route Group, Parallel & Intercepting Routes, Route Handlers, Metadata

> File 09 nói về **đọc** URL và **điều hướng**. File này nói về **cấu trúc** route: thư mục và file đặc biệt quyết định UI nào được giữ, UI nào render lại, và trang của bạn trông thế nào với Google/Facebook.

---

## 1. Overview — Tổng quan

Trong App Router, **thư mục là route**, còn **file đặc biệt là vai trò**:

| File | Vai trò | Repo đang có? |
| --- | --- | --- |
| `page.tsx` | Nội dung của route — làm route truy cập được | ✅ |
| `layout.tsx` | Khung bọc, **giữ nguyên** khi điều hướng giữa các trang con | ✅ |
| `template.tsx` | Khung bọc, **mount lại** mỗi lần điều hướng | ❌ |
| `loading.tsx` | Fallback Suspense cho route (file 08) | ❌ |
| `error.tsx` | Error Boundary cho route (file 09) | ❌ |
| `not-found.tsx` / `forbidden.tsx` / `unauthorized.tsx` | UI cho `notFound()` / `forbidden()` / `unauthorized()` | ❌ |
| `route.ts` | Endpoint HTTP (Route Handler) — không có UI | ❌ |
| `default.tsx` | Fallback cho slot của parallel route | ❌ |
| `opengraph-image.tsx`, `sitemap.ts`, `robots.ts` | Metadata dạng file | ❌ |

Còn **tên thư mục** mang ý nghĩa đặc biệt:

| Thư mục | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| `[id]` | Đoạn động | `/products/[id]` |
| `[...slug]` | Bắt mọi đoạn phía sau (ít nhất 1) | `/docs/a/b/c` |
| `[[...slug]]` | Như trên, nhưng cả 0 đoạn | `/shop` và `/shop/a/b` |
| `(group)` | **Route group** — tổ chức code, **không xuất hiện trong URL** | `(store)`, `(seller)`, `(auth)` |
| `@slot` | **Parallel route** — một "khe" render song song | `@modal` |
| `(.)x`, `(..)x`, `(...)x` | **Intercepting route** — chặn điều hướng, hiện route khác tại chỗ | `(.)products/[id]` |
| `_folder` | Thư mục riêng tư, không thành route | `_components` |

---

## 2. Layout vs Template

### 🧠 Mô hình tư duy: khung tranh và tờ giấy

> **Layout** là khung tranh: bạn thay bức tranh bên trong (`page`), khung vẫn ở đó — **state, scroll, input của nó được giữ**.
> **Template** là tờ giấy bọc: mỗi lần thay tranh, tờ giấy cũng được **thay mới**.

```
 Điều hướng /seller/products → /seller/discounts

 app/(seller)/seller/layout.tsx  (SellerSidebar)   ← KHÔNG render lại, giữ state, giữ scroll
   └─ page.tsx                                      ← thay mới
```

Đây là lý do [app/(seller)/seller/layout.tsx](<../../app/(seller)/seller/layout.tsx>) là chỗ đúng cho sidebar: chuyển trang không làm sidebar nhấp nháy hay mất trạng thái thu gọn.

### ⚠️ Hệ quả: layout **không biết** route con đang là gì

Layout không nhận `searchParams` và không render lại khi bạn chuyển giữa các trang con. Đừng đọc dữ liệu "theo trang" trong layout. Cần biết route con để tô sáng menu → Client Component với `usePathname()` / `useSelectedLayoutSegment()` (file 09).

### Khi nào dùng template?

Khi bạn **muốn** mount lại mỗi lần điều hướng:
- Hiệu ứng vào trang (enter animation) chạy lại mỗi trang.
- Effect cần chạy lại mỗi trang (ghi log page view trong một khu vực).
- Reset state của một form/khung dùng chung giữa các trang con.

Hiếm khi cần. **Mặc định dùng layout.**

---

## 3. Route Groups — repo đang dùng

```
app/
├─ layout.tsx              ← root layout: <html>, font, <Toaster>
├─ (auth)/layout.tsx       ← khung căn giữa cho login/signup
│  ├─ login/page.tsx            → /login
│  └─ signup/page.tsx           → /signup
├─ (store)/layout.tsx      ← header đỏ + footer của cửa hàng
│  ├─ page.tsx                  → /
│  └─ products/[id]/page.tsx    → /products/123
└─ (seller)/seller/layout.tsx ← sidebar seller
   └─ products/page.tsx         → /seller/products
```

### Là gì & tại sao?

`(store)` không thêm gì vào URL — `/products/123`, không phải `/store/products/123`. Route group tồn tại để **cho các trang cùng cấp URL dùng layout khác nhau**. `/login` và `/` đều ở cấp gốc, nhưng một cái có header cửa hàng, một cái không.

Công dụng khác:
- **Gom code theo khu vực** (team cửa hàng / team seller).
- **Gắn `loading.tsx`/`error.tsx` cho cả một nhóm** mà không ảnh hưởng nhóm khác.
- **Nhiều root layout**: nếu mỗi group có `layout.tsx` riêng chứa `<html>` (và bỏ root layout), mỗi khu vực có thể có `<html lang>`, font, theme riêng. Đánh đổi: điều hướng **giữa** hai root layout là **tải lại toàn trang**.

### ⚠️ Cạm bẫy

- Hai group không được chứa cùng một đường dẫn: `(store)/about/page.tsx` và `(auth)/about/page.tsx` → lỗi xung đột.
- Repo đặt `seller/` **bên trong** `(seller)` → URL có `/seller`. Group chỉ dùng để gán layout; thư mục `seller` mới tạo đoạn URL. Đây là cách làm đúng khi muốn khu vực có tiền tố URL riêng mà vẫn tách layout.

---

## 4. Parallel Routes (`@slot`)

### Là gì?

Cho một layout render **nhiều trang độc lập cùng lúc**, mỗi trang có loading/error riêng:

```
app/(seller)/seller/
├─ layout.tsx          ← nhận props: children, revenue, orders
├─ page.tsx            ← children
├─ @revenue/page.tsx   ← biểu đồ doanh thu
└─ @orders/page.tsx    ← đơn hàng mới
```

```tsx
export default function SellerLayout({ children, revenue, orders }: {
  children: React.ReactNode
  revenue: React.ReactNode
  orders: React.ReactNode
}) {
  return (
    <>
      {children}
      <div className="grid grid-cols-2 gap-4">
        {revenue}   {/* có loading.tsx/error.tsx riêng — chậm hay lỗi không kéo theo orders */}
        {orders}
      </div>
    </>
  )
}
```

### `default.tsx` — bắt buộc phải hiểu

Khi bạn tải thẳng một URL (F5) mà slot không có trang khớp, Next cần biết render gì cho slot đó. Không có `default.tsx` → **404 cả trang**. Luôn thêm:

```tsx
// @revenue/default.tsx
export default function Default() {
  return null
}
```

### Khi nào dùng / không dùng

- ✅ Dashboard với các khối độc lập cần loading/error riêng **và** có thể điều hướng con riêng.
- ✅ Kết hợp intercepting route để làm modal (mục 5) — công dụng phổ biến nhất.
- ❌ Chỉ để chia khối hiển thị → dùng component + `<Suspense>` là đủ, đơn giản hơn nhiều.

---

## 5. Intercepting Routes — modal có URL riêng

### Vấn đề

Ở trang danh sách, bấm vào sản phẩm → muốn hiện **modal xem nhanh** (giữ danh sách phía sau). Nhưng:
- URL phải đổi thành `/products/123` để chia sẻ được.
- F5 hoặc mở link trực tiếp → phải hiện **trang chi tiết đầy đủ**, không phải modal.
- Bấm Back → đóng modal, không rời trang danh sách.

Làm bằng `useState` thì mất URL. Làm bằng điều hướng thường thì mất danh sách.

### Giải pháp: `@modal` + `(.)`

```
app/(store)/
├─ layout.tsx                    ← render {children} và {modal}
├─ page.tsx                      ← danh sách sản phẩm
├─ products/[id]/page.tsx        ← trang chi tiết đầy đủ (khi F5 / mở link)
└─ @modal/
   ├─ default.tsx                ← return null (không có modal)
   └─ (.)products/[id]/page.tsx  ← modal xem nhanh (khi click từ trong app)
```

```tsx
// app/(store)/@modal/(.)products/[id]/page.tsx
import { QuickViewDialog } from '@/components/store/quick-view-dialog'

export default async function QuickView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getProduct(id)
  return <QuickViewDialog detail={detail} />
}
```

```tsx
// components/store/quick-view-dialog.tsx
'use client'
import { useRouter } from 'next/navigation'

export function QuickViewDialog({ detail }: { detail: ProductDetail }) {
  const router = useRouter()
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}> {/* đóng = Back */}
      {/* ... */}
    </Dialog>
  )
}
```

### 🧠 Cách đọc ký hiệu

| Ký hiệu | Chặn route ở… |
| --- | --- |
| `(.)` | cùng cấp |
| `(..)` | lên một cấp |
| `(..)(..)` | lên hai cấp |
| `(...)` | từ gốc `app` |

⚠️ Tính theo **đoạn URL**, không theo thư mục: route group `(store)` và slot `@modal` **không** được tính là một cấp.

### Trade-offs

| Benefits | Costs |
| --- | --- |
| Modal có URL thật, chia sẻ/Back/F5 hoạt động đúng | Hai trang cho cùng một nội dung (modal + đầy đủ) → phải chia sẻ component |
| Danh sách phía sau giữ nguyên state, scroll | Cấu trúc thư mục khó đọc với người mới |
| | Dễ quên `default.tsx` → 404 khó hiểu |

---

## 6. Route Handlers (`route.ts`)

### Là gì?

Endpoint HTTP thuần trong `app/`, dùng Web API `Request`/`Response`:

```ts
// app/api/webhooks/payment/route.ts
import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const signature = request.headers.get('x-signature')
  const body = await request.text()
  if (!verifySignature(body, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }
  const event = JSON.parse(body)
  // ... cập nhật trạng thái đơn
  revalidateTag(`order-${event.orderId}`, 'max')
  return Response.json({ received: true })
}
```

### Route Handler vs Server Action — chọn thế nào?

| | Server Action | Route Handler |
| --- | --- | --- |
| Ai gọi | UI của chính app | Bất kỳ ai: webhook, mobile, bên thứ ba, `<img src>` |
| URL | Ẩn, đổi theo build | Ổn định, do bạn đặt |
| Method | Chỉ POST | GET, POST, PUT, PATCH, DELETE… |
| Trả về | Giá trị JS + UI mới (RSC) | `Response` bất kỳ: JSON, file, stream, redirect |
| Cache | Không | GET có thể cache (mặc định **không** từ Next 15) |

### ⚠️ Anti-pattern: Server Component gọi Route Handler của chính mình

```tsx
// ❌ Thêm một vòng HTTP vô ích từ server tới chính server
const res = await fetch('http://localhost:3000/api/products')

// ✅ Gọi thẳng hàm lấy dữ liệu
const products = await getProducts()
```

Repo này đã có backend Node riêng, nên Route Handler chỉ cần cho những gì **phải** nằm ở tầng Next: webhook cần `revalidateTag`, proxy file download có kèm cookie, endpoint cho `<img>` được tạo động…

---

## 7. Metadata API — SEO và chia sẻ mạng xã hội

### Tĩnh và động

```tsx
// app/layout.tsx — tĩnh, với title template
export const metadata: Metadata = {
  title: { template: '%s | Shop', default: 'Shop' }, // trang con đặt title → "Áo thun | Shop"
  description: 'Mua sắm từ các shop đã xác minh',
}
```

```tsx
// app/(store)/products/[id]/page.tsx — động theo dữ liệu
import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params
  const { spu } = await getProduct(id) // dùng chung hàm với page — xem cache() ở file 12
  return {
    title: spu.product_name,
    description: spu.product_description?.slice(0, 160),
    openGraph: { images: [spu.product_thumb] },
  }
}
```

> Repo hiện: [app/layout.tsx](../../app/layout.tsx) có `title: "E-Commerce Seller"`, `description: "Seller dashboard"` cho **cả site** — kể cả trang cửa hàng công khai. Trang sản phẩm chưa có `generateMetadata`, nên chia sẻ link sản phẩm lên mạng xã hội sẽ hiện "E-Commerce Seller". Đây là cải thiện SEO dễ nhất.

### ⚠️ `generateMetadata` và page gọi cùng API → gọi 2 lần?

Có thể — nếu hàm lấy dữ liệu không được memo. Bọc nó bằng `cache()` của React để cả hai dùng chung một kết quả trong cùng request. Chi tiết ở [file 12](./12-security-and-data-access.md).

### Metadata dạng file

| File | Tạo ra |
| --- | --- |
| `opengraph-image.tsx` | Ảnh OG sinh động bằng JSX (`ImageResponse` từ `next/og`) |
| `sitemap.ts` | `/sitemap.xml` — có thể sinh từ danh sách sản phẩm |
| `robots.ts` | `/robots.txt` — chặn `/seller`, `/cart` khỏi index |
| `icon.png`, `apple-icon.png` | Favicon |

```ts
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/seller', '/cart', '/checkout', '/orders'] },
    sitemap: 'https://shop.example.com/sitemap.xml',
  }
}
```

### JSON-LD cho rich result (giá, sao đánh giá trên Google)

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: spu.product_name,
      // product_price là Decimal128 dạng JSON → chuẩn hoá bằng helper sẵn có của repo
      offers: { '@type': 'Offer', price: toPriceNumber(spu.product_price), priceCurrency: 'VND' },
    }).replace(/</g, '\\u003c'), // ✅ chống XSS khi dữ liệu chứa "</script>"
  }}
/>
```

---

## 8. Best Practices

1. ✅ **Thứ không đổi khi chuyển trang con → layout.** Thứ cần mount lại → template (hiếm).
2. ✅ **Route group để gán layout và loading/error theo khu vực**, như repo đang làm.
3. ✅ **Thử `<Suspense>` trước khi dùng parallel route.** Parallel route chỉ đáng giá khi các khối cần điều hướng con độc lập hoặc làm modal.
4. ✅ **Mọi slot `@x` đều có `default.tsx`.**
5. ✅ **Modal cần URL → intercepting + parallel route**; modal không cần URL → `useState` là đủ.
6. ✅ **Route Handler cho người gọi bên ngoài, Server Action cho UI của mình.** Không gọi Route Handler của chính mình từ Server Component.
7. ✅ **Mỗi trang công khai có `title` + `description` riêng**; trang riêng tư chặn bằng `robots.ts`.

---

**Trước:** [10 — Cheatsheet](./10-decision-cheatsheet.md) · **Tiếp theo:** [12 — Bảo mật & Data Access](./12-security-and-data-access.md)
