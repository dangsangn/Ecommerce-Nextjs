# 03. `useEffect` — dùng đúng và dùng sai

> **Mục tiêu:** hiểu `useEffect` sinh ra để làm *một* việc, nhận ra 5 kiểu lạm dụng phổ biến nhất,
> và đánh giá công bằng các effect đang có trong repo.

---

## 1. Overview

### `useEffect` KHÔNG phải "lifecycle hook"

```tsx
useEffect(() => {...}, [])        // ≈ componentDidMount ?
useEffect(() => {...}, [x])       // ≈ componentDidUpdate ?
useEffect(() => {... return fn }) // ≈ componentWillUnmount ?
```

Cách nghĩ này chạy được trong nhiều trường hợp nên rất khó bỏ — nhưng vỡ ngay khi gặp StrictMode,
`<Activity>`, Suspense: "mount" và "unmount" không còn là chuỗi tuyến tính, một component có thể
setup → cleanup → setup nhiều lần mà vẫn là *cùng một* instance.

### Định nghĩa đúng

> **`useEffect` dùng để đồng bộ component với một hệ thống BÊN NGOÀI React.**

| Hệ thống bên ngoài | Ví dụ |
| --- | --- |
| DOM API trực tiếp | `document.title`, `document.body.style`, `IntersectionObserver` |
| Sự kiện browser | `window.addEventListener('resize')`, `matchMedia` |
| Kết nối có trạng thái | WebSocket, EventSource, polling |
| Thư viện bên thứ ba | map, chart, video player |
| Timer, storage | `setInterval`, `localStorage` |

Việc bạn làm **không** đồng bộ với thứ nào trong bảng → **rất có thể không cần `useEffect`.**

Effect chạy **sau commit (thường là sau paint)** — mọi thứ trong effect là "sửa lại sau khi đã vẽ":
(1) có thể có một frame UI ở trạng thái sai, (2) thêm một lần render nếu effect `setState`,
(3) thứ tự khó đoán hơn (effect của con chạy trước effect của cha).

---

## 2. Mental Model

### 🧠 Effect như một sợi dây đồng bộ

```
   ┌─────────────────┐                    ┌──────────────────────┐
   │  THẾ GIỚI REACT │                    │  THẾ GIỚI BÊN NGOÀI  │
   │   open = true   │ ══ setup() ══════▶ │ body.overflow=hidden │
   │   open = false  │ ══ cleanup() ════▶ │ body.overflow=prev   │
   └─────────────────┘                    └──────────────────────┘
```

**(a) Mỗi `setup` phải có `cleanup` hoàn tác nó.** Không cleanup = rò rỉ (listener chồng chất,
WebSocket không đóng, timer chạy mãi).

```tsx
// ❌ Mỗi lần mount thêm 1 listener, không bao giờ gỡ
useEffect(() => {
  window.addEventListener('resize', onResize)
}, [])

// ✅
useEffect(() => {
  const onResize = () => setIsMobile(window.innerWidth < 768)
  window.addEventListener('resize', onResize)
  return () => window.removeEventListener('resize', onResize)
}, [])
```

**(b) Dependency array KHÔNG phải "khi nào chạy" — nó là "effect này đọc những giá trị reactive nào".**
Bạn không *chọn* dependency; bạn **liệt kê** những gì thân effect đọc (lint `react-hooks/exhaustive-deps`
làm việc này giúp bạn). Muốn effect chạy ít hơn → **đổi thân effect** (hoặc dùng `useEffectEvent`),
không xoá dependency.

⚠️ **Xoá dependency để "effect đừng chạy lại" là tạo bug im lặng** — effect dùng giá trị cũ mãi mãi.

---

## 3. How It Works — vòng đời một effect

```
                        Component render
                              │
                       React commit DOM
                              │
                    ┌── useLayoutEffect ──┐  ← đồng bộ, chặn paint
                    └─────────┬───────────┘
                      Browser paint 🖼️
                              │
                    ┌───── useEffect ─────┐  ← sau paint
                    └─────────────────────┘

Khi dependency đổi:   cleanup của lần trước  ──▶  setup của lần này
Khi unmount / <Activity mode="hidden">:  cleanup
```

**Cleanup của lần trước luôn chạy TRƯỚC setup của lần sau** — không bao giờ có hai setup cùng hoạt
động. (Lưu ý: nếu effect được kích hoạt bởi một tương tác như click, React có thể chạy nó *trước*
paint; đừng dựa vào "luôn sau paint" cho logic.)

---

## 4. Practical Examples — mổ xẻ các effect thật trong repo

Repo có **28 lời gọi `useEffect` trong 22 file**. Hơn 20 cái trong số đó là cùng một pattern: toast
kết quả của `useActionState`.

### ✅ Ví dụ tốt #1 — đồng bộ với `document.body`

📄 `components/seller/seller-mobile-nav.tsx` (code ở file `01`, mục 3.3):

| Tiêu chí | Đánh giá |
| --- | --- |
| Có hệ thống bên ngoài? | ✅ `document.body.style` |
| Cleanup hoàn tác? | ✅ Khôi phục `prev`, không hardcode |
| Dependency đầy đủ? | ✅ Chỉ đọc `open` |
| Idempotent (StrictMode)? | ✅ |
| `setState` bên trong? | ✅ Không → không render thừa |

Cần viết effect thì so nó với đoạn này.

### ⚖️ Ví dụ cần bàn #2 — toast từ `useActionState`

📄 `components/store/cancel-order-button.tsx` (và `add-to-cart`, `avatar-form`, `sku-editor`,
`product-row-actions`, `edit-product-form` ×2, ...):

```tsx
const [state, formAction] = useActionState(cancelOrderAction, initialActionState)
useEffect(() => {
  if (state.ok && state.message) toast.success(state.message)
  else if (!state.ok && state.message) toast.error(state.message)
}, [state])
```

**Đánh giá công bằng:** về lý thuyết đây là "phản ứng với *sự kiện* bằng effect" — thường là dấu hiệu
sai. Nhưng `useActionState` trả kết quả **dưới dạng state**, nên effect là cách đơn giản để phản ứng.
Nó toast lại được cả khi cùng một lỗi lặp lại vì Server Action trả về **object mới** mỗi lần chạy →
`[state]` đổi reference.

**⚠️ Vấn đề 1 — copy ở ~20 chỗ.** Đặt tên cho khái niệm bằng custom hook:

```tsx
// lib/hooks/use-action-toast.ts
'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import type { ActionState } from '@/actions/state'

export function useActionToast(state: ActionState) {
  useEffect(() => {
    if (!state.message) return
    if (state.ok) toast.success(state.message)
    else toast.error(state.message)
  }, [state])
}
```

```tsx
// edit-product-form.tsx: 10 dòng → 2 dòng; mỗi lần gọi hook là một effect độc lập
useActionToast(detailsState)
useActionToast(imagesState)
```

**⚠️ Vấn đề 2 — nhiều khi không cần effect.** 📄 `components/discounts/discount-code-lookup.tsx`
render kết quả **thẳng từ state**:

```tsx
const [state, formAction] = useActionState(lookupDiscountByCodeAction, initial)
// ...
{state.ok && state.data ? (
  <p className="font-medium">{state.data.discount_name}</p>
) : null}
{!state.ok && state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
```

Không effect, không render thừa. Chọn cách nào?

| | Render inline | Toast qua effect |
| --- | --- | --- |
| Lỗi validate của form | ✅ Lỗi nằm cạnh field | ❌ Toast biến mất |
| Kết quả tra cứu | ✅ | ❌ |
| Xác nhận ngắn ("Đã thêm vào giỏ") | ⚠️ Chiếm chỗ layout | ✅ |
| Hành động rồi điều hướng đi | ❌ Component unmount | ✅ (xem #4) |

📄 Theo bảng này, `login-form.tsx` nên render lỗi inline:

```tsx
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(loginAction, initialActionState)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      {/* ...các field... */}
      {state.message ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      <SubmitButton>Sign in</SubmitButton>
    </form>
  )
}
```

`role="alert"` để screen reader đọc lỗi — điều toast làm không đáng tin cậy.

### ❌ Ví dụ sai #3 — effect gọi callback của cha

📄 `components/store/comment-form.tsx`:

```tsx
const [state, formAction] = useActionState(createCommentAction, initialActionState)
const ref = useRef<HTMLFormElement>(null)

useEffect(() => {
  if (state.ok && state.message) {
    toast.success(state.message)
    ref.current?.reset()
    onDone?.()                 // ← báo cho CommentSection đóng form reply
  } else if (!state.ok && state.message) {
    toast.error(state.message)
  }
}, [state, onDone])
```

Và cha (`comment-section.tsx`) truyền `onDone={close}` với `const close = () => setReplyOpen(null)`
— **function mới mỗi lần render**. Ba vấn đề:

1. **`onDone` trong deps là bom hẹn giờ.** Mỗi lần `CommentSection` re-render (ví dụ
   `revalidatePath` đẩy comments mới về trong khi form còn mount), `onDone` đổi → effect chạy lại
   với **`state` cũ vẫn `ok`** → toast "thành công" lần hai, gọi `onDone` lần hai. Hôm nay may mắn
   vì `close()` unmount form ngay; mai ai đó đổi `onDone` thành thứ không unmount là lỗi.
2. **Cập nhật cha bằng effect = một lần render thừa** (con render → effect → `setState` cha → render lại).
3. **`ref.current?.reset()` là thừa:** React 19 **tự reset** form có `action={fn}` sau khi action xong.

**Sửa A — làm việc "sự kiện" trong chính action** (không còn effect):

```tsx
const [state, formAction] = useActionState(
  async (prev: ActionState, fd: FormData) => {
    const result = await createCommentAction(prev, fd)
    if (result.ok) {
      toast.success(result.message ?? 'Posted')
      onDone?.()               // chạy đúng 1 lần cho đúng 1 lần submit
    } else if (result.message) {
      toast.error(result.message)
    }
    return result
  },
  initialActionState,
)
// <form action={formAction}> — React tự reset form, không cần ref
```

⚖️ Đánh đổi: action bọc trong client function **mất progressive enhancement** (form không submit
được trước khi JS hydrate). Với form comment thì chấp nhận được.

**Sửa B — giữ effect, tách phần "event" ra bằng `useEffectEvent`** (mục 7):

```tsx
const onResult = useEffectEvent((s: ActionState) => {
  if (s.ok && s.message) { toast.success(s.message); onDone?.() }
  else if (s.message) toast.error(s.message)
})
useEffect(() => { onResult(state) }, [state])   // ✅ chỉ chạy khi có kết quả MỚI
```

📄 **Đối chiếu: repo làm đúng ở `components/products/image-manager.tsx`** — kết quả upload được
đưa lên cha **ngay trong callback của transition**, không qua effect:

```tsx
startUpload(async () => {
  const result = await prepareImagesAction({ ok: false }, body)
  if (result.ok && result.data) onUploaded(result.data)   // gọi trực tiếp, 1 lần
  else toast.error(result.message ?? 'Could not upload images')
})
```

> **Quy tắc:** dùng `useEffect` để đưa dữ liệu/thông báo lên cha → hỏi *"việc này xảy ra do sự kiện
> nào?"* và làm nó ngay tại sự kiện đó.

### ⚖️ Ví dụ tinh tế #4 — phản ứng với URL

📄 `components/seller/welcome-toast.tsx`:

```tsx
// Shows the "You're now a shop" toast after the upgrade redirect, then strips
// the ?welcome=1 flag so it doesn't fire again on refresh.
export function WelcomeToast() {
  const router = useRouter()
  const params = useSearchParams()
  const welcome = params.get('welcome')

  useEffect(() => {
    if (welcome !== '1') return
    toast.success("You're now a shop — welcome to Seller Centre")
    router.replace('/seller')
  }, [welcome, router])

  return null
}
```

**Effect chính đáng.** `upgradeToShopAction` (`actions/user.actions.ts`) gọi
`redirect('/seller?welcome=1')`; form gửi đi **bị unmount** khi redirect nên không tự toast được.
Thông báo được truyền qua URL — "hệ thống bên ngoài" ở đây là **URL của browser**.

- `router.replace('/seller')` xoá cờ → refresh không toast lại; guard `welcome !== '1'` làm lần chạy
  sau thành no-op.
- Trả về `null`: một "effect component" hợp lệ.
- ⚠️ Phải nằm trong `<Suspense>` (`app/(seller)/seller/page.tsx`) vì `useSearchParams()` — thiếu
  boundary trên route prerender thì `next build` lỗi (file `06`).

---

## 5. Năm kiểu lạm dụng `useEffect` — bảng tra nhanh

| # | Dấu hiệu | Cách đúng |
| --- | --- | --- |
| 1 | `useEffect(() => setB(f(a)), [a])` | Tính trong render: `const b = f(a)` |
| 2 | `useEffect(() => { fetch(url).then(setData) }, [url])` | Server Component, hoặc `use(promise)` + Suspense |
| 3 | `useEffect(() => setX(prop), [prop])` | `key` trên component (file `02`) |
| 4 | `useEffect(() => onSomething(data), [data])` | Gọi `onSomething` tại sự kiện / đưa state lên cha |
| 5 | `useEffect(() => { if (justSubmitted) toast() })` | Xử lý trong handler/action; hoặc render inline |

📄 Repo mắc **#4** ở `comment-form.tsx` và dạng nhẹ của **#5** ở ~20 chỗ. **Không** mắc #1, #2, #3
— và **không có `useEffect` nào fetch data**: mọi fetch nằm trong Server Component hoặc Server Action.

---

## 6. Fetch trong effect — nếu buộc phải làm

Khi *thật sự* cần fetch ở client (autocomplete, polling), phải xử lý **race condition**:

```tsx
// ❌ "ao" về sau "aoth" → ghi đè kết quả đúng, không có lỗi nào được log
useEffect(() => {
  fetch(`/api/search?q=${query}`).then(r => r.json()).then(setResults)
}, [query])
```

```tsx
// ✅ cleanup huỷ request cũ
useEffect(() => {
  const controller = new AbortController()
  let ignore = false

  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then(r => r.json())
    .then(data => { if (!ignore) setResults(data) })
    .catch(e => { if (e.name !== 'AbortError') setError(e) })

  return () => {
    ignore = true
    controller.abort()
  }
}, [query])
```

`abort()` tiết kiệm băng thông; cờ `ignore` bảo đảm không `setState` từ response đã lỗi thời (kể cả
khi response về đúng lúc trước khi abort có hiệu lực). Thực tế, hãy dùng thư viện (TanStack Query,
SWR) cho fetch phía client — chúng xử lý race, cache, dedupe sẵn.

📄 Cùng nguyên tắc cleanup ở phía server — `updateAvatarAction` trong `actions/user.actions.ts`
dùng `AbortController` + timeout và `finally { clearTimeout(timer) }` để dọn timer trên mọi đường ra.

---

## 7. `useEffectEvent` — bài toán dependency (stable từ React 19.2)

Effect cần **đọc** giá trị mới nhất nhưng **không nên đồng bộ lại** khi giá trị đó đổi:

```tsx
// Muốn toast theo `theme` hiện tại, nhưng KHÔNG muốn reconnect khi đổi theme
function OrderStatusLive({ orderId, theme }: { orderId: string; theme: Theme }) {
  useEffect(() => {
    const es = new EventSource(`/api/orders/${orderId}/events`)
    es.onmessage = (e) => showToast(JSON.parse(e.data).status, theme)
    return () => es.close()
  }, [orderId, theme])   // ❌ đổi theme → đóng và mở lại kết nối SSE
}
```

```tsx
import { useEffect, useEffectEvent } from 'react'

function OrderStatusLive({ orderId, theme }: { orderId: string; theme: Theme }) {
  // Không reactive: luôn thấy giá trị MỚI NHẤT, không vào dependency array
  const onStatus = useEffectEvent((status: string) => showToast(status, theme))

  useEffect(() => {
    const es = new EventSource(`/api/orders/${orderId}/events`)
    es.onmessage = (e) => onStatus(JSON.parse(e.data).status)
    return () => es.close()
  }, [orderId])   // ✅ chỉ orderId là reactive
}
```

**Phân biệt:** giá trị **reactive** nếu nó đổi thì effect *nên* đồng bộ lại (→ deps). Giá trị
**event-like** nếu effect chỉ cần giá trị mới nhất *khi có việc xảy ra* (→ `useEffectEvent`).

⚠️ Luật của Effect Event (lint `eslint-plugin-react-hooks` kiểm tra):
- Chỉ gọi **từ bên trong effect** (hoặc callback do effect đăng ký) — không gọi trong render, không
  truyền xuống component khác.
- **Không** đưa nó vào dependency array (identity của nó cố ý không ổn định).
- Không dùng để "lách" deps cho giá trị thật sự reactive.

---

## 8. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Cửa thoát hiểm duy nhất để nói chuyện với thế giới ngoài React | Chạy sau paint → có frame UI trung gian |
| Cleanup tự động theo vòng đời | Thiếu cleanup → rò rỉ im lặng |
| Deps array mô tả chính xác phụ thuộc | Thiếu dep → stale; dep không ổn định → chạy quá nhiều |
| Không chặn hiển thị | Effect `setState` → 2 render cho 1 cập nhật |

Vấn đề không phải `useEffect` — mà là nó **quá tiện** nên bị dùng cho việc có giải pháp tốt hơn.

---

## 9. Best Practices

1. **Trước khi viết effect, hỏi: "hệ thống bên ngoài nào tôi đang đồng bộ?"** Không trả lời được → không cần effect.
2. **Cleanup luôn khôi phục giá trị trước đó.**
3. **Không xoá dependency** — chia nhỏ effect hoặc dùng `useEffectEvent`.
4. **Đặt tên effect bằng custom hook** (`useActionToast`) — lợi ích chính là ý định rõ, không phải DRY.
5. **Lỗi validate render inline** với `role="alert"`; toast cho xác nhận ngắn / thông báo xuyên trang.
6. **App Router: không fetch trong effect** trừ khi dữ liệu phụ thuộc trạng thái chỉ có ở client.
7. **Làm việc "sự kiện" tại sự kiện** — không đẩy lên cha qua effect.

---

## Tự kiểm tra

1. Điền vào chỗ trống: "`useEffect` dùng để ______ component với ______".
2. Dependency array trả lời câu hỏi nào? (không phải "khi nào chạy")
3. Vì sao `onDone` trong deps của `comment-form.tsx` có thể gây toast lặp? Nêu hai cách sửa.
4. Vì sao `welcome-toast.tsx` phải toast qua URL thay vì toast trong form nâng cấp shop?
5. Viết một effect fetch có xử lý race condition. Vì sao cần *cả* `abort()` *và* cờ `ignore`?
6. Khi nào giá trị vào dependency array, khi nào bọc `useEffectEvent`?

➡️ Tiếp theo: `04-memo-usememo-usecallback.md`
