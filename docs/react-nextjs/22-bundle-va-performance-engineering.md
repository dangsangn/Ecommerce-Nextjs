# 22. Bundle & Performance Engineering

> **Mục tiêu:** biết **đo** cái gì thực sự đi xuống browser, tìm được nguyên nhân thật của bundle lớn,
> và có một danh sách ưu tiên dựa trên số liệu — không phải cảm giác.

---

## 1. Overview

Các chương trước nói về **kiến trúc** (Server Components, `'use client'` ở lá). Chương này về
**xác minh**: kiến trúc đó có thực sự cho ra bundle nhỏ và trang nhanh không. Ba câu hỏi cần trả lời
bằng số:

1. **Bao nhiêu KB JavaScript** đi xuống cho mỗi route?
2. **Cái gì** chiếm phần lớn số KB đó?
3. **Chỉ số nào** thực sự tệ (LCP? INP? TTFB?)

Repo chạy **Next.js 16.2 + Turbopack** (mặc định cho cả `next dev` và `next build`) — điều này đổi
cách bạn đo bundle so với các tài liệu cũ dựa trên webpack.

---

## 2. Mental Model

### 🧠 Bundle như hành lý theo từng chuyến bay

Mỗi route là một chuyến bay. Có hai loại hành lý:

- **Shared chunk** — đi cùng **mọi** chuyến (React runtime, router, layout dùng chung). Trả một lần,
  cache cho mọi route sau.
- **Route chunk** — hành lý riêng của chuyến này (component chỉ trang này dùng).

| Mục tiêu | Cách làm |
| --- | --- |
| Giảm **shared** chunk | Đưa thứ dùng-một-chỗ ra khỏi layout/shared module |
| Giảm **route** chunk | Code split (`next/dynamic`), hoặc chuyển sang Server Component |

**Giảm shared quan trọng hơn** — nó ảnh hưởng lần tải đầu của **mọi** trang.

---

## 3. Đo: ba công cụ theo thứ tự dùng

### Bước 1 — `next build` output: rendering mode, KHÔNG còn số KB

⚠️ **Next.js 16 đã bỏ cột `Size` và `First Load JS`** khỏi output của `next build` — Vercel thấy các
con số này không chính xác với kiến trúc RSC (Turbopack và webpack còn tính khác nhau phần payload của
Client Component). Tài liệu/blog cũ hướng dẫn "đọc bảng First Load JS" không còn áp dụng.

Output vẫn cho bạn biết **mỗi route render kiểu gì**:

```
Route (app)
┌ ƒ /
├ ƒ /cart
├ ƒ /orders/[id]
├ ƒ /products/[id]
└ ƒ /seller/products/new

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

- `ƒ (Dynamic)` — render mỗi request
- `○ (Static)` — prerender tại build time, phục vụ từ CDN

📄 **Với repo này, dự đoán: MỌI route là `ƒ`.** Lý do (file `10`): `apiFetch` mặc định
`cache: 'no-store'` (`lib/api/server-client.ts`), và `(store)/layout.tsx` → `StoreHeader` →
`getAccessPayload()` → `cookies()`. Nếu thấy route nào `○`, nghĩa là nhánh đó không chạm dynamic API.

### Bước 2 — Bundle Analyzer (khi cần biết *cái gì* nặng)

**Với Turbopack (mặc định của repo): dùng analyzer tích hợp** — có từ Next 16.1, đang `experimental`:

```bash
pnpm next experimental-analyze            # mở UI tương tác, không tạo build artifact
pnpm next experimental-analyze --output   # ghi ra .next/diagnostics/analyze để so trước/sau
cp -r .next/diagnostics/analyze ./analyze-before-refactor
```

Nó dựa trên module graph của Turbopack: xem module client **và** server, kèm **chuỗi import** ("vì sao
module này có mặt ở đây?") — thứ treemap cũ không trả lời được.

⚠️ **`@next/bundle-analyzer` là plugin cho webpack.** Bọc `withBundleAnalyzer(nextConfig)` rồi chạy
`ANALYZE=true pnpm build` trên repo dùng Turbopack sẽ không cho report. Chỉ dùng nó nếu bạn build bằng
`next build --webpack`.

**Cách đọc kết quả analyzer:**

1. Tìm **khối lớn nhất** — nguyên nhân chính
2. *"Cái này có cần ở client không?"* Không → chuyển sang Server Component
3. *"Có cần ở lần tải đầu không?"* Không → `next/dynamic`
4. *"Tôi có dùng hết nó không?"* Không → tree shaking bị chặn ở đâu đó (xem chuỗi import)

### Bước 3 — Lighthouse / DevTools Network (đo KB thật)

Vì `next build` không còn in số KB, **con số "bao nhiêu JS xuống browser" lấy từ đây**:

```bash
pnpm build && pnpm start
# DevTools → Network → lọc "JS", bật "Disable cache" → xem cột Transferred
# DevTools → Lighthouse → Analyze page load
```

⚠️ **Không bao giờ đo ở `pnpm dev`** (file `13`): không minify, có dev warning, StrictMode
double-invoke. Lighthouse local cũng chỉ là bước đầu — số liệu thật là **field data** (mục 8).

---

## 4. ⭐ Barrel files — nguyên nhân bundle lớn phổ biến nhất

**Barrel file** là một `index.ts` re-export mọi thứ:

```tsx
// ❌ components/ui/index.ts
export * from './button'
export * from './select'      // ← kéo theo @base-ui/react/select
export * from './sonner'      // ← kéo theo sonner + next-themes

// Nơi dùng
import { Button } from '@/components/ui'
```

Bundler phải phân tích **toàn bộ** barrel để tìm `Button`. Nếu bất kỳ module nào trong đó có side-effect
(hoặc bundler không chứng minh được là không), nó **không thể** bị loại bỏ → một `import { Button }` có
thể kéo theo `sonner`, `next-themes`, `@base-ui/react/select`. Build cũng chậm hơn.

### ✅ Repo này KHÔNG có barrel file nào

```bash
$ find app components lib types actions -name "index.ts" -o -name "index.tsx"
# (không có kết quả)
```

```tsx
// ✅ Import trực tiếp — bundler biết chính xác cần gì
import { Button, buttonVariants } from '@/components/ui/button'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
```

> **Nguyên tắc:** đừng tạo barrel file cho component. Thấy `import { X } from '@/components/ui'` trong
> PR → hỏi vì sao.

### `optimizePackageImports` — khi barrel nằm trong dependency

Bạn không kiểm soát được barrel của thư viện (`lucide-react` có hơn 1.500 icon). Next.js viết lại
`import { Package } from 'lucide-react'` thành import trực tiếp tới file icon, bỏ qua barrel:

```ts
// next.config.ts — cho thư viện CHƯA nằm trong danh sách mặc định
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['some-icon-library'],
  },
}
```

📄 **Repo không cần thêm `lucide-react`** — nó (cùng `date-fns`, `lodash-es`, `@mui/icons-material`,
`recharts`...) đã nằm trong **danh sách tối ưu mặc định** của Next. Thêm vào là config vô ích. Nếu
nghi ngờ, chạy `next experimental-analyze` và xem `lucide-react` chiếm vài KB hay vài trăm KB.

### 📄 Icon trong Server Component = 0 byte JS

Repo dùng `lucide-react` ở 17 file. Phân loại:

| Loại | File | Icon vào client bundle? |
| --- | --- | --- |
| **Client** (`'use client'`) | `seller-sidebar`, `seller-mobile-nav`, `ui/select`, `ui/sonner`, `products/image-manager`, `variant-editor`, `option-photo-strip`, `store/product-purchase`, `add-to-cart`, `search-box` | **Có** |
| Server nhưng bị Client import | `seller/nav-items.ts` (import bởi `seller-sidebar`, `seller-mobile-nav`) | **Có** |
| Server | `store-header.tsx`, `(store)/layout.tsx`, `cart/page.tsx`, `products/[id]/page.tsx`, `orders/[id]/page.tsx`, `seller/page.tsx` | **Không** — SVG inline trong HTML |

**Icon trong Server Component render thành SVG trong HTML — không có JavaScript nào.** Một module
"server" như `nav-items.ts` vẫn vào bundle nếu một Client Component import nó (file `08`).

---

## 5. `next/dynamic` — code splitting có chủ đích

Repo chưa dùng, và phần lớn là đúng: các Client Component đều nhỏ. Code split một component 2KB là thêm
một round-trip mạng để tiết kiệm 2KB.

**Điều kiện: component nặng (>30KB) VÀ không cần ở lần render đầu.**

```tsx
// components/seller/revenue-section.tsx
'use client'                              // ⚠️ ssr: false CHỈ dùng được trong Client Component
import dynamic from 'next/dynamic'

const RevenueChart = dynamic(() => import('@/components/seller/revenue-chart'), {
  ssr: false,                             // chart cần window, không cần HTML
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />, // giữ chỗ → CLS = 0
})
```

```tsx
// ❌ app/(seller)/seller/page.tsx (Server Component)
const RevenueChart = dynamic(() => import('...'), { ssr: false })
// → lỗi build: "`ssr: false` is not allowed with `next/dynamic` in Server Components"
```

Ca dùng chính đáng trong tương lai của repo: chart doanh thu (`recharts`, 80–150 KB), rich text editor
cho mô tả sản phẩm (100–300 KB, chỉ ở `/seller/products/new`), bản đồ chọn địa chỉ (chỉ ở bước 2 checkout).

Với thư viện chỉ cần **sau tương tác**, `import()` trong handler còn gọn hơn:

```tsx
'use client'
async function onSearch(q: string) {
  const Fuse = (await import('fuse.js')).default   // chỉ tải khi người dùng gõ
  setResults(new Fuse(products, { keys: ['product_name'] }).search(q))
}
```

### ⚠️ Ba cạm bẫy

1. **`ssr: false` nghĩa là không có HTML** — sai cho nội dung cần SEO.
2. **Thêm một round-trip** — component chỉ bắt đầu tải khi React render tới nó. Với thứ người dùng chắc
   chắn thấy, bạn vừa làm nó chậm hơn.
3. **Nhiều chunk nhỏ tệ hơn một bundle vừa** — 20 chunk × 2KB chậm hơn 1 chunk × 40KB.

---

## 6. React Compiler — bớt `useMemo`/`useCallback` tay

Next 16 hỗ trợ React Compiler **stable** (`reactCompiler` đã lên top-level config), nhưng **không bật
mặc định**:

```bash
pnpm add -D babel-plugin-react-compiler
```

```ts
// next.config.ts
const nextConfig: NextConfig = { reactCompiler: true }
```

Compiler tự memo hoá component/giá trị → giảm re-render, giúp **INP**. Cái giá: dùng Babel nên build/dev
chậm hơn một chút (Next chỉ chạy nó trên file có JSX/hook). Nó **không** giảm KB bundle — đừng nhầm
với tối ưu bundle. Muốn bật dần: `reactCompiler: { compilationMode: 'annotation' }` rồi chỉ những
component có `'use memo'` ở đầu thân hàm mới được compile.

```tsx
// Trước: memo tay để ProductGrid không re-render khi gõ ô search
const visible = useMemo(() => products.filter((p) => p.price <= max), [products, max])
// Có compiler: viết thẳng, compiler tự memo
const visible = products.filter((p) => p.price <= max)
```

### Thấy re-render bằng mắt: React 19.2 Performance Tracks

Trước khi memo bất cứ thứ gì, xem React thực sự làm gì. React 19.2 thêm **custom track** vào tab
Performance của Chrome DevTools:

- **Scheduler ⚛** — công việc theo độ ưu tiên (Blocking cho input, Transition cho `startTransition`...)
- **Components ⚛** — component nào render/chạy effect, mất bao lâu

```bash
pnpm dev                       # track có sẵn ở dev build
pnpm next build --profile      # hoặc build production có bật React profiling
pnpm start
# DevTools → Performance → Record → gõ vào ô search → Stop → mở track "Components ⚛"
```

Nếu gõ một ký tự mà `ProductGrid` render lại 40 `ProductCard` → đó là chỗ đáng sửa (đẩy state xuống,
`useDeferredValue`, hoặc React Compiler). Số ms trong dev cao hơn production — so sánh **tương đối**.

---

## 7. Font — repo đã dùng `next/font`, nhưng chọn sai font cho tiếng Việt

📄 `app/layout.tsx`:

```tsx
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
```

**`next/font` tự động:** self-host (không request tới `fonts.gstatic.com`), preload, `font-display: swap`
(mặc định), và tính `size-adjust` cho fallback để giảm CLS. Dùng `<link href="https://fonts.googleapis.com/...">`
thủ công là mất cả bốn và thêm một kết nối tới domain khác.

⚠️ **Vấn đề với tiếng Việt:** Geist chỉ có subset `cyrillic`, `latin`, `latin-ext` — **không có
`vietnamese`**. Thêm `latin-ext` chỉ phủ một phần (ă, đ, ơ, ư); các ký tự dấu kết hợp như ạ, ấ, ở, ữ
(dải U+1EA0–1EF9) vẫn rơi về font hệ thống → một câu hiện hai font.

```tsx
// ❌ Không đủ cho tiếng Việt
const geistSans = Geist({ subsets: ["latin", "latin-ext"] })

// ✅ Chọn font có subset vietnamese (TypeScript sẽ báo lỗi nếu font không hỗ trợ subset đó)
import { Be_Vietnam_Pro } from "next/font/google";
const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "700"],      // font không phải variable → phải chỉ định weight
});
```

(Hiện UI của repo là tiếng Anh, `lang="en"` — chỉ cần sửa khi bản địa hoá.)

---

## 8. Server-side performance — thường quan trọng hơn bundle

Với repo này (mọi route dynamic, fetch `no-store`), **TTFB do backend quyết định**. Bundle 100KB tải
trong 200ms; nếu server mất 800ms để phản hồi, tối ưu bundle là tối ưu chỗ sai.

### Đo waterfall thật

```tsx
// lib/api/server-client.ts — TẠM THỜI để đo
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const t0 = performance.now()
  try {
    // ...phần fetch hiện tại...
  } finally {
    console.log(`[apiFetch] ${(opts.method ?? 'GET').padEnd(6)} ${path} ${Math.round(performance.now() - t0)}ms`)
  }
}
```

`pnpm build && pnpm start`, mở `/products/abc123`:

```
[apiFetch] GET    /cart                       142ms   ← StoreHeader trong layout
[apiFetch] GET    /product/abc123             156ms
[apiFetch] GET    /comment?productId=abc123   148ms   ← chờ /product xong mới chạy
```

📄 `app/(store)/products/[id]/page.tsx` gọi tuần tự:

```tsx
// ❌ Hiện tại: 156 + 148 = ~304ms
detail = normalizeProductDetail(await apiFetch<unknown>(`/product/${id}`))
// ...
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)

// ✅ Song song: ~156ms (file 06)
const [rawDetail, comments] = await Promise.all([
  apiFetch<unknown>(`/product/${id}`),
  apiFetch<Comment[]>(`/comment?productId=${id}`),
])
```

`StoreHeader` fetch `/cart` trên **mọi** trang storefront → 142ms cộng vào TTFB mọi trang. Sửa (file
`10`): tách phần per-user vào `<Suspense>` để TTFB không chờ `/cart`, badge giỏ hàng stream xuống sau:

```tsx
// app/(store)/layout.tsx
<StoreHeaderShell>
  <Suspense fallback={<HeaderUserSkeleton />}>
    <StoreHeaderUser />     {/* ← chỉ component này fetch /cart và gọi cookies() */}
  </Suspense>
</StoreHeaderShell>
```

---

## 9. Web Vitals thật từ người dùng

Lighthouse local là **lab data** — một máy, một mạng. Người dùng thật ở trên 3G, điện thoại cũ.

```tsx
// components/web-vitals.tsx
'use client'
import { useReportWebVitals } from 'next/web-vitals'

export function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({
      name: metric.name,           // 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
      value: metric.value,
      rating: metric.rating,       // 'good' | 'needs-improvement' | 'poor'
      pathname: window.location.pathname,
    })
    // sendBeacon không bị hủy khi trang đóng; fallback fetch keepalive
    if (!navigator.sendBeacon?.('/api/vitals', body)) {
      fetch('/api/vitals', { body, method: 'POST', keepalive: true })
    }
  })
  return null
}
```

```ts
// app/api/vitals/route.ts
export async function POST(request: Request) {
  const metric = await request.json()
  console.log('[vitals]', metric.pathname, metric.name, Math.round(metric.value), metric.rating)
  return new Response(null, { status: 204 })
}
```

Gắn `<WebVitals />` trong `<body>` của `app/layout.tsx`.

| Chỉ số | Good | Poor | Bị ảnh hưởng bởi |
| --- | --- | --- | --- |
| **LCP** | ≤ 2.5s | > 4.0s | **Ảnh** (file `13`), TTFB, cache |
| **INP** | ≤ 200ms | > 500ms | Kích thước JS, công việc trong handler |
| **CLS** | ≤ 0.1 | > 0.25 | **`width`/`height` ảnh**, skeleton, font |
| **TTFB** | ≤ 800ms | > 1800ms | **Backend**, cache, streaming |

📄 **Dự đoán cho repo (cần đo để xác nhận):** CLS và LCP kém (11 chỗ `<img>` trần, chưa dùng
`next/image`); TTFB trung bình (mọi route dynamic + waterfall); INP tốt (client bundle nhỏ).

### `next/image` trong Next 16 — các default đã đổi

Khi chuyển `<img>` sang `next/image` (việc #1 bên dưới), lưu ý:

```tsx
// ❌ Next 15: priority — đã deprecated ở 16
<Image src={p.thumb} alt={p.name} width={400} height={400} priority />

// ✅ Lưới sản phẩm: ảnh nào là LCP tuỳ viewport → dùng fetchPriority/loading cho vài ảnh đầu
<Image src={p.thumb} alt={p.name} width={400} height={400}
  fetchPriority={index < 4 ? 'high' : 'auto'} loading={index < 4 ? 'eager' : 'lazy'}
  sizes="(min-width: 768px) 25vw, 50vw" />

// ✅ Một ảnh hero duy nhất chắc chắn là LCP → preload (chèn <link rel="preload"> vào <head>)
<Image src="/banner.jpg" alt="Sale tháng 10" width={1200} height={400} preload />
```

Docs Next 16 nói rõ: "trong đa số trường hợp, dùng `loading="eager"` hoặc `fetchPriority="high"` thay
vì `preload`"; không dùng `preload` khi nhiều ảnh có thể là LCP, và không kết hợp nó với
`loading`/`fetchPriority`.

```ts
// next.config.ts
images: {
  remotePatterns: [new URL('https://cdn.example.com/products/**')],
  qualities: [75, 90],     // default giờ CHỈ [75]; quality ngoài danh sách bị ép về giá trị gần nhất
  // minimumCacheTTL default tăng từ 60s → 14400s (4 giờ)
  // imageSizes default bỏ 16; maximumRedirects default = 3
  // ảnh local có query string (?v=2) cần images.localPatterns[].search
  // upstream trỏ về IP nội bộ bị chặn (dangerouslyAllowLocalIP: false)
}
```

---

## 10. Danh sách ưu tiên dựa trên tác động

| # | Việc | Cải thiện | Công sức | Chương |
| --- | --- | --- | --- | --- |
| 1 | `next/image` (+ `fetchPriority` cho vài ảnh đầu) trong `product-card.tsx` | LCP + CLS | 1 giờ | `13`, mục 9 |
| 2 | `Promise.all` cho `/product` + `/comment` | −150ms mỗi lượt xem | 30 phút | `06` |
| 3 | Chạy `next experimental-analyze` + Lighthouse | **Biết mình đang ở đâu** | 15 phút | mục 3 |
| 4 | `loading.tsx` cho `/orders`, `/products/[id]` | Cảm giác phản hồi | 1 giờ | `06` |
| 5 | Cache tag cho `/product` công khai | TTFB 150ms → ~5ms | 2 giờ | `10` |
| 6 | Tách `/cart` khỏi layout + Suspense | −142ms mọi trang store | 2 giờ | `10` |
| 7 | `WebVitals` reporting | **Có số liệu thật** | 1 giờ | mục 9 |
| 8 | `useOptimistic` cho giỏ hàng | INP cảm nhận | 3 giờ | `07` |
| — | Giữ nguyên: không barrel, không `next/dynamic`, không thêm lucide vào `optimizePackageImports` | Đã đúng | — | mục 4–5 |

---

## 11. Ba sai lầm phổ biến

**(1) Tối ưu bundle khi vấn đề là TTFB.** Trang mất 800ms vì backend + waterfall: giảm bundle 10KB tiết
kiệm ~30ms (4%); sửa waterfall tiết kiệm 150ms (19%). **Tìm chi phí lớn nhất trước.**

**(2) Đo ở dev, hoặc một lần trên máy tốt.**

```bash
# ❌ pnpm dev rồi mở Lighthouse
# ✅
pnpm build && pnpm start
# + Network throttle "Fast 4G", CPU throttle 4x (≈ điện thoại phổ thông), chạy 3 lần lấy trung vị
```

**(3) Tối ưu mà không đo lại.** Thêm `next/dynamic` cho component nhỏ → thêm round-trip → LCP 3.2s
thành 3.4s mà không ai biết. **Ghi số trước, làm một thay đổi, đo lại; không cải thiện → revert.**
`next experimental-analyze --output` cho bạn bản lưu để diff.

---

## 12. Best Practices

1. **Biết công cụ đo của Next 16:** `next build` cho rendering mode (`○`/`ƒ`), `next experimental-analyze`
   cho thành phần bundle, DevTools/Lighthouse cho KB và Web Vitals, Performance Tracks cho re-render.
2. **Đo TTFB trước bundle** — với app dynamic + `no-store`, backend thường là chi phí lớn nhất.
3. **Không barrel file cho component**; không thêm package đã có sẵn vào `optimizePackageImports`.
4. **`next/dynamic` chỉ khi >30KB VÀ không cần ở render đầu**; `ssr: false` chỉ trong Client Component.
5. **Icon/thư viện nặng giữ trong Server Component** khi có thể — 0 byte JS.
6. **Font phải có subset cho ngôn ngữ hiển thị** (`vietnamese`, không chỉ `latin-ext`).
7. **`next/image`: `fetchPriority`/`loading="eager"` cho ảnh trên màn hình đầu (`preload` chỉ cho một ảnh hero), khai báo `qualities`** nếu cần chất lượng khác 75.
8. **Đo với CPU throttle 4x và mạng chậm; thu thập Web Vitals thật.**
9. **Một thay đổi, một lần đo.**

---

## Tự kiểm tra

1. Phân biệt "shared chunk" và "route chunk". Giảm cái nào quan trọng hơn? Vì sao?
2. Next 16 bỏ gì khỏi output `next build`? Vậy lấy số KB JS ở đâu?
3. Vì sao `ANALYZE=true pnpm build` với `@next/bundle-analyzer` không có tác dụng trên repo này? Dùng gì thay?
4. Barrel file gây vấn đề gì cụ thể? Vì sao không cần thêm `lucide-react` vào `optimizePackageImports`?
5. Vì sao `nav-items.ts` (không có `'use client'`) vẫn đưa icon vào client bundle?
6. Ngưỡng nào để `next/dynamic` đáng dùng? Vì sao `ssr: false` lỗi trong `app/(seller)/seller/page.tsx`?
7. Vì sao `subsets: ["latin", "latin-ext"]` với Geist vẫn chưa đủ cho tiếng Việt?
8. Với repo này, tối ưu bundle 10KB hay sửa waterfall 150ms có lợi hơn? Tính ra.
9. `priority` và `quality={90}` trên `next/image` hành xử thế nào ở Next 16?
10. React Compiler cải thiện chỉ số nào, và có giảm bundle không? Dùng gì để thấy component nào re-render?

➡️ Tiếp theo: `23-accessibility-engineering.md`
