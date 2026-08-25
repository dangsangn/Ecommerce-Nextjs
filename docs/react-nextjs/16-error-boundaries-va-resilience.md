# 16. Error Boundaries & Resilience nâng cao

> **Mục tiêu:** biết chính xác error boundary bắt được gì và **không** bắt được gì, thiết kế được một
> chiến lược lỗi nhiều tầng, và phân loại lỗi thành các hành động UI cụ thể.

---

## 1. Overview

### Vấn đề: "xử lý lỗi" không phải một việc

Một app thật có ít nhất **sáu loại lỗi khác nhau**, và chúng cần sáu cách xử lý khác nhau:

| Loại lỗi | Ví dụ trong repo | Ai bắt được? |
| --- | --- | --- |
| **Lỗi nghiệp vụ dự đoán được** | "Wrong password", "Order already cancelled" | `try/catch` + trả `ActionState` |
| **Lỗi resource không tồn tại** | Product ID không có | `notFound()` |
| **Lỗi render trên server** | `order.order_products.flatMap` với data sai hình dạng | `error.tsx` |
| **Lỗi render trên client** | Client Component throw khi hydrate | `error.tsx` |
| **Lỗi trong event handler** | `onClick` throw | ❌ **KHÔNG AI** — phải tự try/catch |
| **Lỗi async không await** | Promise reject không ai bắt | ❌ **KHÔNG AI** — `unhandledrejection` |

**Hai dòng cuối là chỗ mọi người bị bất ngờ.** Error boundary **không** bắt lỗi trong event handler và
**không** bắt promise rejection. Đây là giới hạn kiến trúc, không phải thiếu sót.

---

## 2. Mental Model

### 🧠 Error Boundary như một cầu chì, không phải một cái lưới

Cầu chì chỉ bảo vệ **mạch điện đi qua nó**. Nếu bạn cắm thiết bị vào ổ khác, cầu chì không biết gì.

Error boundary chỉ bắt lỗi xảy ra **trong lúc React đang render hoặc commit cây con của nó**:

```
┌─ <ErrorBoundary> ────────────────────────────┐
│                                               │
│   ✅ BẮT ĐƯỢC:                                │
│   • throw trong thân function component        │
│   • throw trong useEffect / useLayoutEffect    │
│   • throw trong constructor / render class     │
│   • throw trong getDerivedStateFromProps       │
│   • Promise reject của Server Component        │
│                                               │
│   ❌ KHÔNG BẮT ĐƯỢC:                          │
│   • throw trong onClick / onChange / onSubmit   │
│   • throw trong setTimeout / setInterval       │
│   • Promise reject không được await            │
│   • lỗi trong chính ErrorBoundary đó           │
│   • lỗi ở SSR (cần boundary phía server)       │
└───────────────────────────────────────────────┘
```

**Vì sao event handler không được bắt?** Vì handler chạy **ngoài** chu trình render/commit của React.
Khi bạn click, browser gọi listener, listener gọi hàm của bạn. React không "bọc" call stack đó — nó
chỉ dispatch. Nếu hàm throw, exception nổi lên tới `window.onerror`.

📄 Điều này có ý nghĩa cụ thể cho repo. `components/store/comment-section.tsx`:

```tsx
const toggle = (id: string) => setReplyOpen((cur) => (cur === id ? null : id))
// ...
<Button variant="ghost" size="xs" onClick={onToggle}>
```

Nếu `onToggle` throw (ví dụ một refactor làm nó đọc `comment.user.name` khi `user` là `undefined`),
**không có `error.tsx` nào bắt được**. Người dùng bấm nút, không có gì xảy ra, console có lỗi đỏ,
và app im lặng bị hỏng một phần.

---

## 3. How It Works — cơ chế bắt lỗi ở tầng Fiber

Nối tiếp file `15`: khi `beginWork` hoặc `completeWork` throw, React bắt exception trong work loop:

```js
// Rút gọn từ ReactFiberWorkLoop
function renderRootConcurrent(root, lanes) {
  do {
    try {
      workLoopConcurrent()
      break
    } catch (thrownValue) {
      handleThrow(root, thrownValue)   // ← đây
    }
  } while (true)
}
```

`handleThrow` phân loại giá trị được throw:

| Giá trị throw | React làm gì |
| --- | --- |
| Một **Promise** (thenable) | → Suspense! Tìm `<Suspense>` gần nhất, hiển thị fallback |
| `NEXT_REDIRECT` (Next.js) | → Framework bắt, biến thành HTTP redirect |
| `NEXT_NOT_FOUND` | → Framework bắt, render `not-found.tsx` |
| Bất kỳ `Error` khác | → Đi lên theo `fiber.return` tìm error boundary gần nhất |

**Đây là lời giải thích cơ chế cho ba điều đã học:**

**(a) Suspense và Error Boundary là CÙNG một cơ chế.** Cả hai đều là "throw rồi tìm boundary gần nhất
đi lên". Khác biệt duy nhất: throw Promise → Suspense, throw Error → Error Boundary. Đây là lý do
chúng compose được với nhau một cách tự nhiên.

**(b) Vì sao `redirect()` phải ngoài `try/catch`** (file `09`). Nó throw một sentinel. `catch` của bạn
bắt nó trước framework.

**(c) Vì sao error boundary phải là component RIÊNG, ở TRÊN chỗ lỗi.** React đi theo `fiber.return`
(lên cha). Một boundary không bắt được lỗi của chính nó, vì không có bước "lên" nào để tìm chính mình.

---

## 4. Ba tầng lỗi nên có trong repo này

### Tầng 1 — `try/catch` trong page: lỗi dự đoán được

📄 Pattern hiện tại, lặp ở 9 trang. `app/(store)/orders/page.tsx`:

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
      <h1 className="text-2xl font-semibold">Your orders</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No orders yet. <Link href="/" className="text-primary hover:underline">Browse products</Link>
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => <OrderCard key={o._id} order={o} />)}
        </div>
      )}
    </div>
  )
}
```

**Điểm mạnh thật của pattern này:**

✅ Tiêu đề "Your orders" **vẫn hiện** — người dùng biết mình đang ở đâu
✅ Thông báo lỗi **theo ngữ cảnh** ("Could not load your orders"), không phải "Something went wrong"
✅ Không cần Client Component
✅ Phân biệt được ba trạng thái: lỗi / rỗng / có dữ liệu

**Nhưng nó không bắt được lỗi NGOÀI `try`.** 📄 `components/store/order-card.tsx`:

```tsx
export function OrderCard({ order }: { order: Order }) {
  const products: OrderProduct[] = order.order_products.flatMap((s) => s.item_products)
  const code = order._id.slice(-6).toUpperCase()
```

Nếu backend trả một order với `order_products: null` (ví dụ do migration lỗi), `.flatMap` throw
`TypeError`. Lúc đó `try/catch` ở page đã xong từ lâu — lỗi xảy ra trong lúc **render**.

Không có `error.tsx` → người dùng thấy màn hình lỗi mặc định của Next.js (production: một trang trắng
với "Application error"). Toàn bộ ngữ cảnh mất sạch.

**Cách phòng ngừa ở chính component — defensive rendering:**

```tsx
export function OrderCard({ order }: { order: Order }) {
  // Chống dữ liệu thiếu hình dạng từ backend — cùng tinh thần với toPriceString
  const products: OrderProduct[] = (order.order_products ?? []).flatMap(
    (s) => s.item_products ?? [],
  )
  const code = order._id?.slice(-6).toUpperCase() ?? '——————'
```

⚖️ **Đây là trade-off thật, không phải "luôn nên làm".**

| Defensive (`?? []`) | Fail-fast (để nó throw) |
| --- | --- |
| ✅ Người dùng vẫn thấy phần còn lại | ❌ Boundary hiện, mất ngữ cảnh |
| ❌ **Che mất bug** — order hiện với 0 sản phẩm, không ai biết | ✅ Bug lộ ra ngay, được báo lên monitoring |
| Phù hợp với: field optional thật sự | Phù hợp với: field bắt buộc theo hợp đồng API |

**Nguyên tắc chọn:** defensive cho **field mà API cho phép thiếu**; fail-fast cho **field mà API đảm bảo
có**. Nếu `order_products` là bắt buộc theo hợp đồng và nó `null`, đó là **bug cần biết**, không phải
tình huống cần che.

📄 Repo đã làm đúng ranh giới này ở `orders/[id]/page.tsx`:

```tsx
const checkout = order.order_checkout ?? { totalPrice: 0, totalDiscount: 0, feeShip: 0, totalCheckout: 0 }
const shipping = order.order_shipping ?? {}
const addressParts = [shipping.street, shipping.city, shipping.state, shipping.country].filter(Boolean)
```

`order_shipping` và `order_payment` là `?:` (optional) trong `types/order.ts` → dùng `??` là đúng.
Còn `order_products` là **bắt buộc** (`order_products: ShopOrderNew[]`) → không dùng `??` cũng hợp lý,
vì nếu nó thiếu thì đó là vi phạm hợp đồng.

### Tầng 2 — `error.tsx`: lưới an toàn cho lỗi không dự đoán được

```tsx
// app/(store)/error.tsx
'use client'

import { useEffect } from 'react'
import { RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Gửi lên monitoring. `digest` là cầu nối duy nhất tới log phía server.
    reportError({
      message: error.message,
      digest: error.digest,
      boundary: 'store',
      pathname: window.location.pathname,
    })
  }, [error])

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h2 className="text-xl font-semibold">Không tải được nội dung này</h2>
      <p className="text-sm text-muted-foreground">
        Đã có sự cố khi hiển thị trang. Bạn có thể thử lại — nếu vẫn lỗi, vui lòng quay về trang chủ.
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" />
          Thử lại
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          <Home className="size-4" />
          Về trang chủ
        </Link>
      </div>
      {process.env.NODE_ENV === 'development' ? (
        <pre className="mt-6 overflow-x-auto rounded-md bg-muted p-3 text-left text-xs">
          {error.stack ?? error.message}
        </pre>
      ) : null}
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Mã lỗi: {error.digest}</p>
      ) : null}
    </div>
  )
}
```

**Bốn chi tiết quan trọng:**

**(1) `error.digest` là cầu nối duy nhất tới lỗi thật.**

Ở production, Next.js **cố ý xoá** message và stack của lỗi server trước khi gửi xuống client — để
không lộ đường dẫn file, tên biến, hoặc chuỗi kết nối database. Thay vào đó nó gửi một `digest`
(hash của lỗi), và log message thật ở phía server kèm cùng digest đó.

```
Server log:  [Error: Cannot read properties of null (reading 'flatMap')] digest: '1234567890'
Client sees: Error { message: 'An error occurred in the Server Components render.', digest: '1234567890' }
```

**Nghĩa là:** hiện `digest` cho người dùng để họ báo lại, và bạn tra được đúng lỗi trong log server.
Không hiện nó = mọi báo lỗi từ người dùng trở thành "trang bị lỗi" không tra được.

**(2) Chỉ hiện stack ở development.** `process.env.NODE_ENV` được thay thế lúc build, nên khối `<pre>`
bị **loại bỏ hoàn toàn** khỏi production bundle (dead code elimination) — không chỉ là ẩn đi.

**(3) `reset()` chỉ giúp với lỗi tạm thời.** Nó yêu cầu React render lại cây con. Nếu lỗi do dữ liệu
xấu (order thiếu field), render lại sẽ **lỗi y hệt**. `reset()` hữu ích cho: API timeout, network
blip, race condition. Vì vậy luôn kèm một đường thoát thứ hai (link về trang chủ).

**(4) Phải có `'use client'`.** Error boundary cần `componentDidCatch` (hoặc tương đương) và state để
nhớ "đã lỗi rồi" — cả hai chỉ tồn tại ở client.

### Tầng 3 — `global-error.tsx`: khi chính root layout lỗi

```tsx
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    // ⚠️ global-error THAY THẾ cả root layout → PHẢI tự render <html> và <body>
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Ứng dụng gặp sự cố</h2>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>Vui lòng tải lại trang.</p>
        <button onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Tải lại
        </button>
        {error.digest ? (
          <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '1rem' }}>Mã lỗi: {error.digest}</p>
        ) : null}
      </body>
    </html>
  )
}
```

**Hai điều cần biết:**

- **Phải tự render `<html>` và `<body>`.** Vì `global-error` thay thế `app/layout.tsx` — nếu lỗi nằm
  *trong* root layout, layout đó không dùng được.
- **Dùng inline style, không dùng Tailwind class.** Nếu lỗi xảy ra trước khi CSS được inject (hoặc
  chính CSS là nguyên nhân), class sẽ không có tác dụng. Inline style luôn hoạt động.

### Cấu trúc hoàn chỉnh

```
app/
├── global-error.tsx          ← root layout lỗi (rất hiếm, nhưng cần)
├── (store)/
│   ├── error.tsx             ← lỗi trong storefront: giữ được header/footer? KHÔNG
│   │                            (error.tsx nằm TRONG layout, nên layout vẫn hiện)
│   ├── not-found.tsx
│   ├── orders/
│   │   ├── error.tsx         ← lỗi CỤ THỂ của orders — tuỳ chọn, nếu muốn message riêng
│   │   └── page.tsx
│   └── products/[id]/
│       └── page.tsx          ← dùng notFound() cho 404
└── (seller)/seller/
    └── error.tsx
```

**Điểm quan trọng về phạm vi:** `app/(store)/error.tsx` nằm **trong** `app/(store)/layout.tsx`.
Nên khi page lỗi, `StoreHeader` và footer **vẫn hiện** — người dùng vẫn điều hướng được. Đó là hành vi
mong muốn.

Nếu lỗi nằm trong chính `StoreHeader` (ví dụ `getAccessPayload` throw), `(store)/error.tsx`
**không bắt được** — nó ở trong layout đó. Lúc đó cần `app/error.tsx` hoặc `global-error.tsx`.

> **Quy tắc:** một `error.tsx` bắt được lỗi của **`page.tsx` cùng cấp và mọi thứ bên dưới**,
> nhưng **không** bắt được lỗi của `layout.tsx` cùng cấp. Muốn bắt layout → đặt boundary ở cấp trên.

---

## 5. ⭐ Lỗi mà không boundary nào bắt — và cách xử lý

### 5.1 Event handler

```tsx
// ❌ error.tsx KHÔNG bắt được
<Button onClick={() => {
  const total = order.order_checkout.totalCheckout   // throw nếu order_checkout undefined
  copyToClipboard(String(total))
}}>
  Copy total
</Button>
```

**Cách xử lý — một wrapper có tên:**

```tsx
// lib/errors/guard.ts
import { toast } from 'sonner'

/**
 * Bọc một event handler để lỗi không nổi lên window.onerror.
 * Error boundary KHÔNG bắt được lỗi trong handler, nên đây là tầng phòng thủ duy nhất.
 */
export function guard<A extends unknown[]>(
  fn: (...args: A) => void,
  fallbackMessage = 'Không thực hiện được hành động này',
): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args)
    } catch (e) {
      console.error('[guard]', e)
      toast.error(fallbackMessage)
    }
  }
}

/** Bản async — cũng bắt promise rejection. */
export function guardAsync<A extends unknown[]>(
  fn: (...args: A) => Promise<void>,
  fallbackMessage = 'Không thực hiện được hành động này',
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args)
    } catch (e) {
      console.error('[guardAsync]', e)
      toast.error(fallbackMessage)
    }
  }
}
```

```tsx
<Button onClick={guard(() => {
  const total = order.order_checkout.totalCheckout
  copyToClipboard(String(total))
}, 'Không copy được tổng tiền')}>
  Copy total
</Button>
```

⚖️ **Đừng bọc mọi handler.** Chỉ bọc những handler **làm việc thật** (đọc dữ liệu lồng sâu, gọi API
của browser, parse). Handler như `onClick={() => setStep(1)}` không có gì để throw — bọc nó chỉ thêm
tiếng ồn.

### 5.2 Promise không await

```tsx
// ❌ Rejection này không ai bắt
useEffect(() => {
  fetch('/api/track').then(r => r.json()).then(setData)
  //                                       ^ nếu throw ở đây → unhandledrejection
}, [])
```

**Bắt ở tầng toàn cục** — một lưới cuối cùng cho những gì lọt qua:

```tsx
// components/error-reporter.tsx
'use client'
import { useEffect } from 'react'

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportError({ kind: 'window.error', message: e.message, source: e.filename, line: e.lineno })
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      reportError({
        kind: 'unhandledrejection',
        message: e.reason instanceof Error ? e.reason.message : String(e.reason),
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
```

Gắn vào root layout, cạnh `<Toaster />`:

```tsx
// app/layout.tsx
<body className="min-h-full flex flex-col">
  {children}
  <Toaster richColors position="top-right" />
  <ErrorReporter />
</body>
```

Đây là pattern "effect component" giống `WelcomeToast` (file `03`): `return null`, tồn tại chỉ để chạy
một effect.

### 5.3 Lỗi trong Server Action

Đây là ca đặc biệt nhất, và repo xử lý **đúng**.

Server Action có **hai** cách báo lỗi, với ý nghĩa hoàn toàn khác nhau:

```tsx
// Cách A — TRẢ VỀ lỗi: lỗi nghiệp vụ, mong đợi được
return { ok: false, message: 'Wrong password' }
// → useActionState nhận state mới → component hiện message → KHÔNG có boundary nào bị kích hoạt

// Cách B — THROW: lỗi thật, không mong đợi
throw new Error('Database connection lost')
// → nổi lên error.tsx → người dùng thấy trang lỗi
```

📄 Repo dùng **cách A cho mọi lỗi nghiệp vụ**, và đó là lựa chọn đúng:

```tsx
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }     // ← trả về
  const redirectTo = (formData.get('redirect') as string) || '/'
  try {
    const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
    await setSession(data.tokens, data.user._id)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not sign you in') }   // ← trả về
  }
  redirect(redirectTo)
}
```

**Vì sao trả về tốt hơn throw ở đây?** Vì "sai mật khẩu" **không phải lỗi hệ thống** — đó là một kết
quả hợp lệ của việc đăng nhập. Người dùng cần ở lại trên form, thấy message, và thử lại. Nếu throw,
họ bị đẩy sang trang lỗi và mất cả form.

⚠️ **Nhưng có một hệ quả cần biết:** vì mọi lỗi được `catch` và trả về, **lỗi thật cũng bị biến thành
message thân thiện**:

```tsx
catch (e) {
  return { ok: false, message: errorMessage(e, 'Could not sign you in') }
}
```

📄 `lib/api/error-message.ts`:

```tsx
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}
```

Nếu `e` là một `TypeError` do bug trong `setSession`, nó **không** phải `ApiError` → người dùng thấy
"Could not sign you in" → và **không ai biết có bug**. Lỗi bị chôn.

**Cách sửa — log lỗi không mong đợi trước khi biến nó thành message:**

```tsx
// lib/api/error-message.ts
import { ApiError } from '@/lib/api/http'

/**
 * Lấy message hiển thị được từ một lỗi đã catch.
 *
 * ApiError = lỗi nghiệp vụ từ backend → message an toàn để hiện.
 * Bất kỳ thứ gì khác = lỗi KHÔNG mong đợi (bug) → log lại rồi dùng fallback,
 * để lỗi thật không bị chôn dưới một câu thân thiện.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message

  console.error('[unexpected]', e)      // ← hoặc gửi lên monitoring
  return fallback
}
```

Một dòng, và bạn không còn mất lỗi. Đây là loại thay đổi nhỏ có giá trị vận hành rất lớn.

---

## 6. Phân loại lỗi thành hành động UI

Đây là phần thiết kế mà phần lớn app bỏ qua: **không phải lỗi nào cũng nên hiện giống nhau.**

📄 `lib/api/http.ts` đã có `ApiError` mang `status`:

```tsx
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
```

Nhưng repo **chưa dùng `status`** ở đâu cả — chỉ dùng `message`. Đây là thông tin đang bị bỏ không.

**Một taxonomy dùng được:**

```tsx
// lib/errors/classify.ts
import { ApiError } from '@/lib/api/http'

export type ErrorAction =
  | { kind: 'field'; message: string }            // hiện cạnh field, người dùng sửa được
  | { kind: 'toast'; message: string }            // thông báo ngắn, không chặn
  | { kind: 'retry'; message: string }            // hiện nút "Thử lại"
  | { kind: 'reauth' }                            // đẩy về /login
  | { kind: 'forbidden'; message: string }        // không có quyền — đừng cho thử lại
  | { kind: 'notFound' }                          // gọi notFound()
  | { kind: 'fatal'; message: string }            // để error.tsx xử lý

export function classifyError(e: unknown, fallback: string): ErrorAction {
  if (!(e instanceof ApiError)) {
    console.error('[unexpected]', e)
    return { kind: 'fatal', message: fallback }
  }

  switch (true) {
    case e.status === 400 || e.status === 422:
      // Backend validate fail — message thường nói rõ field nào
      return { kind: 'field', message: e.message }
    case e.status === 401:
      return { kind: 'reauth' }
    case e.status === 403:
      return { kind: 'forbidden', message: e.message }
    case e.status === 404:
      return { kind: 'notFound' }
    case e.status === 409:
      // Conflict — "order already cancelled". Thử lại vô nghĩa.
      return { kind: 'toast', message: e.message }
    case e.status === 429:
      return { kind: 'retry', message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.' }
    case e.status >= 500:
      // Lỗi server — có thể tạm thời, cho thử lại
      return { kind: 'retry', message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại.' }
    default:
      return { kind: 'toast', message: e.message || fallback }
  }
}
```

**Áp vào một action thật:**

```tsx
// actions/order.actions.ts
import { classifyError } from '@/lib/errors/classify'

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  if (!orderId) return { ok: false, message: 'Missing order id' }

  try {
    await apiFetch(`/order/${orderId}/cancel`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    const action = classifyError(e, 'Could not cancel the order')

    // 401 → session hết hạn, gửi họ đi đăng nhập lại (redirect NGOÀI try/catch được)
    if (action.kind === 'reauth') redirect(`/login?redirect=/orders/${orderId}`)

    // 409 "already cancelled" → thực tế là đã đạt được điều người dùng muốn.
    // Revalidate để UI đồng bộ với server, rồi báo nhẹ nhàng.
    if (action.kind === 'toast') {
      revalidatePath('/orders')
      revalidatePath(`/orders/${orderId}`)
      return { ok: true, message: action.message }
    }

    return { ok: false, message: 'message' in action ? action.message : 'Không hủy được đơn hàng' }
  }

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  return { ok: true, message: 'Order cancelled' }
}
```

**Chú ý cách xử lý 409.** Nhớ lại bug ở file `10`: hủy đơn từ trang chi tiết không revalidate trang đó,
nên nút Cancel vẫn còn và người dùng bấm lại → backend trả "already cancelled".

Với `classifyError`, ngay cả khi bug đó chưa được sửa, lần bấm thứ hai **revalidate và báo thành công**
thay vì hiện lỗi đỏ khiến người dùng bối rối. Đây là **resilience**: hệ thống tự chữa thay vì bắt người
dùng chịu hậu quả của một bug.

---

## 7. Retry với backoff — cho lỗi tạm thời

Với `kind: 'retry'`, một lần thử lại thủ công là đủ cho phần lớn trường hợp. Nhưng với các lỗi mạng
chập chờn, retry tự động ở tầng `apiFetch` giá trị hơn:

```tsx
// lib/api/retry.ts
import { ApiError } from '@/lib/api/http'

/** Lỗi nào đáng thử lại: mạng, timeout, và 5xx/429 từ server. */
function isRetryable(e: unknown): boolean {
  if (e instanceof ApiError) return e.status >= 500 || e.status === 429
  if (e instanceof DOMException && e.name === 'AbortError') return false   // timeout có chủ đích
  return e instanceof TypeError          // fetch network error
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3
  const baseMs = opts.baseMs ?? 200
  let lastError: unknown

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (!isRetryable(e) || i === attempts - 1) throw e
      // Exponential backoff + jitter để không dồn cục (thundering herd)
      const delay = baseMs * 2 ** i + Math.random() * baseMs
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}
```

```tsx
// Dùng cho các GET đọc dữ liệu — an toàn vì idempotent
const orders = await withRetry(() => apiFetch<OrdersResult>('/order', { auth: true }))
```

⚠️ **Ba cảnh báo quan trọng:**

**(1) CHỈ retry cho request idempotent.** GET thì an toàn. `POST /order` thì **không** — retry có thể
tạo hai đơn hàng. `PATCH /cart/quantity` với `oldQuantity`/`newQuantity` cũng **không** (nhớ lại
file `07`: backend tính delta).

**(2) `Math.random()` trong jitter là hợp lệ ở đây** vì nó nằm trong logic async, **không** trong
render. Nhớ lại file `13`: chỉ render mới phải xác định.

**(3) Retry làm tăng độ trễ khi thất bại.** 3 lần thử với backoff = người dùng chờ ~1 giây trước khi
thấy lỗi. Với hành động người dùng đang đứng chờ, 2 lần thử là đủ.

---

## 8. Error Boundary + Suspense: cách chúng compose

Vì cả hai dùng cùng cơ chế (throw → tìm boundary), chúng lồng vào nhau tự nhiên:

```tsx
// Thứ tự lồng QUAN TRỌNG
<ErrorBoundaryOuter>                    {/* bắt lỗi của cả khối */}
  <Suspense fallback={<Skeleton />}>     {/* bắt Promise */}
    <ProductComments productId={id} />
  </Suspense>
</ErrorBoundaryOuter>
```

| Chuyện gì xảy ra | Kết quả |
| --- | --- |
| `ProductComments` đang await | `<Skeleton />` hiện |
| `ProductComments` throw Error | Error boundary hiện (Suspense không bắt Error) |
| Fetch trong Suspense reject | Error nổi qua Suspense lên Error boundary |

**Nếu đảo thứ tự:**

```tsx
<Suspense fallback={<Skeleton />}>
  <ErrorBoundaryInner>                   {/* bắt lỗi CHỈ của phần này */}
    <ProductComments productId={id} />
  </ErrorBoundaryInner>
</Suspense>
```

Giờ lỗi của `ProductComments` được xử lý **bên trong** Suspense — phần fallback đã được thay bằng
error UI cục bộ. Đây thường là điều bạn muốn: **lỗi comment không nên làm mất cả trang sản phẩm.**

📄 Áp vào bản refactor ở file `06`:

```tsx
// app/(store)/products/[id]/page.tsx
<Suspense fallback={<CommentsSkeleton />}>
  <ProductComments productId={id} />
</Suspense>
```

Nếu `/comment` API sập, người dùng thấy... gì? Hiện tại `ProductComments` tự `catch` và trả `[]`:

```tsx
export async function ProductComments({ productId }: { productId: string }) {
  let comments: Comment[] = []
  try {
    comments = await apiFetch<Comment[]>(`/comment?productId=${productId}`)
  } catch {
    comments = []
  }
```

→ Section comment hiện "No comments yet. Be the first to comment." **Điều này gây nhầm lẫn** — người
dùng nghĩ chưa có ai comment, thực tế là API lỗi.

**Cách tốt hơn — phân biệt "rỗng" với "lỗi":**

```tsx
export async function ProductComments({ productId }: { productId: string }) {
  const currentUserId = await getClientId()
  try {
    const comments = await apiFetch<Comment[]>(`/comment?productId=${productId}`)
    return <CommentSection productId={productId} comments={comments} currentUserId={currentUserId} />
  } catch {
    // Vẫn cho người dùng ĐĂNG comment — chỉ phần đọc là lỗi.
    return (
      <section className="space-y-6 border-t pt-8">
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

**Đây là graceful degradation đúng nghĩa:** chức năng bị mất một phần, phần còn lại vẫn dùng được, và
người dùng **biết** điều gì đã xảy ra.

---

## 9. Custom Error Boundary — khi `error.tsx` không đủ

`error.tsx` là boundary ở cấp route. Muốn boundary ở cấp component (cho một widget cụ thể), bạn phải
tự viết. Error boundary **bắt buộc phải là class component** — không có hook tương đương:

```tsx
// components/error-boundary.tsx
'use client'
import * as React from 'react'

interface Props {
  children: React.ReactNode
  /** UI hiện khi lỗi. Nhận error + hàm reset. */
  fallback: (error: Error, reset: () => void) => React.ReactNode
  /** Đổi giá trị này để tự động reset boundary (ví dụ khi productId đổi). */
  resetKey?: unknown
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prevProps: Props) {
    // Tự reset khi resetKey đổi — nếu không, boundary "dính" lỗi mãi
    // dù dữ liệu gây lỗi đã được thay.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset)
    return this.props.children
  }
}
```

**`resetKey` là chi tiết quan trọng mà nhiều triển khai bỏ sót.** Không có nó, boundary một lần lỗi sẽ
hiện fallback **mãi mãi**, kể cả khi người dùng đã navigate sang một product khác — vì `state.error`
vẫn còn và không có gì xoá nó.

**Dùng để cô lập một widget:**

```tsx
<ErrorBoundary
  resetKey={productId}
  onError={(e, info) => reportError({ message: e.message, componentStack: info.componentStack })}
  fallback={(error, reset) => (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Không hiển thị được phần bình luận</p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-2">Thử lại</Button>
    </div>
  )}
>
  <CommentSection productId={productId} comments={comments} currentUserId={currentUserId} />
</ErrorBoundary>
```

Giờ nếu `CommentSection` throw (ví dụ một comment có `userId: null` làm `.slice(-4)` vỡ), **chỉ khối
comment** hiện lỗi. Ảnh, giá, nút Add to cart vẫn nguyên.

⚖️ **Trade-off:** thêm một class component (ngược dòng với codebase toàn function), thêm một tầng cây.
Chỉ đáng dùng cho các khối **thực sự có thể lỗi độc lập** — widget của bên thứ ba, phần render dữ liệu
không tin cậy, chart, embed. Đừng bọc mọi component.

---

## 10. Trade-offs

| Chiến lược | Lợi ích | Cái giá |
| --- | --- | --- |
| `try/catch` trong page | Message theo ngữ cảnh; giữ phần còn lại của trang; không cần client | Lặp lại ở mọi trang; không bắt lỗi render |
| `error.tsx` | Lưới an toàn; có `reset()`; không lặp | Message chung; mất ngữ cảnh; bắt buộc `'use client'` |
| Defensive rendering (`?? []`) | Không bao giờ crash | **Che bug**; dữ liệu sai hiển thị như dữ liệu đúng |
| Trả lỗi từ Server Action | Người dùng ở lại form với dữ liệu đã nhập | Lỗi thật bị chôn nếu không log |
| `classifyError` taxonomy | Mỗi loại lỗi có UI phù hợp; tự chữa được một số ca | Thêm một lớp abstraction; phải map đúng status code |
| Retry tự động | Chịu được mạng chập chờn | **Nguy hiểm với non-idempotent**; tăng độ trễ khi fail |
| Custom ErrorBoundary | Cô lập lỗi ở cấp widget | Class component; thêm tầng cây; dễ lạm dụng |

---

## 11. Best Practices

1. **Ba tầng, không loại trừ nhau:** `try/catch` cho lỗi dự đoán được → `error.tsx` làm lưới →
   `global-error.tsx` cho ca tệ nhất.

2. **Luôn hiện `error.digest`.** Ở production đó là thứ duy nhất nối báo lỗi của người dùng với log
   server.

3. **Log lỗi không mong đợi trước khi biến nó thành message thân thiện.** Một dòng
   `console.error` trong `errorMessage` ngăn việc chôn bug.

4. **Phân biệt "rỗng" với "lỗi" trong UI.** `catch { comments = [] }` khiến người dùng nghĩ chưa có
   comment. Đây là loại bug UX âm thầm.

5. **Defensive chỉ cho field API cho phép thiếu.** Field bắt buộc mà thiếu là bug — hãy để nó nổ và
   được báo.

6. **Server Action: TRẢ VỀ lỗi nghiệp vụ, THROW lỗi hệ thống.** Trả về = người dùng ở lại và sửa được.
   Throw = có gì đó thật sự sai.

7. **Bọc handler làm việc thật bằng `guard`.** Error boundary không bắt được event handler.

8. **Đặt `<ErrorReporter />` ở root** để bắt `window.error` và `unhandledrejection`.

9. **Chỉ retry request idempotent.** GET được, `POST /order` không, `PATCH /cart/quantity` (dạng delta)
   không.

10. **Custom ErrorBoundary phải có `resetKey`.** Không có nó, boundary dính lỗi mãi sau khi navigate.

11. **Đặt Error Boundary bên TRONG Suspense** khi bạn muốn lỗi cục bộ; bên NGOÀI khi lỗi nên làm mất
    cả khối.

---

## Tự kiểm tra

1. Kể ba loại lỗi mà error boundary **không** bắt được. Vì sao?
2. Vì sao Suspense và Error Boundary là cùng một cơ chế ở tầng Fiber?
3. `app/(store)/error.tsx` có bắt được lỗi trong `app/(store)/layout.tsx` không? Vì sao?
4. `error.digest` là gì và vì sao nó bắt buộc phải hiện cho người dùng?
5. Vì sao `global-error.tsx` phải tự render `<html>` và dùng inline style?
6. Khi nào defensive rendering (`?? []`) là sai lựa chọn?
7. `errorMessage` hiện tại chôn loại lỗi nào? Sửa bằng một dòng như thế nào?
8. Vì sao không được retry `PATCH /cart/quantity` của repo này?
9. Đặt Error Boundary trong vs ngoài Suspense — khác nhau thế nào về UX?
10. Vì sao custom ErrorBoundary cần `resetKey`?

➡️ Tiếp theo: `17-composition-headless-polymorphic.md`
