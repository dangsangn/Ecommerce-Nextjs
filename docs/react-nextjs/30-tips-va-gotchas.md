# 30. Tips & Gotchas — những thứ không ở đâu khác

> **Mục tiêu:** tập hợp các API ít biết, các bẫy "trông như phải chạy mà không chạy", và ba quyết định
> kiến trúc thường gặp. Đây là chương tra cứu — đọc một lượt để biết cái gì tồn tại, rồi quay lại khi cần.

---

## 1. Mười API ít biết mà hữu ích

### 1.1 `after()` — chạy sau khi response đã gửi

Đã trình bày ở file `28`. Nhắc lại vì nó hữu ích và ít ai biết:

```tsx
import { after } from 'next/server'

export async function createCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // ...tạo comment...
  revalidatePath(`/products/${productId}`)

  after(async () => {
    try {
      await notifyProductOwner(productId)      // người dùng không chờ email
    } catch (e) {
      console.error('[after] notify failed', e)
    }
  })

  return { ok: true, message: 'Comment posted' }
}
```

### 1.2 `unauthorized()` và `forbidden()`

Cùng họ với `notFound()` — throw một sentinel để framework render UI tương ứng:

```tsx
import { unauthorized, forbidden } from 'next/navigation'

export default async function SellerProductsPage() {
  const payload = await getAccessPayload()
  if (!payload) unauthorized()                          // → render app/unauthorized.tsx, HTTP 401
  if (!payload.roles?.includes('shop')) forbidden()     // → render app/forbidden.tsx, HTTP 403
  // ...
}
```

```tsx
// app/unauthorized.tsx
import Link from 'next/link'

export default function Unauthorized() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h2 className="text-xl font-semibold">Bạn cần đăng nhập</h2>
      <Link href="/login" className="text-sm text-primary hover:underline">Đăng nhập →</Link>
    </div>
  )
}
```

**Lợi ích so với cách hiện tại của repo** (proxy redirect về `/login`):

| | Proxy redirect | `unauthorized()` |
| --- | --- | --- |
| HTTP status | 307 rồi 200 | **401** — đúng semantics |
| Giữ nguyên URL | ❌ Đổi sang `/login` | ✅ Người dùng thấy URL họ muốn vào |
| Monitoring | Trông như navigation thường | Đếm được số 401 |

⚠️ **Đây là API mới hơn, cần kiểm tra phiên bản Next.js của bạn hỗ trợ chưa.** Với `16.2.10` thì
nên có, nhưng hãy thử trước khi dựa vào nó. Nếu chưa có, cách của repo (proxy redirect) hoàn toàn ổn.

### 1.3 `permanentRedirect()` — 308 thay vì 307

```tsx
import { redirect, permanentRedirect } from 'next/navigation'

redirect('/orders')              // 307 Temporary — mặc định, đúng cho hầu hết trường hợp
permanentRedirect('/products')   // 308 Permanent — cho URL đã đổi vĩnh viễn
```

**Dùng `permanentRedirect` khi:** bạn đổi cấu trúc URL (`/product/:id` → `/products/:id`) và muốn
Google chuyển thứ hạng SEO sang URL mới.

⚠️ **Browser CACHE 308 rất lâu** (thường vĩnh viễn). Nếu bạn dùng nó nhầm, người dùng bị kẹt ở URL sai
và cách duy nhất là họ tự xoá cache. **Khi không chắc, dùng `redirect()` (307).**

### 1.4 `unstable_rethrow()` — cứu `redirect()` trong `try/catch`

Nhớ file `09`: `redirect()` throw, nên gọi nó trong `try/catch` là bug. Nhưng đôi khi bạn **buộc** phải:

```tsx
import { unstable_rethrow } from 'next/navigation'

export async function complexAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await doSomething()
    redirect('/success')            // throw NEXT_REDIRECT
  } catch (e) {
    unstable_rethrow(e)             // ⭐ re-throw nếu là sentinel của Next.js
    // Xuống được đây nghĩa là lỗi THẬT
    return { ok: false, message: 'Thất bại' }
  }
}
```

`unstable_rethrow` kiểm tra `e` có phải `NEXT_REDIRECT`/`NEXT_NOT_FOUND`/Suspense promise — nếu đúng
thì throw lại để framework xử lý.

⚖️ **Nhưng cấu trúc lại code vẫn tốt hơn.** 📄 Repo đang làm đúng — đặt `redirect()` **ngoài**
`try/catch`:

```tsx
try {
  const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
  await setSession(data.tokens, data.user._id)
} catch (e) {
  return { ok: false, message: errorMessage(e, 'Could not sign you in') }
}
redirect(redirectTo)                // ← NGOÀI try/catch ✅
```

Chỉ dùng `unstable_rethrow` khi logic phức tạp thật sự không cho phép tách.

### 1.5 `connection()` — chờ request thật

```tsx
import { connection } from 'next/server'

export default async function Page() {
  await connection()          // đảm bảo có request thật, không phải prerender
  const seed = Math.random()  // giờ mới an toàn dùng giá trị không xác định
  return <div>{seed}</div>
}
```

**Khi nào cần:** bạn muốn dùng giá trị không xác định (`Math.random()`, `Date.now()`) ở server và cần
chắc chắn nó không bị đóng băng vào output prerender.

📄 Repo chưa cần (mọi route đã dynamic), nhưng nó là công cụ đúng nếu bạn bật partial prerendering.

### 1.6 `useLinkStatus()` — pending state cho `<Link>`

Đã trình bày ở file `07`. Nhắc lại vì nó giải quyết một vấn đề thật của repo (phân trang không có
phản hồi):

```tsx
'use client'
import { useLinkStatus } from 'next/link'

function LinkSpinner() {
  const { pending } = useLinkStatus()
  return pending ? (
    <span className="ml-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
  ) : null
}
```

⚠️ **Phải là CON của `<Link>`** — cùng ràng buộc với `useFormStatus` (file `11`).

### 1.7 Preload pattern — khởi động fetch sớm

Đây là kỹ thuật tinh tế và rất hiệu quả:

```tsx
// lib/products/preload.ts
import { cache } from 'react'
import { apiFetch } from '@/lib/api/server-client'
import type { Product } from '@/types/product'

// cache() đảm bảo hai lời gọi cùng id chỉ fetch một lần trong một request (file 10)
export const getProduct = cache((id: string) => apiFetch<Product>(`/product/${id}`))

/** Khởi động fetch mà KHÔNG await — kết quả được cache() giữ lại. */
export function preloadProduct(id: string): void {
  void getProduct(id)
}
```

```tsx
// app/(store)/products/[id]/page.tsx
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // ⭐ Khởi động fetch product NGAY, rồi làm việc khác
  preloadProduct(id)

  // Việc này chạy SONG SONG với fetch product ở trên
  const currentUserId = await getClientId()

  // Lúc này product có thể đã về rồi
  const product = await getProduct(id)
  // ...
}
```

**Vì sao pattern này hữu ích:** nó song song hoá **mà không cần `Promise.all`**. Đặc biệt tốt khi
fetch nằm ở component con:

```tsx
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  preloadProduct(id)          // ⭐ con sẽ dùng, nhưng khởi động từ đây

  return (
    <>
      <ExpensiveStaticHeader />
      <Suspense fallback={<Skeleton />}>
        <ProductDetail id={id} />     {/* gọi getProduct(id) — đã có sẵn trong cache */}
      </Suspense>
    </>
  )
}
```

Không có `preload`, `ProductDetail` chỉ bắt đầu fetch khi React render tới nó — sau `ExpensiveStaticHeader`.

### 1.8 `cache()` vs `unstable_cache` — hai thứ khác nhau

| | `cache()` từ `react` | `unstable_cache` từ `next/cache` |
| --- | --- | --- |
| Phạm vi | **Một request** | **Nhiều request** (persistent) |
| Dùng cho | Dedupe trong một lần render | Cache dữ liệu qua các request |
| Invalidate | Tự hết khi request xong | `revalidateTag` / `revalidate` |
| Dùng được với `cookies()`? | ✅ Có | ❌ **Không** — nó không được đọc dynamic API |

```tsx
// ✅ cache(): dedupe getAccessPayload trong một request (file 10)
export const getAccessPayload = cache(async () => {
  const store = await cookies()          // ← cookies() OK trong cache()
  const token = store.get(COOKIE.ACCESS)?.value
  return token ? decodeJwt(token) : null
})

// ✅ unstable_cache: cache dữ liệu công khai qua nhiều request
import { unstable_cache } from 'next/cache'

export const getPublicProduct = unstable_cache(
  async (id: string) => apiFetch<Product>(`/product/${id}`),
  ['product'],                                        // key prefix
  { tags: ['products'], revalidate: 3600 },
)
```

⚠️ **`unstable_cache` KHÔNG được gọi `cookies()` bên trong.** Vì cache dùng chung cho mọi người dùng —
nếu nó đọc cookie, bạn sẽ cache dữ liệu của người này rồi trả cho người khác. Next.js chặn điều đó,
nhưng hãy hiểu **vì sao** (nhớ file `10`, mục "lỗi bảo mật nghiêm trọng nhất mà caching có thể gây ra").

### 1.9 `<Suspense key>` — re-suspend khi param đổi

```tsx
// ❌ Đổi trang: nội dung cũ hiện cho tới khi trang mới về (không có skeleton)
<Suspense fallback={<Skeleton />}>
  <ProductList page={page} />
</Suspense>

// ✅ key đổi → Suspense boundary reset → skeleton hiện lại
<Suspense key={page} fallback={<Skeleton />}>
  <ProductList page={page} />
</Suspense>
```

**Vì sao:** nhớ file `15` — đổi `key` làm React coi đó là component mới, unmount cái cũ. Với Suspense,
điều đó nghĩa là boundary "suspend lại" và hiện fallback.

⚖️ **Trade-off:** không có `key`, người dùng thấy dữ liệu cũ trong lúc chờ (thường **tốt hơn** —
giữ ngữ cảnh, file `07`). Có `key`, họ thấy skeleton (rõ ràng hơn là đang tải).

**Chọn theo tốc độ:** fetch nhanh (<300ms) → không `key` (mượt hơn). Fetch chậm → có `key`
(người dùng biết đang tải).

### 1.10 `notFound()` trong `generateMetadata`

```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const product = await apiFetch<Product>(`/product/${id}`)
    return { title: product.product_name, description: product.product_description ?? undefined }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()    // ⭐ 404 sớm, trước cả khi render page
    return { title: 'Sản phẩm' }
  }
}
```

**Lợi ích:** 404 được xác định **trước** khi bắt đầu stream (nhớ file `06`: không đổi được status sau
byte đầu). Và nhờ request memoization (file `10`), `page.tsx` không fetch lại.

---

## 2. ⭐ Mười lăm gotcha "trông như phải chạy"

### Nhóm Server/Client

**(1) `cookies().set()` không dùng được trong Server Component**

📄 `lib/auth/session.ts` có cả hai loại hàm, và sự khác biệt **không được ghi trong code**:

```tsx
// ✅ Gọi được ở BẤT KỲ ĐÂU (Server Component, Action, Route Handler)
export async function getAccessPayload(): Promise<JwtPayload | null> {
  const store = await cookies()
  return store.get(COOKIE.ACCESS)?.value ? decodeJwt(...) : null    // ĐỌC
}

// ⚠️ Chỉ gọi được trong Server Action hoặc Route Handler
export async function setSession(tokens: Tokens, clientId: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE.ACCESS, tokens.accessToken, { ... })              // GHI
}
```

Gọi `setSession` từ một Server Component → lỗi runtime:
```
Error: Cookies can only be modified in a Server Action or Route Handler
```

**Vì sao:** HTTP header (bao gồm `Set-Cookie`) phải gửi **trước** body. Server Component có thể đang
stream body rồi — quá muộn để set cookie.

**Đề xuất: ghi rõ trong code:**

```tsx
/**
 * Ghi cookie session.
 *
 * ⚠️ CHỈ gọi được từ Server Action hoặc Route Handler —
 * cookies().set() throw nếu gọi trong lúc render Server Component.
 */
export async function setSession(tokens: Tokens, clientId: string): Promise<void> {
```

**(2) `revalidatePath` không gọi được trong lúc render**

```tsx
// ❌ Lỗi
export default async function Page() {
  revalidatePath('/orders')      // Error: revalidatePath không dùng được trong render
  return <div>...</div>
}
```

Chỉ gọi trong Server Action hoặc Route Handler. Cùng lý do với cookie.

**(3) Server Component không thể có event handler**

```tsx
// ❌ Không có 'use client'
export default function Page() {
  return <button onClick={() => alert('hi')}>Click</button>
  // Error: Event handlers cannot be passed to Client Component props
}
```

Nhưng `<form action={serverAction}>` **được** — vì Server Action serialize thành ID (file `08`).
📄 Đây chính là cách `store-header.tsx` có nút Sign out mà không cần `'use client'`.

**(4) Mọi export trong file `'use server'` phải là async function**

```tsx
'use server'

export const MAX_ITEMS = 10                    // ❌ Error: chỉ được export async function
export function sync() { }                     // ❌ Error: phải async
export async function ok() { }                 // ✅
```

📄 Đây là lý do `lib/api/error-message.ts` **tồn tại như một file riêng**, và comment nói rõ:

```tsx
// Extract a user-facing message from a caught error: the backend's message when
// it's an ApiError, otherwise a caller-provided fallback. Shared by Server Actions
// (which, being 'use server', can only export async functions themselves).
export function errorMessage(e: unknown, fallback: string): string {
```

Không thể đặt `errorMessage` trong file action — nó là hàm sync. Comment này là ví dụ tốt về việc
ghi lại **ràng buộc kỹ thuật**, không phải mô tả code.

**(5) `'use client'` phải ở DÒNG ĐẦU TIÊN**

```tsx
// ❌ Không có tác dụng — im lặng, không lỗi
import { useState } from 'react'
'use client'

// ❌ Cũng không — comment ở trên cũng được, nhưng import thì không
/* eslint-disable */
'use client'      // ← cái này OK (comment không tính)
```

Directive phải trước **mọi statement**. Comment thì được. Nếu component "đột nhiên" báo lỗi hook,
kiểm tra vị trí directive trước tiên.

### Nhóm Routing

**(6) `searchParams` không có ở `layout.tsx`**

Đã nói ở file `09`. Đây là nguyên nhân bug `SearchBox` mất giá trị.

**(7) `generateStaticParams` không nhận `searchParams`**

Nó chỉ nhận `params` của segment cha. Logic phụ thuộc query string không dùng được ở đây.

**(8) Route group không tạo cấp URL — nhưng ảnh hưởng số dấu chấm của intercepting route**

Đã nói ở file `19`. Lỗi #1 khi dùng intercepting route.

**(9) Hai `page.tsx` cùng resolve một URL = lỗi build**

```
app/(store)/page.tsx        → /
app/(marketing)/page.tsx    → /     ❌
```

**(10) `notFound()` trong `layout.tsx` không render `not-found.tsx` cùng cấp**

Nó tìm lên trên. Vì `not-found.tsx` nằm *trong* layout đó — layout lỗi thì không render được con của nó.

### Nhóm Data & Cache

**(11) `fetch` trong Server Component được Next.js mở rộng; `axios` thì không**

```tsx
// ✅ Được memoize và cache (file 10)
await fetch(url, { next: { tags: ['products'] } })

// ❌ Không có memoization, không có Data Cache, không có tags
await axios.get(url)
```

📄 Repo dùng `fetch` — đúng. Nếu ai đó đổi sang axios "cho tiện", họ sẽ mất toàn bộ tầng cache mà
không có warning nào.

**(12) `unstable_cache` không đọc được `cookies()`** — mục 1.8.

**(13) `revalidatePath` với dynamic segment cần path CỤ THỂ**

```tsx
revalidatePath('/orders/[id]', 'page')     // ⚠️ invalidate MỌI order — có thể là điều bạn muốn
revalidatePath(`/orders/${orderId}`)       // ✅ chỉ order này
```

Dạng đầu dùng khi bạn thực sự muốn xoá cache của tất cả (ví dụ sau khi đổi layout của trang order).

**(14) `cache: 'force-cache'` + `cookies()` trong cùng route = fetch vẫn cache, nhưng route thành dynamic**

Hai tầng độc lập (file `10`). Fetch được cache; route không prerender được. Đây là hành vi **đúng**,
nhưng dễ tưởng là `force-cache` "không hoạt động".

### Nhóm React

**(15) `key` trên Fragment cần dạng dài**

```tsx
// ❌ Shorthand không nhận key
{items.map((i) => <> <dt>{i.k}</dt> <dd>{i.v}</dd> </>)}

// ✅ Dạng dài
{items.map((i) => (
  <React.Fragment key={i.k}>
    <dt>{i.k}</dt>
    <dd>{i.v}</dd>
  </React.Fragment>
))}
```

📄 Repo dùng một cách khác cho cùng vấn đề — `products/[id]/page.tsx`:

```tsx
{Object.entries(attrs).map(([k, v]) => (
  <div key={k} className="contents">      {/* display:contents → div biến mất khỏi layout */}
    <dt className="text-muted-foreground capitalize">{k}</dt>
    <dd>{String(v)}</dd>
  </div>
))}
```

`className="contents"` cho bạn một element để gắn `key` mà không phá layout grid — và HTML vẫn hợp lệ
(`<dl>` cho phép `<div>` bọc nhóm `<dt>`/`<dd>`). Giải pháp này tốt hơn Fragment vì nó **hợp lệ về HTML**.

---

## 3. ⭐ State management: có cần thư viện không?

Đây là câu hỏi kiến trúc gặp nhiều nhất khi lên App Router.

### Bảng quyết định

| Loại state | Giải pháp | Cần thư viện? |
| --- | --- | --- |
| Dữ liệu từ server để hiển thị | Server Component + `apiFetch` | ❌ |
| Tab, page, filter, search | URL `searchParams` | ❌ |
| Trạng thái form | `useActionState` + uncontrolled | ❌ |
| Optimistic update | `useOptimistic` | ❌ |
| State cục bộ một component | `useState` | ❌ |
| State cho một luồng nhiều bước | `useReducer` / FSM (file `18`) | ❌ |
| Theme, locale | Context | ❌ |
| **Cart count dùng chung header + page** | Context, hoặc revalidate layout | ❌ |
| **State client phức tạp nhiều component** (canvas, editor, drag-drop) | Zustand / Jotai | ✅ Có thể |
| **Polling/realtime với cache phức tạp** | TanStack Query | ✅ Có thể |
| **Offline-first / optimistic queue** | TanStack Query / Replicache | ✅ Có |

📄 **Repo này: không cần thư viện nào.** Và đó không phải sự thiếu sót — đó là kết quả của việc dùng
đúng công cụ có sẵn (file `05`: không có `createContext` nào, vì Server Component đọc dữ liệu trực tiếp).

### Khi nào TanStack Query vẫn có giá trị trong App Router

Ba trường hợp cụ thể:

**(1) Polling với cache phức tạp.** File `20` dùng `router.refresh()` cho order tracking — đơn giản và
đủ. Nhưng nếu bạn cần poll **nhiều** endpoint với interval khác nhau, dedupe giữa nhiều component, và
retry với backoff → TanStack Query làm việc đó tốt hơn code tay.

**(2) Infinite scroll.** `searchParams` không mô hình hoá tốt "đã tải 5 trang, giữ cả 5". TanStack
Query's `useInfiniteQuery` được thiết kế cho đúng việc này.

**(3) Mutation queue offline.** Nếu app phải hoạt động khi mất mạng và đồng bộ lại sau — Server Actions
không có cơ chế đó.

⚖️ **Nhưng cái giá là thật:** bạn thêm ~13KB, thêm một tầng cache **song song** với 4 tầng cache của
Next.js (file `10`), và phải quyết định cái nào là nguồn sự thật. **Đừng thêm nó "cho tiện".**

### Khi nào Zustand/Jotai có giá trị

Khi có **state client phức tạp** không thuộc về server và không mô hình hoá được bằng URL:

- Editor (undo/redo stack, selection, clipboard)
- Canvas / drag-drop (vị trí, zoom, layer)
- Wizard rất dài với nhánh phức tạp (nhưng cân nhắc FSM trước — file `18`)

📄 Với repo này, **không có ca nào**. Nếu sau này thêm "builder trang shop" thì có.

> **Quy tắc:** trước khi thêm state library, hỏi **ba** câu:
> 1. State này có thuộc về server không? → Server Component
> 2. Nó có thuộc về URL không? → `searchParams`
> 3. Nó có thể ở cục bộ trong một component không? → `useState`
>
> Nếu cả ba đều "không" **và** có ≥3 component không cùng cây cần nó — lúc đó mới cân nhắc.

---

## 4. Chia sẻ type với backend

📄 Repo có một cơ hội bị bỏ qua. Cấu trúc thư mục:

```
Ecommerce-wokspace/
├── Ecommerce-Nextjs/          ← repo này
│   └── types/                 ← Product, Order, Cart, Comment, Discount... viết TAY
└── E-Commerce-NodeJS/         ← backend
    └── (models/DTO tương ứng)
```

**`types/order.ts`, `types/product.ts`, `types/cart.ts` là bản sao thủ công của DTO backend.**
Khi backend đổi một field, frontend **không biết** — và bạn chỉ phát hiện ở runtime (nhớ file `21`:
`apiFetch<Order>` là *lời hứa*, không phải *bảo đảm*).

### Ba lựa chọn, theo mức độ đầu tư

**Lựa chọn 1 — Validate ở ranh giới bằng Zod (đã trình bày ở file `21`)**

Không cần đổi gì ở backend. Type vẫn viết tay, nhưng **được kiểm tra ở runtime**:

```tsx
const order = await apiFetch(`/order/${id}`, { auth: true, schema: orderSchema })
```

✅ **Đây là lựa chọn đúng cho hầu hết trường hợp.** Backend đổi field → lỗi rõ ràng ở `apiFetch` với
log chỉ đúng field nào sai.

**Lựa chọn 2 — Package dùng chung trong workspace**

📄 Repo **đã có** `pnpm-workspace.yaml` nhưng nó không khai báo package nào:

```yaml
allowBuilds:
  sharp: set this to true or false
  unrs-resolver: set this to true or false
ignoredBuiltDependencies:
  - sharp
  - unrs-resolver
```

Nếu di chuyển hai project vào cùng một workspace thật:

```yaml
# Ecommerce-wokspace/pnpm-workspace.yaml
packages:
  - 'Ecommerce-Nextjs'
  - 'E-Commerce-NodeJS'
  - 'packages/*'
```

```
packages/shared-types/
├── package.json          { "name": "@shop/types", "main": "src/index.ts" }
└── src/
    ├── order.ts          ← Zod schema + z.infer, DÙNG CHUNG
    ├── product.ts
    └── index.ts
```

Backend dùng schema để validate response; frontend dùng cùng schema để validate request nhận được.
**Một nguồn sự thật thật sự.**

⚖️ **Cái giá:** phải tái cấu trúc hai repo thành monorepo, thiết lập build order, và backend (Express,
có thể là JavaScript) phải dùng được TypeScript type. **Đầu tư lớn.**

**Lựa chọn 3 — Sinh type từ OpenAPI spec**

Nếu backend xuất OpenAPI/Swagger:

```bash
pnpm add -D openapi-typescript
pnpm exec openapi-typescript http://localhost:5000/api-docs/swagger.json -o types/api-generated.ts
```

```json
// package.json
{
  "scripts": {
    "types:api": "openapi-typescript $BACKEND_URL/api-docs/swagger.json -o types/api-generated.ts"
  }
}
```

Chạy nó trong CI và **fail build nếu type đổi** mà chưa được commit:

```yaml
- run: pnpm types:api
- run: git diff --exit-code types/api-generated.ts || (echo "❌ API type đã đổi — chạy pnpm types:api và commit" && exit 1)
```

✅ **Đây là lựa chọn tốt nhất nếu backend đã có OpenAPI.** Bạn được type chính xác, tự động, và CI
cảnh báo khi contract đổi.

### Khuyến nghị cho repo này

| Nếu | Thì làm |
| --- | --- |
| Backend có OpenAPI/Swagger | **Lựa chọn 3** — rẻ nhất, hiệu quả nhất |
| Không có OpenAPI, không muốn đổi hạ tầng | **Lựa chọn 1** — Zod ở ranh giới |
| Đang có kế hoạch monorepo | **Lựa chọn 2** |

**Đừng để nguyên trạng.** Type viết tay không được kiểm tra là một bug đang chờ xảy ra — và nó sẽ xuất
hiện dưới dạng `TypeError` trong lúc render, ở production (file `16`).

---

## 5. Mười tip nhỏ nhưng đáng

**(1) `tabular-nums` cho mọi con số thay đổi**

📄 Repo dùng đúng ở `cart-line.tsx`, `order-card.tsx`:

```tsx
<span className="w-8 text-center tabular-nums">{quantity}</span>
<span className="font-semibold tabular-nums">{toPriceString(total)}</span>
```

Không có nó, `1` hẹp hơn `8` → con số "nhảy" khi thay đổi. Chi tiết nhỏ tạo cảm giác chuyên nghiệp.

**(2) `line-clamp-N` thay vì cắt chuỗi bằng JS**

```tsx
// ❌ Cắt bằng JS — không biết chiều rộng thật, cắt sai chỗ
{product.product_name.slice(0, 40)}...

// ✅ CSS — cắt đúng theo chiều rộng thật, có "..." tự động
<p className="line-clamp-1 font-medium">{product.product_name}</p>
```

📄 `product-card.tsx` dùng đúng.

**(3) `fieldset disabled` để khoá cả nhóm field**

📄 `create-product-form.tsx`:

```tsx
<fieldset disabled={!uploadResult} className="space-y-4 disabled:opacity-60">
```

Một dòng khoá **mọi** input con — và screen reader hiểu (khác `pointer-events-none`, file `23`).

**(4) `aria-disabled` + `tabIndex={-1}` cho link, `disabled` cho button**

`<a>` không có `disabled`. Nhớ bảng ở file `23`.

**(5) `void` để nói rõ "tôi cố ý không await"**

```tsx
void getProduct(id)              // ⭐ ESLint không cảnh báo, người đọc hiểu là có chủ đích
getProduct(id)                   // ⚠️ trông như quên await
```

**(6) `satisfies` cho object config** — file `21`, giữ literal type.

**(7) `as const` cho array dùng làm union** — file `21`.

**(8) `Number.isFinite` thay `isFinite`**

```js
isFinite('123')          // true  — ép kiểu, thường không phải điều bạn muốn
Number.isFinite('123')   // false — nghiêm ngặt
```

📄 `lib/products/price.ts` và `catalog-query.ts` dùng đúng `Number.isFinite`.

**(9) `??=` cho khởi tạo lazy**

📄 `lib/comments/group.ts`:

```tsx
;(repliesByParent[c.parentId] ??= []).push(c)
```

Gọn hơn `if (!x[k]) x[k] = []; x[k].push(...)`. Chú ý dấu `;` ở đầu — cần thiết khi dòng trước không
có `;` và dòng này bắt đầu bằng `(`.

**(10) `Object.fromEntries(formData)` có giới hạn**

```tsx
Object.fromEntries(formData)     // field trùng tên → chỉ giữ giá trị CUỐI
formData.getAll('images')        // ✅ lấy tất cả
```

📄 Repo dùng đúng cả hai chỗ: `Object.fromEntries` cho form thường, `getAll('images')` cho multi-file.

---

## 6. Ba thứ nên xoá / dọn trong repo

| # | Việc | Lý do | Chương |
| --- | --- | --- | --- |
| 1 | `console.log('🚀 ~ files:', files)` | Log PII (tên file người dùng) | `11`, `24` |
| 2 | `formatDate` trùng ở `comment-section.tsx` và `discount-list.tsx` | Bản copy y hệt của `lib/orders/display.ts` | `17`, `27` |
| 3 | `types/api.ts` → `RefreshData` không được dùng ở đâu | Dead code — grep xác nhận | — |

```bash
# Tìm export không dùng
pnpm add -D knip
pnpm exec knip
```

`knip` tìm file, export, và dependency không dùng. Chạy nó một lần sau mỗi sprint lớn — dead code
tích tụ nhanh hơn bạn tưởng.

---

## 7. Best Practices

1. **`after()` cho việc không cần người dùng chờ** — analytics, log, email. Luôn `try/catch` bên trong.

2. **`unauthorized()`/`forbidden()` cho HTTP status đúng** thay vì redirect — nếu phiên bản Next.js
   của bạn hỗ trợ. Kiểm tra trước khi dựa vào.

3. **`redirect()` (307) mặc định; `permanentRedirect()` (308) chỉ khi URL đổi vĩnh viễn.** 308 bị
   cache rất lâu.

4. **Cấu trúc code để không cần `unstable_rethrow`.** Đặt `redirect()` ngoài `try/catch`.

5. **Preload pattern (`void getX(id)`) để song song hoá** mà không cần `Promise.all` — đặc biệt khi
   fetch ở component con.

6. **`cache()` cho dedupe một request; `unstable_cache` cho persistent.** Cái sau không đọc được cookie.

7. **`<Suspense key>` khi fetch chậm; bỏ `key` khi nhanh.** Trade-off giữa rõ ràng và mượt.

8. **Ghi rõ ràng buộc runtime trong doc comment.** `setSession` chỉ gọi được từ Action/Route Handler —
   viết nó ra.

9. **Trước khi thêm state library, đi qua ba câu hỏi ở mục 3.**

10. **Đừng để type viết tay không được kiểm tra.** Zod ở ranh giới là tối thiểu; OpenAPI codegen là
    tốt nhất nếu có.

11. **`tabular-nums`, `line-clamp`, `fieldset disabled`** — ba class nhỏ, tác động rõ.

12. **Chạy `knip` định kỳ** để dọn dead code.

---

## Tự kiểm tra

1. Vì sao `cookies().set()` không dùng được trong Server Component?
2. Vì sao `lib/api/error-message.ts` phải là một file riêng?
3. `'use client'` đặt sau `import` thì sao? Có lỗi không?
4. `cache()` khác `unstable_cache` ở ba điểm nào?
5. Vì sao `unstable_cache` không được đọc `cookies()`?
6. Preload pattern giải quyết vấn đề gì mà `Promise.all` không giải quyết được?
7. Khi nào nên có `<Suspense key>`, khi nào không?
8. Vì sao `permanentRedirect` nguy hiểm nếu dùng sai?
9. Ba câu hỏi phải trả lời trước khi thêm state library?
10. Ba lựa chọn chia sẻ type với backend — chọn nào cho repo này và vì sao?
11. Vì sao `className="contents"` tốt hơn `React.Fragment key`?

---

## 🎓 Hết bộ tài liệu

**30 chương**, từ cơ chế Fiber bên trong React tới deployment và bảo mật ở production.

Nhưng kiến thức chỉ là một phần. Bước tiếp theo là biến nó thành **năng lực đã kiểm chứng**.

➡️ Tiếp theo: `31-lo-trinh-senior.md` — bảng tự đánh giá, lộ trình 24 tuần, và 3 việc làm ngay hôm nay.
