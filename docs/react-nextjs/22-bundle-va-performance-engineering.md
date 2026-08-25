# 22. Bundle & Performance Engineering

> **Mục tiêu:** biết **đo** cái gì thực sự đi xuống browser, tìm được nguyên nhân thật của bundle lớn,
> và có một danh sách ưu tiên dựa trên số liệu — không phải cảm giác.

---

## 1. Overview

### Nguyên tắc mở đầu: bạn không thể tối ưu cái bạn không đo

Mọi chương trước đã nói về **kiến trúc** (Server Components, `'use client'` ở lá). Chương này về
**xác minh**: kiến trúc đó có thực sự cho ra bundle nhỏ không, và nếu không thì tại sao.

Ba câu hỏi cần trả lời bằng số:

1. **Bao nhiêu KB JavaScript** đi xuống cho mỗi route?
2. **Cái gì** chiếm phần lớn số KB đó?
3. **Chỉ số nào** thực sự tệ (LCP? INP? TTFB?)

Không có ba con số này, mọi "tối ưu" chỉ là đoán.

---

## 2. Mental Model

### 🧠 Bundle như hành lý theo từng chuyến bay

Mỗi route là một chuyến bay. Có hai loại hành lý:

- **Shared chunk** — hành lý đi cùng **mọi** chuyến (React runtime, router, layout dùng chung).
  Trả một lần, cache cho mọi route sau.
- **Route chunk** — hành lý riêng của chuyến này (component chỉ trang này dùng).

Tối ưu bundle là hai việc khác nhau:

| Mục tiêu | Cách làm |
| --- | --- |
| Giảm **shared** chunk | Đưa thứ dùng-một-chỗ ra khỏi layout/shared module |
| Giảm **route** chunk | Code split (`next/dynamic`), hoặc chuyển sang Server Component |

**Giảm shared quan trọng hơn**, vì nó ảnh hưởng lần tải đầu của **mọi** trang — và lần tải đầu là lúc
người dùng quyết định ở lại hay đóng tab.

---

## 3. Đo: ba công cụ theo thứ tự dùng

### Bước 1 — `next build` output (miễn phí, luôn có)

```bash
pnpm build
```

Bạn nhận được một bảng như:

```
Route (app)                              Size     First Load JS
┌ ƒ /                                    2.1 kB          105 kB
├ ƒ /cart                                1.8 kB          104 kB
├ ƒ /checkout                            4.3 kB          112 kB
├ ƒ /orders                              1.2 kB          103 kB
├ ƒ /orders/[id]                         1.4 kB          104 kB
├ ƒ /products/[id]                       3.6 kB          110 kB
├ ƒ /seller                              1.1 kB          103 kB
└ ƒ /seller/products/new                 5.2 kB          118 kB
+ First Load JS shared by all            102 kB
  ├ chunks/framework-xxx.js               45 kB
  ├ chunks/main-xxx.js                    32 kB
  └ chunks/webpack-xxx.js                 25 kB

ƒ  (Dynamic)  server-rendered on demand
```

**Cách đọc bảng này:**

| Cột | Nghĩa | Ngưỡng cần chú ý |
| --- | --- | --- |
| **Size** | JS **riêng** của route | > 30 kB → xem xét |
| **First Load JS** | Tổng người dùng tải khi vào route này lần đầu | > 200 kB → có vấn đề |
| **shared by all** | Chunk chung | > 150 kB → tìm nguyên nhân |

**Ký hiệu `ƒ` vs `○` rất quan trọng:**

- `ƒ (Dynamic)` — render mỗi request
- `○ (Static)` — prerender tại build time, phục vụ từ CDN

📄 **Với repo này, dự đoán: MỌI route là `ƒ`.** Lý do đã phân tích ở file `10`: `apiFetch` mặc định
`cache: 'no-store'`, và `(store)/layout.tsx` → `StoreHeader` → `getAccessPayload()` → `cookies()`.

**Hãy chạy `pnpm build` và kiểm tra.** Nếu bạn thấy route nào `○`, đó là thông tin có giá trị (nghĩa
là nhánh đó không chạm dynamic API).

### Bước 2 — Bundle Analyzer (khi cần biết *cái gì* nặng)

```bash
pnpm add -D @next/bundle-analyzer
```

```tsx
// next.config.ts
import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // The repo has multiple lockfiles (backend + frontend) — pin the workspace root to this app directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default withBundleAnalyzer(nextConfig)
```

```bash
ANALYZE=true pnpm build
```

Mở ra một treemap tương tác. **Cách đọc nó:**

1. Tìm **hình chữ nhật lớn nhất** — đó là nguyên nhân chính
2. Hỏi: *"cái này có cần ở client không?"* Nếu không → chuyển sang Server Component
3. Hỏi: *"cái này có cần ở lần tải đầu không?"* Nếu không → `next/dynamic`
4. Hỏi: *"tôi có dùng hết nó không?"* Nếu không → tree shaking bị chặn ở đâu đó

### Bước 3 — Lighthouse / Web Vitals thật

```bash
pnpm build && pnpm start
# Chrome DevTools → Lighthouse → Analyze page load
```

⚠️ **Không bao giờ đo ở `pnpm dev`** — nhắc lại từ file `13`: không minify, có dev warning,
StrictMode double-invoke.

**Và Lighthouse local chỉ là bước đầu.** Nó đo trên máy bạn, mạng bạn. Số liệu thật là **field data**
từ người dùng thật — mục 8 sẽ nói về việc thu thập nó.

---

## 4. ⭐ Barrel files — nguyên nhân bundle lớn phổ biến nhất

### Vấn đề

**Barrel file** là một `index.ts` re-export mọi thứ:

```tsx
// ❌ components/ui/index.ts
export * from './button'
export * from './card'
export * from './input'
export * from './select'      // ← kéo theo @base-ui/react/select
export * from './table'
export * from './avatar'
export * from './tabs'
export * from './sonner'      // ← kéo theo sonner + next-themes
```

Rồi bạn dùng:

```tsx
import { Button } from '@/components/ui'
```

**Chuyện gì xảy ra:** bundler phải **phân tích toàn bộ** `index.ts` để biết `Button` ở đâu. Với ESM và
tree shaking hoàn hảo, nó sẽ loại bỏ phần không dùng. Nhưng trong thực tế:

- Nếu **bất kỳ** module nào trong barrel có side-effect (hoặc bundler không chứng minh được là không),
  nó **không thể** bị loại bỏ
- Thời gian build tăng — bundler phải đi qua cả cây phụ thuộc
- Một `import { Button }` có thể kéo theo `sonner`, `next-themes`, `@base-ui/react/select`

### ✅ Repo này KHÔNG có barrel file nào

```bash
$ find app components lib types actions -name "index.ts" -o -name "index.tsx"
# (không có kết quả)
```

Mọi import đều trực tiếp:

```tsx
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

**Đây là một quyết định kiến trúc tốt và có ý thức.** Dài dòng hơn một chút, nhưng bundler biết chính
xác cần gì.

> **Nguyên tắc:** đừng tạo barrel file cho component. Nếu bạn thấy `import { X } from '@/components/ui'`
> trong một PR, hãy hỏi vì sao.

### `optimizePackageImports` — khi barrel nằm trong dependency

Bạn không kiểm soát được barrel của thư viện bên thứ ba. `lucide-react`, `date-fns`, `lodash-es`,
`@mui/icons-material` đều là barrel khổng lồ.

📄 Repo dùng `lucide-react` ở 8 file:

```tsx
// components/seller/nav-items.ts
import { LayoutDashboard, Package, Tag, User, type LucideIcon } from 'lucide-react'
// components/store/store-header.tsx
import { ShoppingCart, Store, Package } from 'lucide-react'
// components/ui/sonner.tsx
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
// ... 5 file nữa
```

`lucide-react` có **hơn 1.500 icon**. Nếu tree shaking không hoạt động, bạn tải cả 1.500.

Next.js có sẵn cách xử lý:

```tsx
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};
```

Nó tự động viết lại `import { Package } from 'lucide-react'` thành import trực tiếp tới file icon đó —
bỏ qua barrel hoàn toàn.

⚠️ **Nhưng hãy kiểm tra trước khi thêm.** Next.js đã tối ưu sẵn một số package phổ biến
(`lucide-react` thường nằm trong danh sách mặc định). Cách xác minh:

```bash
# Đo trước
pnpm build 2>&1 | grep -A3 "First Load JS shared"

# Thêm optimizePackageImports, build lại, so sánh
ANALYZE=true pnpm build
# Trong treemap: lucide-react nên hiện ra vài KB, không phải vài trăm KB
```

**Nếu số không đổi → nó đã được tối ưu sẵn, đừng thêm config vô ích.**

### 📄 Quan sát quan trọng về icon trong repo này

Nhìn lại bảng: trong 8 file dùng `lucide-react`, chỉ **3 file là Client Component**:

| File | Loại | Icon |
| --- | --- | --- |
| `nav-items.ts` | server (nhưng import bởi client) | 4 icon → **vào client bundle** |
| `seller-sidebar.tsx` | **CLIENT** | `ChevronLeft` → client bundle |
| `seller-mobile-nav.tsx` | **CLIENT** | `ChevronLeft`, `Menu`, `X` → client bundle |
| `ui/select.tsx` | **CLIENT** | 3 icon → client bundle |
| `ui/sonner.tsx` | **CLIENT** | 5 icon → client bundle |
| `store-header.tsx` | server | 3 icon → **HTML, 0 byte JS** |
| `seller/page.tsx` | server | 3 icon → **HTML, 0 byte JS** |
| `orders/[id]/page.tsx` | server | `ArrowLeft` → **HTML, 0 byte JS** |

**Icon trong Server Component được render thành SVG inline trong HTML — không có JavaScript nào.**
Đây là lợi ích cụ thể, đo được của kiến trúc RSC (file `08`).

Tổng icon thực sự vào client bundle: khoảng **13 icon** (bao gồm cả `nav-items.ts` vì nó bị import bởi
`seller-sidebar` và `seller-mobile-nav`). Đó là vài KB, không phải vài trăm KB.

---

## 5. `next/dynamic` — code splitting có chủ đích

### Repo hiện chưa dùng, và phần lớn là đúng

Các Client Component đều nhỏ (file `04`: cái lớn nhất ~40 node DOM). Code split một component 2KB là
vô nghĩa — bạn thêm một round-trip mạng để tiết kiệm 2KB.

### Khi nào `next/dynamic` thực sự đáng

**Điều kiện: component nặng (>30KB) VÀ không cần ở lần render đầu.**

```tsx
// Ví dụ: modal xem nhanh sản phẩm (file 19) chỉ mở khi người dùng bấm
import dynamic from 'next/dynamic'

const RouteModal = dynamic(
  () => import('@/components/store/route-modal').then((m) => m.RouteModal),
  { ssr: false },     // modal không cần SSR — nó chỉ xuất hiện sau tương tác
)
```

**Ba ca dùng chính đáng trong tương lai của repo:**

| Component | Vì sao dynamic | Ước tính |
| --- | --- | --- |
| Chart doanh thu (nếu thêm) | `recharts`/`d3` rất nặng, chỉ hiện ở một trang | 80–150 KB |
| Rich text editor cho mô tả sản phẩm | Chỉ dùng ở `/seller/products/new` và `/edit` | 100–300 KB |
| Bản đồ chọn địa chỉ giao hàng | Chỉ ở step 2 của checkout | 100+ KB |

```tsx
// Ví dụ đầy đủ với chart
import dynamic from 'next/dynamic'

const RevenueChart = dynamic(() => import('@/components/seller/revenue-chart'), {
  ssr: false,
  // Skeleton khớp kích thước → CLS = 0 (file 13)
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />,
})
```

### ⚠️ Ba cạm bẫy của `next/dynamic`

**(1) `ssr: false` nghĩa là không có HTML.** Người dùng thấy `loading` fallback, rồi nội dung xuất
hiện sau khi JS tải. Với nội dung quan trọng cho SEO, đây là lựa chọn **sai**.

**(2) Nó thêm một round-trip.** Component chỉ bắt đầu tải khi React render tới nó. Với component
người dùng chắc chắn sẽ thấy, bạn vừa làm chậm nó đi.

**(3) Nhiều dynamic import nhỏ tệ hơn một bundle vừa.** Mỗi chunk là một request HTTP. 20 chunk × 2KB
chậm hơn 1 chunk × 40KB.

> **Ngưỡng thực dụng:** `next/dynamic` khi component **>30KB** và **không hiện ở lần render đầu**.
> Dưới ngưỡng đó, để nó trong bundle chính.

---

## 6. Font — repo đã làm đúng

📄 `app/layout.tsx`:

```tsx
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
```

**`next/font` làm bốn việc quan trọng, tự động:**

| Việc | Lợi ích |
| --- | --- |
| **Self-host** font (tải về lúc build) | Không request tới `fonts.gstatic.com` → không DNS lookup, không kết nối thứ ba |
| **Preload** file font | Font tải song song với CSS, không chờ |
| **`font-display: swap`** | Text hiện ngay bằng font hệ thống, đổi sang font thật khi tải xong |
| **Tính size-adjust** để giảm layout shift | CLS gần 0 khi font đổi |

Nếu dùng `<link href="https://fonts.googleapis.com/...">` thủ công, bạn mất cả bốn — và thêm một
request tới domain khác (DNS + TLS handshake, ~100-300ms).

⚠️ **Một vấn đề nhỏ với repo:** `subsets: ["latin"]` — nếu app hỗ trợ tiếng Việt, bạn cần
`latin-ext` cho các ký tự có dấu (ă, ơ, ư, đ...):

```tsx
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],     // ← thêm cho tiếng Việt
  display: 'swap',
});
```

Không có `latin-ext`, browser sẽ **fallback sang font hệ thống** cho các ký tự có dấu → chữ trong một
câu hiện hai font khác nhau. Rất dễ nhận ra khi biết để ý.

---

## 7. Server-side performance — thường quan trọng hơn bundle

Với repo này (mọi route dynamic, mọi fetch `no-store`), **TTFB bị quyết định hoàn toàn bởi backend**.
Bundle 100KB tải trong 200ms; nhưng nếu server mất 800ms để phản hồi, tối ưu bundle là tối ưu chỗ sai.

### Đo waterfall thật

Thêm timing tạm vào `apiFetch`:

```tsx
// lib/api/server-client.ts — TẠM THỜI để đo
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const t0 = performance.now()
  try {
    // ...phần fetch hiện tại...
    return unwrap<T>(res)
  } finally {
    const ms = Math.round(performance.now() - t0)
    console.log(`[apiFetch] ${(opts.method ?? 'GET').padEnd(6)} ${path.padEnd(50)} ${ms}ms`)
  }
}
```

Chạy `pnpm build && pnpm start`, mở `/products/abc123`, xem terminal:

```
[apiFetch] GET    /cart                                              142ms
[apiFetch] GET    /product/abc123                                    156ms
[apiFetch] GET    /comment?productId=abc123                          148ms
```

**Đọc kết quả này:**

- Ba request, tổng 446ms
- `/cart` từ `StoreHeader` (trong layout), hai cái sau từ page
- `/product` và `/comment` chạy **tuần tự** → 304ms lẽ ra chỉ cần 156ms

📄 Đây chính là waterfall đã phân tích ở file `06` và `10`, giờ có số:

```tsx
// app/(store)/products/[id]/page.tsx — hiện tại
product = await apiFetch<Product>(`/product/${id}`)          // 156ms
// ...
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)  // +148ms = 304ms
```

### Bảng ưu tiên server-side cho repo

| Vấn đề | Tiết kiệm | Công sức | Chương |
| --- | --- | --- | --- |
| Waterfall product+comments | ~150ms mỗi lượt xem sản phẩm | 30 phút | `06` |
| `/product` không cache | ~150ms → ~5ms (cache hit) | 2 giờ | `10` |
| `/cart` fetch trong layout mọi trang | ~142ms mỗi trang | 1 giờ (Suspense) | `10` |
| `getAccessPayload` không `cache()` | ~0ms (chỉ tính nhất quán) | 15 phút | `10` |

**Chú ý dòng thứ ba.** `StoreHeader` fetch `/cart` trên **mọi** trang của storefront — kể cả trang
danh mục nơi người dùng chỉ muốn xem sản phẩm. 142ms cộng vào TTFB của mọi trang.

Cách sửa (từ file `10`): tách phần per-user ra một component riêng trong `<Suspense>`:

```tsx
// app/(store)/layout.tsx
<StoreHeaderShell>
  <Suspense fallback={<HeaderUserSkeleton />}>
    <StoreHeaderUser />     {/* ← chỉ component này fetch /cart và gọi cookies() */}
  </Suspense>
</StoreHeaderShell>
```

Giờ TTFB không chờ `/cart`; badge giỏ hàng stream xuống sau.

---

## 8. Web Vitals thật từ người dùng

Lighthouse local là **lab data** — một máy, một mạng, một lần. Người dùng thật ở trên mạng 3G,
điện thoại 4 năm tuổi, và có 30 tab khác đang mở.

```tsx
// components/web-vitals.tsx
'use client'
import { useReportWebVitals } from 'next/web-vitals'

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Gửi lên endpoint của bạn. `keepalive` để request sống qua lúc unload trang.
    const body = JSON.stringify({
      name: metric.name,           // 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
      value: metric.value,
      rating: metric.rating,       // 'good' | 'needs-improvement' | 'poor'
      id: metric.id,
      pathname: window.location.pathname,
    })

    // sendBeacon là cách đúng — nó không bị hủy khi trang đóng
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/vitals', body)
    } else {
      fetch('/api/vitals', { body, method: 'POST', keepalive: true })
    }
  })
  return null
}
```

```tsx
// app/api/vitals/route.ts
export const runtime = 'edge'      // cực nhẹ, chỉ ghi log

export async function POST(request: Request) {
  const metric = await request.json()
  // Gửi vào hệ thống analytics của bạn.
  // Ở đây chỉ log — production nên dùng một time-series store.
  console.log('[vitals]', metric.pathname, metric.name, Math.round(metric.value), metric.rating)
  return new Response(null, { status: 204 })
}
```

```tsx
// app/layout.tsx
<body className="min-h-full flex flex-col">
  {children}
  <Toaster richColors position="top-right" />
  <WebVitals />
</body>
```

**Ngưỡng "good" cần biết:**

| Chỉ số | Good | Needs improvement | Poor | Bị ảnh hưởng bởi |
| --- | --- | --- | --- | --- |
| **LCP** | ≤ 2.5s | 2.5–4.0s | > 4.0s | **Ảnh** (file `13`), TTFB, cache |
| **INP** | ≤ 200ms | 200–500ms | > 500ms | Kích thước JS, công việc trong handler |
| **CLS** | ≤ 0.1 | 0.1–0.25 | > 0.25 | **`width`/`height` ảnh**, skeleton, font |
| **FCP** | ≤ 1.8s | 1.8–3.0s | > 3.0s | TTFB, CSS blocking |
| **TTFB** | ≤ 800ms | 800–1800ms | > 1800ms | **Backend**, cache, streaming |

📄 **Dự đoán cho repo này, dựa trên phân tích các chương trước:**

| Chỉ số | Dự đoán | Nguyên nhân |
| --- | --- | --- |
| **CLS** | ⚠️ Kém | `<img>` không có `width`/`height` ở 9 chỗ (file `13`) |
| **LCP** | ⚠️ Kém | Ảnh sản phẩm không tối ưu, không `priority`, không WebP |
| **TTFB** | ⚠️ Trung bình | Mọi route dynamic + `no-store` + waterfall |
| **INP** | ✅ Tốt | Client bundle nhỏ, ít JS chạy khi tương tác |
| **FCP** | ✅ Khá | Phụ thuộc TTFB, nhưng HTML nhẹ |

**Đây là dự đoán, không phải số đo.** Hãy chạy Lighthouse để xác nhận trước khi làm gì.

---

## 9. Danh sách ưu tiên dựa trên tác động

Tổng hợp mọi phát hiện về hiệu năng từ toàn bộ 22 chương, xếp theo **tác động ÷ công sức**:

### 🔴 Tác động cao, công sức thấp

| # | Việc | Cải thiện | Công sức | Chương |
| --- | --- | --- | --- | --- |
| 1 | `next/image` cho `product-card.tsx` (ảnh LCP) | LCP + CLS lớn nhất | 1 giờ | `13` |
| 2 | Song song hoá `/product` + `/comment` | −150ms mỗi lượt xem | 30 phút | `06` |
| 3 | Thêm `latin-ext` vào font | Sửa lỗi font tiếng Việt | 5 phút | mục 6 |
| 4 | `loading.tsx` cho `/orders`, `/products/[id]` | Cảm giác phản hồi | 1 giờ | `06` |
| 5 | Chạy `pnpm build` và đọc bảng size | **Biết mình đang ở đâu** | 5 phút | mục 3 |

### 🟠 Tác động cao, công sức trung bình

| # | Việc | Cải thiện | Công sức | Chương |
| --- | --- | --- | --- | --- |
| 6 | `next/image` cho 8 chỗ còn lại | CLS toàn site | 2 giờ | `13` |
| 7 | Cache tag cho `/product` công khai | TTFB 150ms → 5ms | 2 giờ | `10` |
| 8 | Tách `/cart` fetch ra khỏi layout + Suspense | −142ms mọi trang store | 2 giờ | `10` |
| 9 | `useOptimistic` cho giỏ hàng | Cảm giác tức thì (INP perceived) | 3 giờ | `07` |
| 10 | Thêm `WebVitals` reporting | **Có số liệu thật** | 1 giờ | mục 8 |

### 🟡 Tác động thấp / phòng ngừa

| # | Việc | Vì sao vẫn nên | Chương |
| --- | --- | --- | --- |
| 11 | `cache()` cho `getAccessPayload` | Tính nhất quán, không phải tốc độ | `10` |
| 12 | Kiểm tra `optimizePackageImports` cho lucide | Có thể đã tối ưu sẵn — **đo trước** | mục 4 |
| 13 | Đưa `CommentSection` về Server Component | Giảm hydration | `08`, `13` |
| 14 | Giữ nguyên: không barrel file | Đã đúng, đừng phá | mục 4 |
| 15 | Giữ nguyên: không `next/dynamic` | Component đều nhỏ, không cần | mục 5 |

**Chú ý #5 nằm ở nhóm cao nhất:** *"chạy `pnpm build` và đọc bảng size"*. Nó không cải thiện gì, nhưng
nó là **điều kiện tiên quyết** cho mọi việc còn lại. Không có nó, bạn đang tối ưu theo cảm giác.

---

## 10. Ba sai lầm phổ biến trong tối ưu hiệu năng

### Sai lầm 1 — Tối ưu bundle khi vấn đề là TTFB

Với repo này, một trang mất 800ms để phản hồi vì backend + waterfall. Giảm bundle từ 105KB xuống
95KB tiết kiệm ~30ms trên 4G. **Tỷ lệ lợi ích: 4%.**

Sửa waterfall tiết kiệm 150ms. **Tỷ lệ: 19%.**

Bật cache cho `/product` tiết kiệm 145ms. **Tỷ lệ: 18%.**

**Luôn tìm chi phí lớn nhất trước.**

### Sai lầm 2 — Đo ở dev, hoặc đo một lần trên máy tốt

```bash
# ❌ Vô nghĩa
pnpm dev  # rồi mở Lighthouse

# ✅ Đúng
pnpm build && pnpm start
# + DevTools → Network: throttle "Fast 4G"
# + DevTools → Performance: CPU throttle 4x
# + Chạy 3 lần, lấy trung vị
```

CPU throttle 4x mô phỏng điện thoại phổ thông. Không có nó, bạn đang đo trải nghiệm của ~5% người dùng
giàu nhất.

### Sai lầm 3 — Tối ưu mà không đo lại

```
Trước tối ưu:  LCP 3.2s
Sau "tối ưu":   LCP 3.4s     ← tệ hơn, nhưng không ai kiểm tra
```

Việc này xảy ra thường xuyên hơn bạn nghĩ. Ví dụ: thêm `next/dynamic` cho một component nhỏ →
thêm round-trip → chậm hơn.

**Quy tắc:** ghi lại số **trước**, làm **một** thay đổi, đo **lại**. Nếu không cải thiện, revert.

---

## 11. Trade-offs

| Kỹ thuật | Lợi ích | Cái giá |
| --- | --- | --- |
| **Không barrel file** | Tree shaking đáng tin; build nhanh | Import dài dòng hơn |
| **`optimizePackageImports`** | Bỏ qua barrel của thư viện | `experimental` — có thể đổi giữa các bản |
| **`next/dynamic`** | Giảm bundle lần đầu | Thêm round-trip; `ssr: false` mất SEO; nhiều chunk nhỏ tệ hơn |
| **`next/font`** | Self-host, preload, giảm CLS | Tăng thời gian build; font nằm trong deployment |
| **Cache dữ liệu công khai** | TTFB giảm mạnh | Phải thiết kế invalidation (file `10`) |
| **Streaming + Suspense** | TTFB/FCP tốt hơn nhiều | Skeleton phải bảo trì; không đổi được HTTP status |
| **`next/image`** | LCP + CLS + băng thông | Cần `remotePatterns`; `sizes` sai thì mất lợi ích |
| **Web Vitals reporting** | Số liệu thật thay vì đoán | Thêm một endpoint; ~1KB JS; cần nơi lưu số liệu |

---

## 12. Best Practices

1. **Chạy `pnpm build` và đọc bảng size trước khi làm bất cứ gì.** Đây là bước 0.

2. **Đo TTFB trước bundle.** Với app dynamic + `no-store`, backend gần như luôn là chi phí lớn nhất.

3. **Không tạo barrel file cho component.** Repo đang đúng — giữ nguyên.

4. **Đo trước khi thêm `optimizePackageImports`.** Next.js có thể đã tối ưu package đó sẵn.

5. **`next/dynamic` chỉ khi >30KB VÀ không cần ở render đầu.** Dưới ngưỡng là làm chậm đi.

6. **`next/font` với đủ subset.** Thiếu `latin-ext` là lỗi thầm với tiếng Việt.

7. **Giữ icon trong Server Component khi có thể** — chúng thành SVG inline, 0 byte JS.

8. **Đo với CPU throttle 4x và mạng chậm.** Máy dev của bạn không đại diện cho người dùng.

9. **Thu thập Web Vitals thật.** Lab data cho hướng, field data cho sự thật.

10. **Một thay đổi, một lần đo.** Ghi số trước và sau. Không cải thiện → revert.

11. **Ưu tiên theo tác động ÷ công sức, không theo cái gì thú vị nhất.** `next/image` cho một file
    (#1) giá trị hơn code splitting toàn bộ app.

---

## Tự kiểm tra

1. Phân biệt "shared chunk" và "route chunk". Giảm cái nào quan trọng hơn? Vì sao?
2. Ký hiệu `ƒ` và `○` trong output của `next build` nghĩa là gì? Repo này dự đoán là gì? Vì sao?
3. Barrel file gây vấn đề gì cụ thể? Repo có không?
4. Trong 8 file dùng `lucide-react`, bao nhiêu icon thực sự vào client bundle? Vì sao số còn lại không?
5. Ngưỡng nào để `next/dynamic` đáng dùng? Kể ba cạm bẫy của nó.
6. `next/font` làm bốn việc gì tự động? Thiếu `latin-ext` gây triệu chứng gì?
7. Với repo này, tối ưu bundle 10KB hay sửa waterfall 150ms có tỷ lệ lợi ích cao hơn? Tính ra.
8. Lab data và field data khác nhau thế nào? Vì sao cần cả hai?
9. `sendBeacon` khác `fetch` ở điểm nào khi report vitals?
10. Ba sai lầm phổ biến trong tối ưu hiệu năng là gì?

➡️ Tiếp theo: `23-accessibility-engineering.md`
