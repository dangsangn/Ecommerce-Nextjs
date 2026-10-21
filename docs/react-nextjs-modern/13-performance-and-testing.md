# 13 — Hiệu năng & Kiểm thử: Prefetch, Router Cache, `next/image`, `next/font`, Bundle, Test RSC & Server Action

> Hai câu hỏi cuối mà một dev App Router cần trả lời được:
> 1. *"Tại sao trang này chậm / tại sao Back lại hiện dữ liệu cũ?"*
> 2. *"Làm sao test được Server Action và Server Component?"*

---

## Phần A — Hiệu năng

## 1. Prefetching — vì sao chuyển trang có thể "tức thì"

### Là gì?

Khi một `<Link>` **xuất hiện trong viewport**, Next tự tải trước route đích ở nền. Lúc người dùng click, phần lớn đã có sẵn.

⚠️ **Chỉ chạy ở production** (`next build && next start`). Ở `next dev` không prefetch → đừng đánh giá tốc độ điều hướng bằng dev server.

### Prefetch được bao nhiêu? — phụ thuộc loại route

| Route đích | Prefetch tới đâu | Hệ quả |
| --- | --- | --- |
| **Static** | Toàn bộ trang | Click là hiện ngay |
| **Dynamic**, **có** `loading.tsx` | Layout + tới `loading.tsx` đầu tiên | Click hiện skeleton ngay, nội dung stream sau |
| **Dynamic**, **không có** `loading.tsx` | Gần như không gì | Click → **chờ server render xong** mới đổi màn hình |

🧠 Đây là lý do thực sự khiến `loading.tsx` quan trọng (file 08): nó không chỉ là spinner — nó là **thứ cho phép prefetch hoạt động** với route động. Repo gần như toàn route động và chưa có `loading.tsx` → prefetch gần như không giúp gì.

### Điều khiển prefetch

```tsx
<Link href="/orders" prefetch={false}>   {/* tắt: link ít dùng, hoặc danh sách cả trăm link */}
<Link href="/checkout" prefetch>         {/* bật đầy đủ kể cả route động — tốn tài nguyên server */}
router.prefetch('/checkout')             {/* chủ động: ví dụ khi giỏ hàng có hàng */}
```

**Mẹo: chỉ prefetch khi hover** — cho lưới hàng trăm sản phẩm, prefetch theo viewport sẽ bắn hàng trăm request:

```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'

export function HoverPrefetchLink(props: React.ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false)
  return <Link {...props} prefetch={active ? null : false} onMouseEnter={() => setActive(true)} />
}
```

`prefetch={null}` = quay về mặc định khi người dùng đã thể hiện ý định.

### ⚠️ Cạm bẫy: side effect trong render bị chạy khi prefetch

```tsx
// ❌ Chạy khi link xuất hiện trên màn hình, không phải khi người dùng vào trang
export default async function NotificationsPage() {
  await markAllAsRead()   // người dùng chưa mở trang mà thông báo đã "đã đọc"
  trackPageView()         // số lượt xem bị thổi phồng
}
```

Render phải **pure** (file 01). Side effect → `useEffect` hoặc Server Action do người dùng kích hoạt.

---

## 2. Client Router Cache — vì sao Back hiện dữ liệu cũ

Trình duyệt giữ một cache các đoạn RSC đã tải:

| Tình huống | Mặc định |
| --- | --- |
| **Back / Forward** | **Luôn** dùng cache — để giữ scroll, không nhấp nháy |
| Trang dynamic khi điều hướng tới | Không cache (0 giây) |
| Trang static / prefetch đầy đủ | 5 phút |
| Layout dùng chung | Không tải lại khi chuyển giữa các trang con |

Hệ quả: thêm hàng vào giỏ ở trang A, sang trang B, bấm Back → trang A có thể hiện số cũ. **Đây là hành vi đúng** của Back. Nếu cần dữ liệu mới ngay sau mutation: `revalidatePath`/`refresh()` trong action (file 07) sẽ làm mới cả cache này.

Điều chỉnh (thử nghiệm): `experimental.staleTimes: { dynamic: 30, static: 180 }` — cho phép tái dùng trang động trong 30 giây, đổi lại có thể thấy dữ liệu cũ.

---

## 3. `next/image`

### Repo hiện tại

Repo dùng `<img>` ở 10 file, mỗi chỗ kèm `{/* eslint-disable-next-line @next/next/no-img-element */}` — ví dụ [cart-line.tsx](../../components/store/cart-line.tsx).

### `next/image` mang lại gì?

| Vấn đề với `<img>` thường | `next/image` |
| --- | --- |
| Ảnh 2000px gửi cho ô 80px | Tự resize theo `sizes`/`width`, sinh `srcset` |
| JPEG/PNG nặng | Tự chuyển WebP/AVIF |
| Layout nhảy khi ảnh tải xong (CLS) | Bắt buộc `width`/`height` hoặc `fill` → giữ chỗ |
| Ảnh dưới màn hình vẫn tải ngay | `loading="lazy"` mặc định |

```tsx
import Image from 'next/image'

<Image src={thumb} alt={name} width={80} height={80} className="rounded-xl object-contain" />

// Ảnh LCP (ảnh lớn đầu trang sản phẩm): cho tải sớm
<Image src={spu.product_thumb} alt={spu.product_name} fill sizes="(min-width: 768px) 50vw, 100vw" fetchPriority="high" />
```

> Next 16: prop `priority` **đã deprecated**, thay bằng `preload`. Docs khuyên phần lớn trường hợp dùng `loading="eager"` hoặc `fetchPriority="high"` thay vì `preload`.

### Cấu hình ảnh từ domain ngoài

```ts
// next.config.ts
images: {
  remotePatterns: [new URL('https://res.cloudinary.com/**')], // thay bằng domain ảnh thật của backend
}
```

### Đánh đổi — và lựa chọn tốt hơn khi đã có dịch vụ ảnh

Tối ưu ảnh của Next **tốn CPU server Next** và bộ nhớ cache. Nếu ảnh đã nằm trên dịch vụ có sẵn biến đổi qua URL (Cloudinary, imgix — ảnh của repo có `public_id`, dấu hiệu của dịch vụ kiểu này), dùng **custom loader** để dịch vụ đó làm việc resize:

```ts
// lib/images/loader.ts
export default function cloudinaryLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  return src.replace('/upload/', `/upload/w_${width},q_${quality ?? 'auto'},f_auto/`)
}
// next.config.ts → images: { loader: 'custom', loaderFile: './lib/images/loader.ts' }
```

Bạn vẫn có `srcset`, lazy, chống CLS của `next/image` — mà server Next không phải xử lý ảnh.

---

## 4. `next/font`

Repo đã dùng đúng — [app/layout.tsx](../../app/layout.tsx):

```tsx
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
```

`next/font` tải font **lúc build**, tự host cùng app (không gọi Google lúc runtime — tốt cho privacy và tốc độ), và sinh fallback font có kích thước khớp → **không nhảy layout** khi font tải xong.

⚠️ `subsets` chỉ chứa ký tự được khai báo. Nếu UI chuyển sang tiếng Việt, cần font hỗ trợ subset `vietnamese` và khai báo nó — nếu không, các ký tự như "ệ", "ữ" rơi về font dự phòng, trông lệch kiểu.

---

## 5. `next/script` và lazy loading

```tsx
import Script from 'next/script'

<Script src="https://widget.chat.example/sdk.js" strategy="lazyOnload" /> {/* chat widget: tải lúc rảnh */}
<Script src="https://www.googletagmanager.com/gtag/js" strategy="afterInteractive" />
```

| `strategy` | Khi nào tải | Dùng cho |
| --- | --- | --- |
| `beforeInteractive` | Trước hydration | Hầu như không bao giờ (consent manager bắt buộc) |
| `afterInteractive` (mặc định) | Sau hydration | Analytics |
| `lazyOnload` | Khi trình duyệt rảnh | Chat, widget mạng xã hội |

**Lazy load component client nặng** (trình soạn thảo, biểu đồ, bản đồ):

```tsx
'use client'
import dynamic from 'next/dynamic'

const RichEditor = dynamic(() => import('./rich-editor'), {
  ssr: false,                          // chỉ hợp lệ trong Client Component
  loading: () => <EditorSkeleton />,
})
```

---

## 6. `generateStaticParams` — dựng sẵn trang phổ biến

```tsx
// app/(store)/products/[id]/page.tsx
export async function generateStaticParams() {
  const top = await publicFetch<{ _id: string }[]>('/product/top?limit=100')
  return top.map((p) => ({ id: p._id }))
}
```

100 sản phẩm bán chạy được render lúc build → phục vụ như file tĩnh. Sản phẩm khác render khi có request đầu tiên.

⚠️ **Chỉ có tác dụng nếu trang không đọc dữ liệu theo request** (cookie, `headers()`). Trang sản phẩm của repo gọi `getClientId()` (cookie) và `apiFetch` (đọc `headers()`) → luôn động, nên `generateStaticParams` không giúp gì cho tới khi tách phần cá nhân hoá ra (Cache Components + Suspense — file 08).

---

## 7. Đo bundle

```bash
pnpm next experimental-analyze   # Next 16.1+, Turbopack bundle analyzer
pnpm build                        # xem kích thước từng route trong output
```

Nghi phạm thường gặp:
- `'use client'` đặt quá cao → kéo cả cây vào bundle (file 06).
- Thư viện lớn import trong Client Component (date, chart, lodash) → `next/dynamic` hoặc chuyển sang Server Component.
- Barrel file (`index.ts` re-export mọi thứ). `lucide-react` đã được Next tối ưu sẵn; thư viện nội bộ thì thêm vào `optimizePackageImports`.

---

## Phần B — Kiểm thử

## 8. Kim tự tháp test cho App Router

```
              ▲  E2E (Playwright)         — luồng thật: đăng nhập → thêm giỏ → đặt hàng
             ▲▲▲                            Server Component async, proxy, redirect
            ▲▲▲▲▲  Server Action (Vitest) — mock apiFetch, next/navigation, next/cache
           ▲▲▲▲▲▲▲  Client Component       — Vitest + jsdom + Testing Library
          ▲▲▲▲▲▲▲▲▲  Hàm thuần (Vitest)     — validate, tính giá, gom SKU
```

> ⚠️ **Vitest chưa render được Server Component `async`.** Docs Next khuyến nghị dùng E2E cho chúng. Thiết kế hệ quả: **giữ logic khỏi component** — đưa vào hàm thuần để unit test.

### Repo đang ở đâu

Repo đã làm rất tốt tầng dưới cùng: 15 file test cho hàm thuần trong `lib/` ([sku.test.ts](../../lib/products/__tests__/sku.test.ts), [gate.test.ts](../../lib/auth/__tests__/gate.test.ts), [summary.test.ts](../../lib/cart/__tests__/summary.test.ts)…). Chính nhờ logic được tách ra `lib/` (như `shouldGateShop` tách khỏi `proxy.ts`) mà test được. Chưa có: test Server Action, test Client Component, E2E.

> Nhắc lại: chạy Vitest trong repo này cần **Node 22**; Node 20.9 mặc định làm Vitest lỗi trước khi chạy test nào.

## 9. Test Server Action

Server Action chỉ là hàm `async` — test được bằng Vitest nếu mock đúng ba thứ: lớp gọi API, `next/navigation`, `next/cache`.

```ts
// actions/__tests__/cart.actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server-client', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getClientId: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  // redirect thật ném lỗi — mô phỏng lại để test được nhánh redirect
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

import { addToCartAction } from '@/actions/cart.actions'
import { apiFetch } from '@/lib/api/server-client'
import { getClientId } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'

function form(data: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(data)) fd.append(k, v)
  return fd
}

describe('addToCartAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('từ chối số lượng < 1 mà không gọi API', async () => {
    const res = await addToCartAction({ ok: false }, form({ productId: 'p1', quantity: '0' }))
    expect(res).toEqual({ ok: false, message: 'Quantity must be at least 1' })
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('chuyển về login khi chưa đăng nhập', async () => {
    vi.mocked(getClientId).mockResolvedValue(undefined)
    await expect(addToCartAction({ ok: false }, form({ productId: 'p1', quantity: '1' })))
      .rejects.toThrow('REDIRECT:/login?redirect=/products/p1')
  })

  it('thêm thành công thì revalidate /cart', async () => {
    vi.mocked(getClientId).mockResolvedValue('u1')
    vi.mocked(apiFetch).mockResolvedValue({})
    const res = await addToCartAction({ ok: false }, form({ productId: 'p1', quantity: '2' }))
    expect(res.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/cart')
  })
})
```

**Test những gì?** Nhánh validate, nhánh chưa đăng nhập, nhánh lỗi backend (message trả về có phải fallback an toàn không), và **có gọi đúng revalidate không** — bug "lưu rồi mà UI không đổi" thường nằm ở đây.

## 10. Test Client Component

Cần thêm `jsdom` + `@testing-library/react`, và cho phép đuôi `.test.tsx` (hiện [vitest.config.ts](../../vitest.config.ts) chỉ có `**/*.test.ts`, môi trường `node`):

```ts
// vitest.config.ts — chỉ cần mở rộng include; giữ environment 'node' mặc định cho test lib/action
include: ['**/*.test.ts', '**/*.test.tsx'],
```

Rồi chọn môi trường DOM **theo từng file** bằng comment ở dòng đầu — cách này ổn định qua các bản Vitest (option `environmentMatchGlobs` cũ đã bị bỏ, thay bằng `projects`):

```tsx
// components/auth/__tests__/submit-button.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { SubmitButton } from '@/components/auth/submit-button'

it('hiện "Processing…" và disable khi form đang gửi', async () => {
  let resolve!: () => void
  render(
    <form action={() => new Promise<void>((r) => (resolve = r))}>
      <SubmitButton>Lưu</SubmitButton>
    </form>,
  )
  screen.getByRole('button').click()
  expect(await screen.findByRole('button', { name: 'Processing…' })).toBeDisabled()
  resolve()
})
```

Test này kiểm chứng đúng điều file 03 dạy: `useFormStatus` đọc trạng thái của **form cha**, và pending kéo dài đúng bằng thời gian action chạy.

## 11. E2E với Playwright — cho phần không unit test được

Server Component async, `proxy.ts` refresh token, redirect sau đăng nhập, streaming — chỉ kiểm chứng đúng trên app thật:

```ts
test('khách chưa đăng nhập bị chuyển về login khi vào giỏ hàng', async ({ page }) => {
  await page.goto('/cart')
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcart/)
})
```

✅ Chạy E2E trên **`next build && next start`**, không phải `next dev` — prefetch, cache, và lỗi bị che ở production khác dev.

---

## Trade-offs

| Lựa chọn | Benefits | Costs |
| --- | --- | --- |
| Prefetch mặc định | Điều hướng tức thì | Tải thêm request cho link có thể không bao giờ click |
| `next/image` với optimizer của Next | Ảnh nhỏ, không CLS | CPU server Next; với dịch vụ ảnh sẵn có thì nên dùng loader |
| `staleTimes` | Ít request khi qua lại | Dữ liệu cũ hơn |
| Unit test Server Action với mock | Nhanh, chính xác từng nhánh | Mock sai = test xanh mà app hỏng → cần E2E bù |
| E2E | Kiểm chứng thật | Chậm, cần backend/dữ liệu test |

## Best Practices

1. ✅ **Đo hiệu năng ở production build**, không ở `next dev`.
2. ✅ **`loading.tsx` trước, tinh chỉnh prefetch sau.**
3. ✅ **Render pure** — không side effect có thể bị prefetch kích hoạt.
4. ✅ **Ảnh LCP dùng `fetchPriority="high"`**; ảnh còn lại để lazy mặc định.
5. ✅ **Logic vào hàm thuần trong `lib/`** — repo đang làm tốt, giữ nguyên thói quen.
6. ✅ **Mỗi Server Action có test cho: validate, chưa đăng nhập, lỗi backend, revalidate.**
7. ✅ **E2E cho luồng tiền** (giỏ → checkout → đơn hàng) — nơi bug đắt nhất.

---

**Trước:** [12 — Bảo mật & Data Access](./12-security-and-data-access.md) · **Tiếp theo:** [14 — Tips & Tricks](./14-tips-and-tricks.md)
