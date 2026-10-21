# 09 — Hook & Routing của Next.js App Router

> Các hook điều hướng của Next.js, cách đọc URL ở server lẫn client, `proxy.ts`, và cách xử lý lỗi theo route.
> Tất cả hook trong file này import từ **`next/navigation`** (trừ `useLinkStatus` từ `next/link`) và chỉ dùng trong **Client Component**.

> ⚠️ Nếu thấy code import `useRouter` từ `next/router` — đó là **Pages Router** cũ. Trong `app/` luôn dùng `next/navigation`.

---

## 1. Bức tranh tổng thể: đọc URL ở đâu?

URL là **state** — có lẽ là state quan trọng nhất của một trang web (chia sẻ được, bookmark được, Back được). Next cho bạn đọc nó ở cả hai phía:

| Phần URL | Server Component (`page.tsx`, `layout.tsx`) | Client Component |
| --- | --- | --- |
| `/products/[id]` | `params` (**Promise**) | `useParams()` |
| `?q=áo&page=2` | `searchParams` (**Promise**, chỉ `page.tsx`) | `useSearchParams()` |
| `/seller/products` | — | `usePathname()` |
| Đoạn route con đang active | — | `useSelectedLayoutSegment(s)()` |

🧠 **Quy tắc chọn:** đọc ở **server** khi URL quyết định *dữ liệu cần lấy*; đọc ở **client** khi URL quyết định *trạng thái tương tác* (tab nào đang sáng, link nào active).

---

## 2. `params` và `searchParams` là Promise (Next 15+, bắt buộc từ Next 16)

```tsx
// app/(store)/products/[id]/page.tsx — đúng như repo
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // ...
}
```

### Tại sao lại là Promise?

Để Next **biết chính xác thời điểm** bạn cần dữ liệu của request. Mọi thứ trước dòng `await params` có thể được prerender (vỏ tĩnh — file 08); mọi thứ sau đó phụ thuộc request. Nếu `params` là object đồng bộ, Next phải giả định cả component phụ thuộc request ngay từ dòng đầu.

Tương tự, `cookies()`, `headers()`, `draftMode()` đều async. Next 16 đã **gỡ bỏ** chế độ tương thích đồng bộ.

### Helper kiểu tự sinh

```bash
npx next typegen
```

```tsx
// Kiểu được suy ra từ cấu trúc thư mục — không phải tự viết Promise<{ id: string }>
export default async function Page(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params
}
```

### Trong Client Component: dùng `use()` hoặc hook

```tsx
'use client'
import { use } from 'react'
import { useParams } from 'next/navigation'

// Cách 1: nhận Promise từ page cha và mở bằng use() (file 04)
function A({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
}

// Cách 2: đọc trực tiếp từ router
function B() {
  const { id } = useParams<{ id: string }>()
}
```

---

## 3. `useRouter` — điều hướng bằng code

```tsx
const router = useRouter()

router.push('/cart')          // điều hướng, thêm vào history
router.replace('/seller')     // điều hướng, THAY entry hiện tại (Back sẽ không quay lại)
router.refresh()              // render lại Server Components của trang hiện tại, giữ state client
router.back() / router.forward()
router.prefetch('/checkout')  // tải trước
```

### Ví dụ trong repo

**`push` từ một form action phía client** — [components/store/search-box.tsx](../../components/store/search-box.tsx):

```tsx
<form
  action={(formData) => {
    const q = String(formData.get('q') ?? '').trim()
    router.push(q ? `/?q=${encodeURIComponent(q)}` : '/')
  }}
>
```

Hai điểm đáng học:
1. `action` ở đây là **hàm client**, không phải Server Action — React 19 cho phép cả hai (file 03). Không cần `onSubmit` + `preventDefault`.
2. Tìm kiếm được đưa **vào URL** chứ không vào `useState` → trang chủ (Server Component) đọc `searchParams.q` và lọc ở server; kết quả chia sẻ được qua link.

**`replace` để dọn URL** — [components/seller/welcome-toast.tsx](../../components/seller/welcome-toast.tsx):

```tsx
useEffect(() => {
  if (welcome !== '1') return
  toast.success("You're now a shop — welcome to Seller Centre")
  router.replace('/seller') // gỡ ?welcome=1 để F5 không hiện toast lần nữa, và Back không quay lại URL có cờ
}, [welcome, router])
```

### When NOT to use `useRouter`

- ❌ **Điều hướng mà người dùng click** → dùng `<Link>`: có prefetch, mở tab mới bằng Ctrl+click, SEO thấy được link. `router.push` trong `onClick` là anti-pattern phổ biến.
- ❌ **Redirect sau Server Action** → gọi `redirect()` trong action (file 07), không trả `{ ok: true }` rồi `router.push` ở client (tốn thêm round-trip, không chạy khi chưa có JS).
- ❌ **Làm mới sau mutation** → ưu tiên `revalidatePath`/`refresh()` trong action thay vì `router.refresh()` (file 07).

---

## 4. `useSearchParams` và **bắt buộc Suspense**

```tsx
'use client'
const params = useSearchParams()
const page = Number(params.get('page') ?? 1)
```

### ⚠️ Cạm bẫy: thiếu Suspense

Query string **chỉ biết được khi có request**. Nếu một trang có thể prerender tĩnh mà một Client Component trong đó gọi `useSearchParams()`, Next phải **bỏ render phía server** cho phần đó tới boundary `<Suspense>` gần nhất. Không có Suspense → cả trang bị ảnh hưởng, và `next build` báo lỗi *"useSearchParams() should be wrapped in a suspense boundary"*.

Repo làm đúng — [app/(seller)/seller/page.tsx](<../../app/(seller)/seller/page.tsx>):

```tsx
<Suspense fallback={null}>
  <WelcomeToast /> {/* dùng useSearchParams bên trong */}
</Suspense>
```

`fallback={null}` hợp lý vì component này không vẽ gì.

### Server hay client?

```
 Cần searchParams để LẤY DỮ LIỆU (lọc, phân trang, tìm kiếm)?
   → đọc `searchParams` trong page.tsx (server). Ví dụ: app/(store)/page.tsx, app/(seller)/seller/products/page.tsx
 Cần để ĐIỀU KHIỂN UI client (mở modal theo ?modal=, cờ hiển thị toast)?
   → useSearchParams() trong Client Component + <Suspense>
```

### Cập nhật query string

`useSearchParams()` trả về bản **chỉ đọc**. Để đổi, tạo URL mới:

```tsx
const pathname = usePathname()
const params = useSearchParams()
const router = useRouter()

function setPage(page: number) {
  const next = new URLSearchParams(params)
  next.set('page', String(page))
  router.push(`${pathname}?${next}`)
}
```

---

## 5. `usePathname`, `useParams`, `useSelectedLayoutSegment`

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Link sidebar active
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)
  return <Link href={href} aria-current={active ? 'page' : undefined} className={active ? 'font-bold' : ''}>{children}</Link>
}
```

`useSelectedLayoutSegment()` dùng trong **layout** để biết route con nào đang active, ví dụ trong `app/(seller)/seller/layout.tsx` → trả `'products'`, `'discounts'`, hay `null` (trang gốc). Hữu ích hơn so sánh chuỗi pathname khi layout lồng nhiều cấp.

---

## 6. `useLinkStatus` — chỉ báo pending cho một `<Link>` (Next 15.3+)

```tsx
'use client'
import Link, { useLinkStatus } from 'next/link'

function PendingDot() {
  const { pending } = useLinkStatus() // phải là con của <Link>
  return <span aria-hidden className={pending ? 'opacity-100 animate-pulse' : 'opacity-0'}>•</span>
}

<Link href="/orders">Đơn hàng <PendingDot /></Link>
```

🧠 Giống `useFormStatus` nhưng cho `<Link>`: component con "nhìn lên" link cha.

**Khi nào dùng?** Khi route đích động, **không có `loading.tsx`**, và click có cảm giác "không ăn". Nhưng docs Next khuyến nghị: đây là **băng dán tạm**. Giải pháp gốc là thêm `loading.tsx` (file 08) — khi đó điều hướng tức thì và `useLinkStatus` thường không cần nữa.

⚠️ Để chỉ báo kích thước cố định, chỉ đổi `opacity` — tránh layout nhảy.

---

## 7. `proxy.ts` — trước đây là `middleware.ts`

### Là gì?

Code chạy **trước** khi request tới route — để redirect, rewrite, đọc/ghi cookie, thêm header. Next 16 đổi tên `middleware` → **`proxy`** để nói rõ vai trò: *một lớp proxy ở ranh giới mạng*, không phải "middleware" kiểu Express nơi bạn đặt logic nghiệp vụ.

Khác biệt kỹ thuật: `proxy` chạy trên **Node.js runtime** (không cấu hình được). Muốn Edge runtime thì vẫn dùng `middleware.ts` (đã deprecated).

### Trong repo — [proxy.ts](../../proxy.ts)

```ts
export default async function proxy(req: NextRequest): Promise<NextResponse> {
  // 1. Không có clientId → về /login
  // 2. Access token sắp hết hạn → gọi /auth/refresh-token, ghi cookie mới
  // 3. Kiểm vai trò: không phải shop → chỉ được vào /seller/account
}

export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
```

**Tại sao refresh token ở proxy mà không ở Server Component?** Vì Server Component **không ghi được cookie**. Proxy chạy trước mọi render, có thể ghi cookie vào response — nên mọi Server Component phía sau đều thấy token mới.

### When NOT to use proxy

- ❌ **Logic nặng / gọi DB mỗi request** — proxy chạy cho **mọi** request khớp matcher, kể cả prefetch. Giữ nó nhanh.
- ❌ **Là lớp bảo mật duy nhất** — luôn kiểm quyền lại trong Server Action và trang (file 07). Proxy là lớp "chặn sớm cho UX", không phải ranh giới tin cậy duy nhất.
- ❌ **Lấy dữ liệu cho trang** — làm ở Server Component.

---

## 8. Xử lý lỗi theo route: `error.tsx`, `not-found.tsx`, `unstable_catchError`

```tsx
// app/(store)/orders/error.tsx — phải là Client Component
'use client'

export default function OrdersError({ error, unstable_retry }: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div>
      <p>Không tải được đơn hàng.</p>
      <button onClick={() => unstable_retry()}>Thử lại</button>
    </div>
  )
}
```

- `error.tsx` bọc `page.tsx` cùng cấp trong một Error Boundary. Layout **không** bị thay → header, menu vẫn còn.
- `unstable_retry()` (Next 16.2) **fetch lại và render lại** phần bị lỗi trong một transition. Khác với `reset()` cũ chỉ xoá trạng thái lỗi mà không fetch lại — vô dụng với lỗi từ Server Component.
- `notFound()` gọi từ server → render `not-found.tsx` gần nhất.
- `unstable_catchError(Fallback)` (từ `next/error`) — tạo Error Boundary ở **cấp component** thay vì cấp route, và tự hiểu các lỗi đặc biệt như `redirect()`/`notFound()` (không bắt nhầm chúng).

> Repo hiện **chưa có** `error.tsx` hay `not-found.tsx`. Các trang tự `try/catch` và hiện thông báo (xem [products/[id]/page.tsx](<../../app/(store)/products/[id]/page.tsx>)). Cách đó ổn cho lỗi dự đoán được (API trả 404); `error.tsx` là lưới an toàn cho lỗi không lường trước — thêm ít nhất một cái ở mỗi route group.

---

## Trade-offs

| Lựa chọn | Benefits | Costs |
| --- | --- | --- |
| State trong URL (`searchParams`) | Chia sẻ, bookmark, Back hoạt động; server lọc được | Mỗi thay đổi = một navigation (round-trip server) |
| State trong `useState` | Tức thì, không round-trip | Mất khi F5, không chia sẻ được |
| `<Link>` | Prefetch, a11y, SEO | Chỉ dùng cho điều hướng do người dùng bấm |
| `router.push` | Linh hoạt, điều hướng theo logic | Không prefetch tự động, không mở tab mới |
| Kiểm quyền ở `proxy` | Chặn sớm, ghi được cookie | Chạy mỗi request khớp matcher; không đủ làm lớp bảo mật duy nhất |

## Best Practices

1. ✅ **State nào nên sống sót qua F5/chia sẻ link → đưa vào URL.** Bộ lọc, trang, từ khoá tìm kiếm.
2. ✅ **`useSearchParams` luôn có `<Suspense>` bọc ngoài.**
3. ✅ **`<Link>` cho điều hướng của người dùng, `router` cho điều hướng theo logic, `redirect()` cho điều hướng sau action.**
4. ✅ **Chạy `next typegen` và dùng `PageProps<'/route'>`** thay vì tự viết kiểu Promise.
5. ✅ **Proxy mỏng và nhanh**; kiểm quyền lặp lại ở server.
6. ✅ **Thêm `error.tsx` dùng `unstable_retry`** cho mỗi route group.

---

**Trước:** [08 — Caching & Rendering](./08-nextjs-caching-and-rendering.md) · **Tiếp theo:** [10 — Cheatsheet ra quyết định](./10-decision-cheatsheet.md)
