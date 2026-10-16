# 16. Error Boundaries & Resilience nâng cao

> **Mục tiêu:** biết chính xác error boundary bắt được gì và **không** bắt được gì, thiết kế được một
> chiến lược lỗi nhiều tầng, và phân loại lỗi thành các hành động UI cụ thể.
>
> Phiên bản: React 19.2, Next.js 16.2 (App Router).

---

## 1. Overview

### Vấn đề: "xử lý lỗi" không phải một việc

Một app thật có nhiều **loại lỗi khác nhau**, và chúng cần cách xử lý khác nhau:

| Loại lỗi | Ví dụ trong repo | Ai bắt được? |
| --- | --- | --- |
| **Lỗi nghiệp vụ dự đoán được** | "Wrong password", "Order already cancelled" | `try/catch` + trả `ActionState` |
| **Resource không tồn tại** | Product ID không có | `notFound()` → `not-found.tsx` |
| **Lỗi render (server hoặc client)** | `order.order_products.flatMap` với data sai hình dạng | `error.tsx` |
| **Lỗi trong `startTransition` / Server Action** | Action throw `Error` | `error.tsx` (React 19 đẩy lên boundary) |
| **Lỗi trong event handler** | `onClick` throw | ❌ **KHÔNG AI** — phải tự try/catch |
| **Promise không await** | `fetch().then()` reject | ❌ **KHÔNG AI** — chỉ có `unhandledrejection` |

**Hai dòng cuối là chỗ mọi người bị bất ngờ.** Error boundary **không** bắt lỗi trong event handler và
**không** bắt promise rejection trôi nổi. Đây là giới hạn kiến trúc, không phải thiếu sót.

---

## 2. Mental Model

### 🧠 Error Boundary như một cầu chì, không phải một cái lưới

Cầu chì chỉ bảo vệ **mạch điện đi qua nó**. Error boundary chỉ bắt lỗi xảy ra **trong lúc React đang
render hoặc commit cây con của nó**:

```
┌─ <ErrorBoundary> ────────────────────────────────┐
│   ✅ BẮT ĐƯỢC:                                    │
│   • throw trong thân function component           │
│   • throw trong useEffect / useLayoutEffect       │
│   • throw trong render / lifecycle của class      │
│   • Server Component throw / promise reject       │
│   • throw trong startTransition / action (R19)    │
│                                                   │
│   ❌ KHÔNG BẮT ĐƯỢC:                              │
│   • throw trong onClick / onChange / onSubmit     │
│   • throw trong setTimeout / setInterval          │
│   • Promise reject không được await               │
│   • lỗi trong chính ErrorBoundary đó              │
└───────────────────────────────────────────────────┘
```

**Vì sao event handler không được bắt?** Handler chạy **ngoài** chu trình render/commit. Browser gọi
listener, React chỉ dispatch — nếu hàm throw, exception nổi lên `window.onerror`.

**Ngoại lệ quan trọng:** nếu bạn bọc công việc trong `startTransition` (hoặc truyền action vào
`<form action>` / `useActionState`), React 19 coi lỗi đó là một phần của render và đẩy lên error
boundary gần nhất:

```tsx
'use client'
const [pending, startTransition] = useTransition()

// ❌ lỗi rơi ra window.onerror, UI không biết gì
<Button onClick={() => { throw new Error('boom') }} />

// ✅ lỗi nổi lên error.tsx gần nhất
<Button onClick={() => startTransition(async () => { await addToCart(skuId) })} />
```

📄 Ý nghĩa cụ thể cho repo. `components/store/comment-section.tsx`:

```tsx
const toggle = (id: string) => setReplyOpen((cur) => (cur === id ? null : id))
// ...
<Button variant="ghost" size="xs" onClick={onToggle}>
```

Nếu `onToggle` throw (ví dụ một refactor làm nó đọc `comment.user.name` khi `user` là `undefined`),
**không có `error.tsx` nào bắt được**. Người dùng bấm nút, không có gì xảy ra, console có lỗi đỏ.

---

## 3. How It Works — cơ chế bắt lỗi ở tầng Fiber

Nối tiếp file `15`: khi `beginWork` hoặc `completeWork` throw, React bắt exception trong work loop:

```js
// Rút gọn từ ReactFiberWorkLoop
do {
  try {
    workLoopConcurrent()
    break
  } catch (thrownValue) {
    handleThrow(root, thrownValue)   // ← phân loại giá trị bị throw
  }
} while (true)
```

| Giá trị throw | React làm gì |
| --- | --- |
| Một **Promise** (thenable) | Suspend → tìm `<Suspense>` gần nhất, hiện fallback |
| Bất kỳ giá trị khác (`Error`...) | Đi lên theo `fiber.return` tìm error boundary gần nhất |

`redirect()`, `notFound()`, `forbidden()` của Next **cũng chỉ là `throw` một Error đặc biệt** (có
`digest` như `NEXT_REDIRECT;...` hay `NEXT_HTTP_ERROR_FALLBACK;404`). React không biết gì về chúng.
Next xử lý bằng hai cách: boundary "not found/forbidden" của Next nằm **bên trong** `error.tsx` (thứ
tự: `layout` → `template` → `error` → `loading` → `not-found` → `page`) nên bắt sentinel trước; và
error boundary của Next **ném lại** mọi lỗi router (`isNextRouterError`) trong
`getDerivedStateFromError` để chúng đi tiếp lên redirect boundary. Class boundary tự viết không có
bước ném lại này → nuốt nhầm (mục 10.2).

**Ba hệ quả:**

**(a) Suspense và Error Boundary là CÙNG một cơ chế.** "Throw rồi tìm boundary gần nhất đi lên". Throw
Promise → Suspense, throw Error → Error Boundary. Vì vậy chúng compose tự nhiên (mục 9).

**(b) Vì sao `redirect()` / `notFound()` không được nằm trong `try`.** `catch` của bạn bắt sentinel
trước Next. Nếu buộc phải `try/catch` rộng, dùng `unstable_rethrow`:

```tsx
import { notFound, unstable_rethrow } from 'next/navigation'

try {
  const product = await apiFetch<Product>(`/product/${id}`)
  if (!product) notFound()
} catch (e) {
  unstable_rethrow(e)          // ✅ trả lại lỗi nội bộ của Next (notFound, redirect...) cho Next
  console.error(e)
}
```

**(c) Vì sao boundary phải ở TRÊN chỗ lỗi.** React đi theo `fiber.return` (lên cha). Boundary không bắt
được lỗi của chính nó.

---

## 4. React 19: lỗi được báo cáo thế nào

React 18 **re-throw** lỗi đã bị boundary bắt, nên dev thấy cùng một lỗi log 2–3 lần. React 19 sửa:

| Loại | React 19 làm gì | Hook ở root |
| --- | --- | --- |
| **Caught** — boundary đã bắt | `console.error` **một lần**, kèm component stack | `onCaughtError(error, { componentStack, errorBoundary })` |
| **Uncaught** — không boundary nào bắt | `window.reportError` (không re-throw) | `onUncaughtError(error, { componentStack })` |
| **Recoverable** — React tự hồi phục (vd. hydration mismatch → render lại ở client) | `window.reportError` | `onRecoverableError` |

Trong app React thuần, bạn gắn monitoring ngay ở root:

```tsx
// main.tsx (Vite/SPA — KHÔNG áp dụng cho Next)
createRoot(document.getElementById('root')!, {
  onCaughtError: (error, info) => sendToMonitoring({ error, stack: info.componentStack, caught: true }),
  onUncaughtError: (error, info) => sendToMonitoring({ error, stack: info.componentStack }),
  onRecoverableError: (error) => sendToMonitoring({ error, level: 'warn' }),
}).render(<App />)
```

⚠️ **Trong Next.js bạn không tự gọi `createRoot`/`hydrateRoot`** — Next làm việc đó. Các điểm gắn
tương đương:

| Muốn bắt | Dùng |
| --- | --- |
| Lỗi server (RSC, Route Handler, Server Action, proxy) | `onRequestError` trong `instrumentation.ts` |
| Lỗi client toàn cục (`error`, `unhandledrejection`) | `instrumentation-client.ts` (chạy trước khi app interactive) |
| Lỗi bị boundary bắt | `useEffect` trong `error.tsx` / fallback của `unstable_catchError` |

---

## 5. Ba tầng lỗi nên có trong repo này

> 📄 Hiện repo **chưa có** `error.tsx`, `global-error.tsx` hay `not-found.tsx` nào. Mọi đoạn ở mục
> này là **đề xuất**.

### Tầng 1 — `try/catch` trong page: lỗi dự đoán được

📄 Pattern hiện tại, lặp ở nhiều trang. `app/(store)/orders/page.tsx` (rút gọn):

```tsx
export default async function OrdersPage() {
  let orders: Order[] = []
  let error: string | null = null
  try {
    const result = await apiFetch<OrdersResult>('/order', { auth: true })
    orders = result.data ?? []
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load your orders'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your orders</h1>
      {error ? <p className="text-sm text-destructive">{error}</p>
        : orders.length === 0 ? <p>No orders yet. …</p>
        : <div className="space-y-4">{orders.map((o) => <OrderCard key={o._id} order={o} />)}</div>}
    </div>
  )
}
```

✅ Tiêu đề **vẫn hiện**, message **theo ngữ cảnh**, phân biệt được lỗi / rỗng / có dữ liệu.

**Nhưng nó không bắt được lỗi NGOÀI `try`.** 📄 `components/store/order-card.tsx`:

```tsx
const products: OrderProduct[] = order.order_products.flatMap((s) => s.item_products)
const code = order._id.slice(-6).toUpperCase()
```

Nếu backend trả `order_products: null`, `.flatMap` throw `TypeError` trong lúc **render** — `try` ở page
đã xong từ lâu. Không có `error.tsx` → production hiện trang "Application error" mặc định của Next.

⚖️ **Defensive (`?? []`) hay fail-fast?**

| Defensive (`?? []`) | Fail-fast (để nó throw) |
| --- | --- |
| ✅ Người dùng vẫn thấy phần còn lại | ❌ Boundary hiện, mất ngữ cảnh |
| ❌ **Che bug** — order hiện với 0 sản phẩm | ✅ Bug lộ ra, được báo lên monitoring |
| Cho: field **optional** theo hợp đồng API | Cho: field **bắt buộc** theo hợp đồng |

📄 Repo đã làm đúng ranh giới này. `types/order.ts` khai báo `order_shipping?` / `order_payment?` là
optional nhưng `order_products: ShopOrderNew[]` là bắt buộc. Và `app/(store)/orders/[id]/page.tsx`:

```tsx
const shipping = order.order_shipping ?? {}                       // optional → ?? đúng
<p>Method: {order.order_payment?.method ?? '—'}</p>               // optional → ?. đúng
```

→ `??` cho field optional; `order_products` thiếu là vi phạm hợp đồng → để nó nổ. (Cùng file còn
`order.order_checkout ?? {...}` dù type khai báo bắt buộc — một chỗ defensive thừa, che bug nếu backend
quên gửi tổng tiền.)

### Tầng 1b — `notFound()` / `forbidden()` / `unauthorized()`: "không có" khác "lỗi"

📄 `app/(store)/products/[id]/page.tsx` hiện gộp mọi thứ vào một nhánh — ID sai cũng như API sập:

```tsx
// ❌ hiện tại: ID không tồn tại → HTTP 200 + "Product not found" (soft 404, Google index trang rác)
if (error || !detail) return <p className="text-sm text-destructive">{error ?? 'Product not found'}</p>

// ✅ tách theo status
import { notFound } from 'next/navigation'
try {
  detail = normalizeProductDetail(await apiFetch<unknown>(`/product/${id}`))
} catch (e) {
  if (e instanceof ApiError && e.status === 404) notFound()   // không bị catch nuốt: đây là catch ngoài cùng
  throw e                                                      // lỗi thật → error.tsx
}
```

| Hàm | Render file | HTTP status | Ghi chú |
| --- | --- | --- | --- |
| `notFound()` | `not-found.tsx` gần nhất | **404** nếu gọi trước khi stream; **200 + `<meta name="robots" content="noindex">`** nếu đã stream | Muốn 404 thật → gọi trước mọi `<Suspense>`/`loading.tsx` |
| `forbidden()` | `forbidden.tsx` | 403 | Cần `experimental.authInterrupts: true`; dùng được trong Server Component, Server Function, Route Handler |
| `unauthorized()` | `unauthorized.tsx` | 401 | Như trên |

(Route không khớp URL nào → `app/not-found.tsx`; dự án nhiều root layout có thể dùng
`global-not-found.tsx` — experimental.)

### Tầng 2 — `error.tsx`: lưới an toàn cho lỗi không dự đoán được

```tsx
// app/(store)/error.tsx
'use client' // Error boundary bắt buộc là Client Component

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, Home } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

export default function StoreError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    // `digest` là cầu nối duy nhất tới log phía server
    sendToMonitoring({ message: error.message, digest: error.digest, boundary: 'store' })
  }, [error])

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h2 className="text-xl font-semibold">Không tải được nội dung này</h2>
      <div className="flex justify-center gap-2">
        <Button onClick={() => unstable_retry()}>
          <RotateCcw className="size-4" /> Thử lại
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          <Home className="size-4" /> Về trang chủ
        </Link>
      </div>
      {error.digest ? <p className="text-xs text-muted-foreground">Mã lỗi: {error.digest}</p> : null}
    </div>
  )
}
```

⚠️ **Đặt tên hàm monitoring là `sendToMonitoring`, KHÔNG phải `reportError`.** `reportError` là một
hàm global có sẵn của browser — nó dispatch một `error` event lên `window`. Nếu bạn vừa tự định nghĩa
`reportError` sai chỗ, vừa có listener `window.addEventListener('error', …)` gọi lại nó, bạn có vòng lặp.

**Bốn chi tiết quan trọng:**

**(1) `unstable_retry` (Next 16.2) vs `reset`.**

| | `unstable_retry()` | `reset()` |
| --- | --- | --- |
| Làm gì | **Re-fetch** + render lại cây con của boundary trong một Transition (state Client Component ngoài boundary giữ nguyên) | Chỉ xoá state lỗi, render lại cây con **không re-fetch** |
| Hồi phục lỗi Server Component? | ✅ | ❌ — server trả lại đúng payload lỗi cũ |
| Khi nào dùng | Mặc định | Hiếm: lỗi thuần client, muốn render lại mà không gọi server |

`unstable_retry` là prop mới của Next 16.2 (cho cả `error.tsx` và `global-error.tsx`); `reset` vẫn
được truyền vào nhưng docs khuyến nghị `unstable_retry` cho hầu hết trường hợp. Cả hai vẫn chỉ giúp với lỗi **tạm
thời** (timeout, network blip). Lỗi do dữ liệu xấu sẽ lặp y hệt → luôn kèm đường thoát thứ hai (link
về trang chủ).

**(2) `error.digest`.** Ở production, Next **xoá** message/stack của lỗi từ Server Component trước khi
gửi xuống client (tránh lộ đường dẫn file, connection string), thay bằng message chung + `digest`:

```
Server log:  [TypeError: Cannot read properties of null (reading 'flatMap')] digest: '1234567890'
Client sees: Error { message: 'An error occurred in the Server Components render…', digest: '1234567890' }
```

Hiện `digest` cho người dùng → họ báo lại → bạn tra đúng lỗi trong log server. Lỗi từ Client Component
thì giữ nguyên message gốc.

**(3) Phạm vi.** `error.tsx` bọc `page.tsx`, `loading.tsx`, `not-found.tsx` và layout **con** —
nhưng **không** bọc `layout.tsx` / `template.tsx` **cùng cấp**. Nên khi page lỗi, header/footer của
`(store)/layout.tsx` vẫn hiện. Nhưng nếu chính `StoreHeader` throw, `(store)/error.tsx` không bắt được
→ cần boundary ở cấp trên (`app/error.tsx` hoặc `global-error.tsx`).

**(4) Muốn đẩy lỗi lên boundary cha?** `throw error` ngay trong component `error.tsx`.

### Tầng 3 — `global-error.tsx`: khi chính root layout lỗi

```tsx
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    // ⚠️ global-error THAY THẾ root layout → PHẢI tự render <html> và <body>
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}>
        <title>Ứng dụng gặp sự cố</title>
        <h2>Ứng dụng gặp sự cố</h2>
        <button onClick={() => unstable_retry()}>Tải lại</button>
        {error.digest ? <p style={{ fontSize: 12, color: '#999' }}>Mã lỗi: {error.digest}</p> : null}
      </body>
    </html>
  )
}
```

- **Tự render `<html>`/`<body>`** vì nó thay thế `app/layout.tsx`.
- **CSS từ root layout không còn** (`globals.css` được import trong layout) → import CSS riêng hoặc
  dùng inline style như trên.
- **Không export `metadata`** được (nó là Client Component) → dùng thẻ `<title>` của React 19.
- Từ Next 15.2, `global-error` cũng hiện ở development.

### Cấu trúc đề xuất

```
app/
├── global-error.tsx          ← root layout lỗi
├── (store)/
│   ├── error.tsx             ← lỗi storefront; header/footer của (store)/layout vẫn hiện
│   ├── not-found.tsx
│   └── orders/error.tsx      ← tuỳ chọn, message riêng cho orders
└── (seller)/seller/error.tsx
```

---

## 6. ⭐ Lỗi mà không boundary nào bắt — và cách xử lý

### 6.1 Event handler

Hai cách: **(a)** tự `try/catch` và set state/toast, **(b)** bọc trong `startTransition` để lỗi lên
boundary (mục 2). Với handler đồng bộ nhỏ, một wrapper có tên là gọn nhất:

```tsx
// lib/errors/guard.ts
import { toast } from 'sonner'

/** Error boundary KHÔNG bắt lỗi trong handler — đây là tầng phòng thủ cho handler làm việc thật. */
export function guard<A extends unknown[]>(
  fn: (...args: A) => void | Promise<void>,
  fallbackMessage = 'Không thực hiện được hành động này',
) {
  return async (...args: A) => {
    try {
      await fn(...args)            // await → bắt luôn promise rejection
    } catch (e) {
      console.error('[guard]', e)
      toast.error(fallbackMessage)
    }
  }
}
```

```tsx
<Button onClick={guard(async () => {
  await navigator.clipboard.writeText(String(order.order_checkout.totalCheckout))
  toast.success('Đã copy')
}, 'Không copy được tổng tiền')}>
  Copy total
</Button>
```

⚖️ **Đừng bọc mọi handler.** `onClick={() => setStep(1)}` không có gì để throw.

### 6.2 Promise không await → lưới toàn cục ở `instrumentation-client.ts`

```tsx
// ❌ Rejection này không ai bắt
useEffect(() => {
  fetch('/api/track').then((r) => r.json()).then(setData)
}, [])
```

Next có file convention riêng cho code chạy ở client **trước khi app interactive** — chỗ đúng cho
listener toàn cục (không cần một "effect component" `return null` trong layout):

```ts
// instrumentation-client.ts (ở root project, cạnh app/)
window.addEventListener('error', (e) => {
  sendToMonitoring({ kind: 'window.error', message: e.message, source: e.filename })
})
window.addEventListener('unhandledrejection', (e) => {
  sendToMonitoring({
    kind: 'unhandledrejection',
    message: e.reason instanceof Error ? e.reason.message : String(e.reason),
  })
})
```

Và phía server:

```ts
// instrumentation.ts
import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest = typeof err === 'object' && err && 'digest' in err ? String(err.digest) : undefined
  await sendToMonitoring({ message: (err as Error).message, digest, path: request.path, ...context })
}
```

`digest` ở đây khớp với `error.digest` mà `error.tsx` nhận được → nối được hai đầu.

### 6.3 Lỗi trong Server Action

Server Action có **hai** cách báo lỗi, ý nghĩa khác nhau hoàn toàn:

```tsx
// A — TRẢ VỀ lỗi: nghiệp vụ, mong đợi được
return { ok: false, message: 'Wrong password' }
// → useActionState nhận state mới → form hiện message → KHÔNG boundary nào bị kích hoạt

// B — THROW: lỗi thật, không mong đợi
throw new Error('Database connection lost')
// → action chạy trong Transition → nổi lên error.tsx gần nhất
```

📄 Repo dùng **cách A** cho mọi lỗi nghiệp vụ — đúng. `actions/auth.actions.ts`:

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
  redirect(redirectTo)          // ✅ ngoài try
}
```

"Sai mật khẩu" là kết quả hợp lệ của đăng nhập, không phải lỗi hệ thống — người dùng cần ở lại form.

⚠️ **Hệ quả: lỗi thật cũng bị biến thành message thân thiện.** 📄 `lib/api/error-message.ts`:

```tsx
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}
```

Nếu `e` là `TypeError` do bug trong `setSession` → người dùng thấy "Could not sign you in" → **không ai
biết có bug**. Sửa bằng một dòng:

```tsx
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message   // lỗi nghiệp vụ → an toàn để hiện
  console.error('[unexpected]', e)              // ✅ bug → log/monitoring trước khi che đi
  return fallback
}
```

---

## 7. Phân loại lỗi thành hành động UI

**Không phải lỗi nào cũng nên hiện giống nhau.** 📄 `lib/api/http.ts` đã có `ApiError` mang `status`
(throw ở `new ApiError(res.status, message)`), nhưng repo **chưa đọc `status` ở đâu cả**.

```tsx
// lib/errors/classify.ts
import { ApiError } from '@/lib/api/http'

export type ErrorAction =
  | { kind: 'field'; message: string }      // hiện cạnh field
  | { kind: 'toast'; message: string }      // thông báo ngắn, không chặn
  | { kind: 'retry'; message: string }      // hiện nút "Thử lại"
  | { kind: 'reauth' }                      // đẩy về /login
  | { kind: 'forbidden'; message: string }  // không có quyền — đừng cho thử lại
  | { kind: 'notFound' }                    // gọi notFound()
  | { kind: 'fatal'; message: string }      // bug → để error.tsx xử lý

export function classifyError(e: unknown, fallback: string): ErrorAction {
  if (!(e instanceof ApiError)) {
    console.error('[unexpected]', e)
    return { kind: 'fatal', message: fallback }
  }
  const s = e.status
  if (s === 400 || s === 422) return { kind: 'field', message: e.message }
  if (s === 401) return { kind: 'reauth' }
  if (s === 403) return { kind: 'forbidden', message: e.message }
  if (s === 404) return { kind: 'notFound' }
  if (s === 409) return { kind: 'toast', message: e.message }   // conflict — thử lại vô nghĩa
  if (s === 429) return { kind: 'retry', message: 'Bạn thao tác quá nhanh. Thử lại sau ít giây.' }
  if (s >= 500) return { kind: 'retry', message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại.' }
  return { kind: 'toast', message: e.message || fallback }
}
```

**Áp vào `cancelOrderAction`** (📄 `actions/order.actions.ts` hiện chỉ `return errorMessage(...)`):

```tsx
export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) return { ok: false, message: 'Missing order id' }

  try {
    await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    const action = classifyError(e, 'Could not cancel the order')

    // redirect() trong CATCH là được — nó không nằm trong một `try` nào khác
    if (action.kind === 'reauth') redirect(`/login?redirect=/orders/${orderId}`)

    // 409 "already cancelled" = người dùng đã đạt được điều họ muốn → đồng bộ UI, báo nhẹ
    if (action.kind === 'toast') {
      revalidatePath('/orders')
      revalidatePath(`/orders/${orderId}`)
      return { ok: true, message: action.message }
    }
    return { ok: false, message: 'message' in action ? action.message : 'Không hủy được đơn hàng' }
  }

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)   // repo hiện thiếu dòng này (bug ở file 10)
  return { ok: true, message: 'Order cancelled' }
}
```

Với bug ở file `10` (trang chi tiết không được revalidate → nút Cancel còn → bấm lại → 409), xử lý 409
như trên khiến lần bấm thứ hai **tự chữa** thay vì hiện lỗi đỏ. Đó là **resilience**.

> Ở cấp page (không phải action), `kind: 'notFound'` → `notFound()`, `kind: 'forbidden'` →
> `forbidden()`, `kind: 'reauth'` → `unauthorized()` hoặc `redirect('/login')` (xem bảng ở Tầng 1b).

---

## 8. Retry với backoff — cho lỗi tạm thời

```tsx
// lib/api/retry.ts
import { ApiError } from '@/lib/api/http'

function isRetryable(e: unknown): boolean {
  if (e instanceof ApiError) return e.status >= 500 || e.status === 429
  if (e instanceof DOMException && e.name === 'AbortError') return false  // timeout có chủ đích
  return e instanceof TypeError                                           // lỗi mạng của fetch
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 200): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!isRetryable(e) || i === attempts - 1) throw e
      // Exponential backoff + jitter để tránh thundering herd
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * baseMs))
    }
  }
}

// ✅ GET — idempotent
const orders = await withRetry(() => apiFetch<OrdersResult>('/order', { auth: true }))
```

⚠️ **CHỈ retry request idempotent.** `POST /order` retry có thể tạo hai đơn. `PATCH /cart/quantity`
của repo gửi `oldQuantity`/`newQuantity` và backend tính delta (file `07`) → retry = cộng hai lần.

⚠️ Retry tăng độ trễ khi thất bại (3 lần ≈ 1 giây chờ). Với hành động người dùng đang đứng chờ, 2 lần
là đủ. (`Math.random()` ở đây hợp lệ vì nằm trong logic async, không trong render — file `13`.)

---

## 9. Error Boundary + Suspense: thứ tự lồng

```tsx
// A — boundary NGOÀI Suspense: lỗi thay cả khối
<ErrorBoundary>
  <Suspense fallback={<Skeleton />}><ProductComments productId={id} /></Suspense>
</ErrorBoundary>

// B — boundary TRONG Suspense: lỗi chỉ thay phần comment
<Suspense fallback={<Skeleton />}>
  <ErrorBoundary><ProductComments productId={id} /></ErrorBoundary>
</Suspense>
```

| Chuyện gì xảy ra | Kết quả |
| --- | --- |
| `ProductComments` đang await | Skeleton hiện |
| `ProductComments` throw / fetch reject | Suspense **không** bắt Error → lên Error boundary gần nhất |

Trong cả hai cách, phần còn lại của trang sản phẩm (ảnh, giá, Add to cart) không bị ảnh hưởng. Khác
biệt chỉ là error UI nằm ở đâu so với skeleton — thường lỗi cục bộ (B) là điều bạn muốn.

### Phân biệt "rỗng" với "lỗi"

📄 `app/(store)/products/[id]/page.tsx` hiện tại:

```tsx
let comments: Comment[] = []
try {
  comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)
} catch {
  comments = []                      // ❌ API sập = "No comments yet"
}
```

Nếu `/comment` sập, người dùng thấy "No comments yet. Be the first to comment." — họ nghĩ chưa ai
comment, thực tế là API lỗi. Tách thành một async Server Component (file `06`) và trả UI lỗi riêng:

```tsx
// components/store/product-comments.tsx (đề xuất)
export async function ProductComments({ productId }: { productId: string }) {
  const currentUserId = await getClientId()
  try {
    const comments = await apiFetch<Comment[]>(`/comment?productId=${productId}`)
    return <CommentSection productId={productId} comments={comments} currentUserId={currentUserId} />
  } catch {
    // ✅ Vẫn cho ĐĂNG comment — chỉ phần đọc là lỗi
    return (
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Comments</h2>
        <p className="text-sm text-muted-foreground">
          Không tải được bình luận. Bạn vẫn có thể để lại bình luận bên dưới.
        </p>
        <CommentForm productId={productId} />
      </section>
    )
  }
}
```

**Graceful degradation đúng nghĩa:** mất một phần chức năng, phần còn lại vẫn dùng được, và người dùng
**biết** điều gì đã xảy ra.

---

## 10. Boundary cấp component

`error.tsx` là boundary cấp route. Muốn cô lập một widget, có hai lựa chọn.

### 10.1 ✅ Trong Next: `unstable_catchError` (Next 16.2)

```tsx
// components/widget-error-boundary.tsx
'use client'
import { unstable_catchError, type ErrorInfo } from 'next/error'
import { Button } from '@/components/ui/button'

function WidgetFallback({ title }: { title: string }, { error, unstable_retry }: ErrorInfo) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">{title}</p>
      <Button variant="outline" size="sm" onClick={() => unstable_retry()} className="mt-2">Thử lại</Button>
    </div>
  )
}

export default unstable_catchError(WidgetFallback)
```

```tsx
<WidgetErrorBoundary title="Không hiển thị được phần bình luận">
  <CommentSection productId={id} comments={comments} currentUserId={currentUserId} />
</WidgetErrorBoundary>
```

So với class boundary tự viết, nó **hiểu Next**: không nuốt nhầm `redirect()`/`notFound()`, có
`unstable_retry` (re-fetch server), và **tự xoá trạng thái lỗi khi navigate** sang route khác.

### 10.2 Class boundary tự viết — khi không có Next helper

React vẫn **chưa có hook** cho error boundary; component boundary bắt buộc là class:

```tsx
'use client'
import * as React from 'react'

type Props = {
  children: React.ReactNode
  fallback: (error: Error, reset: () => void) => React.ReactNode
  resetKey?: unknown                          // đổi giá trị → tự reset
}

export class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  reset = () => this.setState({ error: null })
  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}
```

**`resetKey` là chi tiết hay bị bỏ sót.** Không có nó, boundary đã lỗi sẽ hiện fallback **mãi**, kể cả
khi người dùng chuyển sang product khác (`resetKey={productId}`). ⚠️ Class boundary này cũng sẽ bắt
nhầm `redirect()`/`notFound()` throw từ con → trong Next, ưu tiên 10.1.

⚖️ Chỉ bọc khối **thực sự có thể lỗi độc lập**: widget bên thứ ba, chart, embed, phần render dữ liệu
không tin cậy. Đừng bọc mọi component.

---

## 11. Best Practices

1. **Ba tầng:** `try/catch` cho lỗi dự đoán được → `error.tsx` làm lưới → `global-error.tsx` cho ca tệ nhất.
2. **Dùng `unstable_retry`, không phải `reset`**, trong `error.tsx` (Next 16.2) — `reset` không re-fetch
   nên không cứu được lỗi Server Component.
3. **Luôn hiện `error.digest`** và log nó qua `onRequestError` để nối hai đầu.
4. **Log lỗi không mong đợi trước khi biến nó thành message thân thiện.**
5. **Phân biệt "rỗng" với "lỗi" trong UI.**
6. **Defensive chỉ cho field optional.** Field bắt buộc mà thiếu là bug — để nó nổ.
7. **Server Action: TRẢ VỀ lỗi nghiệp vụ, THROW lỗi hệ thống.**
8. **Handler làm việc thật:** `guard` hoặc `startTransition`. Listener toàn cục đặt ở
   `instrumentation-client.ts`.
9. **Không `try/catch` quanh `redirect()`/`notFound()`** — hoặc gọi `unstable_rethrow(e)` đầu `catch`.
10. **Chỉ retry request idempotent.**
11. **Boundary cấp component:** `unstable_catchError`; nếu tự viết class thì phải có `resetKey`.

---

## Tự kiểm tra

1. Kể ba loại lỗi mà error boundary **không** bắt được. Vì sao? Làm sao để lỗi trong `onClick` lên được boundary?
2. Vì sao Suspense và Error Boundary là cùng một cơ chế ở tầng Fiber?
3. `app/(store)/error.tsx` có bắt được lỗi trong `app/(store)/layout.tsx` không?
4. `unstable_retry()` khác `reset()` thế nào? Vì sao `reset()` không cứu được lỗi Server Component?
5. React 19 thay đổi gì về việc log lỗi so với React 18? Trong Next, gắn monitoring ở đâu thay cho `onCaughtError`?
6. Vì sao `global-error.tsx` phải tự render `<html>` và không dùng được `metadata`?
7. `errorMessage` hiện tại chôn loại lỗi nào? Sửa bằng một dòng như thế nào?
8. Vì sao không được retry `PATCH /cart/quantity` của repo này?
9. `unstable_catchError` có lợi gì so với class ErrorBoundary tự viết?

➡️ Tiếp theo: `17-composition-headless-polymorphic.md`
