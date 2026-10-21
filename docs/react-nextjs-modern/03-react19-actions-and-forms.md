# 03 — Actions & Form trong React 19: `useActionState`, `useFormStatus`, `useOptimistic`

> Đây là file **quan trọng nhất cho công việc hằng ngày trong repo**: gần như mọi form ở [components/](../../components/) đều được xây theo khuôn mẫu ở đây.

---

## 1. Overview — Tổng quan

### Vấn đề: một form "đơn giản" trước React 19

```tsx
// Kiểu React 18: tự quản mọi thứ
function AddToCart({ productId }: { productId: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/cart', { method: 'POST', body: new FormData(e.currentTarget) })
      if (!res.ok) throw new Error('Không thêm được')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }
  // ... + race condition nếu bấm 2 lần, + không chạy khi JS chưa tải
}
```

Mỗi form lặp lại: `pending`, `error`, `try/catch/finally`, `preventDefault`. Và vẫn còn lỗ hổng: bấm 2 lần nhanh → 2 request chạy song song, kết quả về sai thứ tự.

### React 19 giải quyết: **Actions**

> **Action** = một hàm (thường là `async`) được chạy **bên trong transition**.

Vì chạy trong transition (file 02), React tự động biết:
- Khi nào nó **bắt đầu** và **kết thúc** → có `pending` miễn phí.
- Nhiều lần gọi liên tiếp → **xếp hàng tuần tự**, không đua nhau.
- Lỗi ném ra → đi tới **Error Boundary** gần nhất.

Và React 19 cho phép truyền **hàm** vào `<form action={...}>` (trước chỉ nhận URL string). Kết hợp với Server Actions (file 07), form hoạt động được **ngay cả khi JavaScript chưa tải xong** (progressive enhancement).

Ba hook xoay quanh Actions:

| Hook | Câu hỏi nó trả lời | Import từ |
| --- | --- | --- |
| `useActionState` | "Kết quả lần submit gần nhất là gì? Đang chạy không?" | `react` |
| `useFormStatus` | "Form **cha** của tôi có đang submit không?" | `react-dom` |
| `useOptimistic` | "Hiển thị trước kết quả mong đợi trong khi chờ server?" | `react` |

---

## 2. Mental Model — Mô hình tư duy

### 🧠 Form như một "reducer bất đồng bộ"

Nếu bạn biết `useReducer`, bạn đã biết 80% `useActionState`:

```
useReducer:      (state, action)   => newState            — đồng bộ
useActionState:  (state, formData) => Promise<newState>   — bất đồng bộ, chạy trong transition
```

Mỗi lần submit = một "action" đẩy vào reducer. Kết quả trả về trở thành `state` mới. Không cần `setError`, `setPending` — **giá trị trả về chính là state**.

### 🧠 Dòng chảy của một lần submit

```
 User bấm Submit
       │
       ▼
 <form action={formAction}> ── React gom FormData ──► formAction(formData)
       │                                                    │
       │  isPending = true                                  ▼
       │  useFormStatus().pending = true          action(prevState, formData)
       │  useOptimistic → hiện giá trị tạm                 │ (có thể là Server Action:
       │                                                    │  chạy trên server qua POST)
       ▼                                                    ▼
 UI cũ vẫn tương tác được                         return newState
       │                                                    │
       └───────────────────── ◄────────────────────────────┘
                     state = newState, isPending = false
                     optimistic value bị thay bằng dữ liệu thật
                     form (uncontrolled) được reset tự động
```

---

## 3. `useActionState`

### Chữ ký

```tsx
const [state, formAction, isPending] = useActionState(action, initialState, permalink?)
```

- `action(prevState, formData)` — hàm của bạn. **Tham số đầu là state trước**, không phải FormData (lỗi hay gặp nhất khi chuyển từ form action thường).
- `initialState` — state trước lần submit đầu tiên.
- `formAction` — truyền vào `<form action>` hoặc `<button formAction>`.
- `isPending` — `true` khi action đang chạy.
- `permalink` — URL dự phòng khi JS chưa tải (ít dùng, chủ yếu cho trang có thể chia sẻ link).

> Lịch sử: trong React 19 canary, hook này tên là `useFormState` (import từ `react-dom`). Nếu đọc bài viết cũ thấy `useFormState`, đó chính là nó.

### Khuôn mẫu chuẩn trong repo

Repo thống nhất **một hình dạng state** cho mọi action — [actions/state.ts](../../actions/state.ts):

```ts
export interface ActionState {
  ok: boolean
  message?: string
}

export const initialActionState: ActionState = { ok: false }
```

Server Action luôn trả về `ActionState` — [actions/cart.actions.ts](../../actions/cart.actions.ts):

```ts
'use server'
export async function addToCartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get('productId') ?? '')
  const quantity = Number(formData.get('quantity') ?? 1)
  if (!productId) return { ok: false, message: 'Missing product' }        // lỗi validate → trả về, KHÔNG throw
  if (!Number.isFinite(quantity) || quantity < 1) return { ok: false, message: 'Quantity must be at least 1' }

  const clientId = await getClientId()
  if (!clientId) redirect(`/login?redirect=/products/${productId}`)       // redirect ném lỗi đặc biệt — xem file 07

  try {
    await apiFetch('/cart', { auth: true, body: { productId, quantity } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not add to cart') }
  }
  revalidatePath('/cart')
  return { ok: true, message: 'Added to cart' }
}
```

Client component dùng nó — [components/store/add-to-cart.tsx](../../components/store/add-to-cart.tsx):

```tsx
'use client'
const [state, formAction] = useActionState(addToCartAction, initialActionState)

useEffect(() => {
  if (state.ok && state.message) toast.success(state.message)
  else if (!state.ok && state.message) toast.error(state.message)
}, [state])

return (
  <form action={formAction}>
    <input type="hidden" name="productId" value={productId} />
    <Input name="quantity" type="number" defaultValue={1} />
    <SubmitButton>Add to cart</SubmitButton>
  </form>
)
```

**Tại sao repo chọn "trả về lỗi" thay vì "ném lỗi"?**
- Lỗi *dự đoán được* (validate sai, hết hàng) là **dữ liệu**, không phải sự cố. Trả về → hiện toast, form vẫn nguyên.
- Lỗi *ném ra* sẽ đi tới Error Boundary → thay cả khu vực bằng màn hình lỗi. Chỉ phù hợp với sự cố thật (server sập).

**Tại sao toast nằm trong `useEffect`?** Vì toast là side effect (file 01: render phải pure). `state` là object mới mỗi lần submit, nên effect chạy lại kể cả khi message giống lần trước.

### Ví dụ: hiển thị lỗi theo từng field

Khi cần nhiều hơn một `message`, mở rộng hình dạng state:

```ts
// actions/state.ts — biến thể
export interface FormState<TField extends string = string> {
  ok: boolean
  message?: string
  fieldErrors?: Partial<Record<TField, string[]>>
  values?: Partial<Record<TField, string>> // để giữ lại input khi lỗi — xem cạm bẫy bên dưới
}
```

```ts
'use server'
import { z } from 'zod'

const DiscountSchema = z.object({
  code: z.string().min(4, 'Mã ít nhất 4 ký tự'),
  value: z.coerce.number().positive('Giá trị phải > 0'),
})

export async function createDiscountAction(_prev: FormState<'code' | 'value'>, formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<'code' | 'value', string>
  const parsed = DiscountSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors, values: raw }
  }
  // ... gọi API
  return { ok: true, message: 'Đã tạo mã giảm giá' }
}
```

```tsx
const [state, formAction, isPending] = useActionState(createDiscountAction, { ok: false })

<form action={formAction}>
  <input name="code" defaultValue={state.values?.code} aria-invalid={!!state.fieldErrors?.code} />
  {state.fieldErrors?.code && <p className="text-destructive">{state.fieldErrors.code[0]}</p>}
  <input name="value" defaultValue={state.values?.value} />
  {state.fieldErrors?.value && <p className="text-destructive">{state.fieldErrors.value[0]}</p>}
  <button disabled={isPending}>{isPending ? 'Đang lưu…' : 'Tạo'}</button>
</form>
```

### ⚠️ Cạm bẫy #1: form tự reset — kể cả khi lỗi

React 19 **tự reset các input không kiểm soát (uncontrolled)** sau khi form action chạy xong. Điều này tiện khi thành công (ô bình luận trống lại), nhưng **khi validate lỗi, người dùng mất hết những gì vừa gõ**.

Hai cách xử lý:
1. **Trả lại giá trị đã gửi** trong state và dùng `defaultValue={state.values?.x}` (như ví dụ trên). Khi `defaultValue` đổi, React áp dụng lại giá trị.
2. Dùng `onSubmit` + `startTransition` thay vì `action` nếu cần toàn quyền kiểm soát (mất progressive enhancement).

> Ghi chú repo: [comment-form.tsx](../../components/store/comment-form.tsx) gọi `ref.current?.reset()` khi thành công. Với `<form action>`, React đã reset sẵn — dòng đó vô hại nhưng thừa. Nó vẫn hữu ích nếu sau này form chuyển sang `onSubmit`.

### ⚠️ Cạm bẫy #2: nhiều `useActionState` cho nhiều action

Mỗi `useActionState` quản lý **một** chuỗi submit. Nếu một component có 2 hành động độc lập (đổi số lượng và xoá), dùng 2 hook — như [cart-line.tsx](../../components/store/cart-line.tsx):

```tsx
const [qtyState, qtyAction] = useActionState(updateCartQuantityAction, initialActionState)
const [rmState, rmAction] = useActionState(removeFromCartAction, initialActionState)
```

Nếu dùng chung một hook, "xoá" sẽ phải xếp hàng sau "đổi số lượng" và state lẫn lộn.

### When NOT to use `useActionState`

- ❌ Hành động **không trả kết quả cần hiển thị** và không cần pending (ví dụ nút logout chỉ redirect) → `<form action={serverAction}>` trực tiếp là đủ.
- ❌ Hành động **không đến từ form** (kéo-thả, chọn file, debounce khi gõ) → `useTransition` (như [image-manager.tsx](../../components/products/image-manager.tsx)).
- ❌ Form **nhiều bước có state client phức tạp** (wizard với validate tức thì từng field) → có thể cần thư viện form (react-hook-form) và gọi action thủ công trong `startTransition`.

---

## 4. `useFormStatus`

### Chữ ký

```tsx
import { useFormStatus } from 'react-dom'
const { pending, data, method, action } = useFormStatus()
```

Trả về trạng thái của **`<form>` cha gần nhất** đang render component này.

### 🧠 Quy tắc quan trọng nhất: phải là **component con**

```tsx
// ❌ KHÔNG hoạt động: hook gọi trong chính component render <form>
function Form() {
  const { pending } = useFormStatus() // luôn false
  return <form action={act}><button disabled={pending}>Gửi</button></form>
}

// ✅ Hoạt động: hook nằm trong component con của <form>
function SubmitButton() {
  const { pending } = useFormStatus()
  return <button disabled={pending}>{pending ? 'Đang gửi…' : 'Gửi'}</button>
}
function Form() {
  return <form action={act}><SubmitButton /></form>
}
```

**Tại sao thiết kế như vậy?** Để tạo được **component tái sử dụng không cần prop**. Nút submit không cần ai truyền `isPending` xuống — nó tự "nhìn lên" form cha. Đó chính là [components/auth/submit-button.tsx](../../components/auth/submit-button.tsx), dùng chung cho hơn 15 form trong repo:

```tsx
'use client'
import { useFormStatus } from 'react-dom'

export function SubmitButton({ children, disabled, className }: Props) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className={cn('w-full', className)} disabled={pending || disabled}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
```

Và cũng nhờ vậy, mỗi `<form>` nhỏ trong [cart-line.tsx](../../components/store/cart-line.tsx) có `IconButton` riêng, **chỉ nút của form đang submit** bị disable — không phải tất cả.

### `useFormStatus` vs `isPending` của `useActionState`

| | `useActionState` → `isPending` | `useFormStatus` → `pending` |
| --- | --- | --- |
| Đọc ở đâu | Component **sở hữu** form | Component **con** của form |
| Phạm vi | Một action cụ thể | Form cha gần nhất (bất kể action nào) |
| Dùng cho | Disable cả form, hiện spinner ngoài form | Nút submit tái sử dụng, input bị khoá |
| Bonus | — | `data` = FormData đang gửi (hiện "Đang thêm *Áo thun*…") |

### When NOT to use

- ❌ Cần pending ở **ngoài** form (header, sidebar) → dùng `isPending` của `useActionState` hoặc `useTransition` rồi truyền xuống.
- ❌ Form dùng `onSubmit` thay vì `action` → `useFormStatus` không biết gì về nó.

---

## 5. `useOptimistic`

### Là gì?

```tsx
const [optimisticState, addOptimistic] = useOptimistic(state, updateFn?)
// updateFn: (currentState, optimisticValue) => newState
```

Cho phép hiển thị **kết quả mong đợi ngay lập tức**, trong khi Action thật vẫn đang chạy. Khi Action kết thúc, React **tự động bỏ giá trị lạc quan** và quay về `state` thật (lúc này đã cập nhật từ server).

### 🧠 Mô hình tư duy: lớp phủ tạm thời

```
 state thật (từ server)  ───────────────────────────────►  state thật MỚI
                           ▲                            ▲
 lớp phủ lạc quan:         │ addOptimistic(x)            │ Action xong → lớp phủ tự bị gỡ
                           └──── hiển thị x ─────────────┘
```

Bạn **không bao giờ "rollback" thủ công**. Thành công: state thật mới đã chứa x → người dùng không thấy gì thay đổi. Thất bại: state thật không đổi → lớp phủ bị gỡ → UI trở về như cũ. (Bạn vẫn nên báo lỗi bằng toast.)

### Tại sao tồn tại?

Trước đây optimistic update nghĩa là: lưu snapshot cũ, `setState` giá trị mới, gọi API, nếu lỗi thì `setState(snapshot)`, xử lý race condition khi bấm nhiều lần… `useOptimistic` gắn vòng đời của giá trị tạm vào vòng đời của Action, nên mọi thứ đó biến mất.

### Ví dụ cơ bản: nút "Thích"

```tsx
'use client'
import { useOptimistic, startTransition } from 'react'
import { toggleLikeAction } from '@/actions/like.actions'

export function LikeButton({ liked, count }: { liked: boolean; count: number }) {
  const [optimistic, setOptimistic] = useOptimistic({ liked, count })

  function toggle() {
    startTransition(async () => {
      // ⚠️ addOptimistic PHẢI được gọi bên trong transition/Action
      setOptimistic({ liked: !optimistic.liked, count: optimistic.count + (optimistic.liked ? -1 : 1) })
      await toggleLikeAction() // Server Action gọi revalidatePath → props liked/count mới chảy về
    })
  }

  return <button onClick={toggle}>{optimistic.liked ? '♥' : '♡'} {optimistic.count}</button>
}
```

### Ví dụ thực tế: giỏ hàng phản hồi tức thì (đề xuất cho repo)

Hiện tại, bấm "+" ở [cart-line.tsx](../../components/store/cart-line.tsx) phải chờ round-trip server → `revalidatePath('/cart')` → render lại mới thấy số đổi. Với mạng chậm, người dùng bấm "+" ba lần vì tưởng không ăn. Đây là ứng viên kinh điển cho `useOptimistic`:

```tsx
'use client'
import { useActionState, useOptimistic, useEffect } from 'react'

export function CartLine({ product }: { product: CartProduct }) {
  const { productId, price, quantity } = product

  // 1. Lớp phủ lạc quan trên quantity thật (đến từ props / server)
  const [optimisticQty, setOptimisticQty] = useOptimistic(quantity)

  // 2. Bọc action: cập nhật lạc quan TRƯỚC, rồi gọi server action
  const [qtyState, qtyAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    setOptimisticQty(Number(formData.get('newQuantity'))) // chạy trong Action → hợp lệ
    return updateCartQuantityAction(prev, formData)
  }, initialActionState)

  useEffect(() => {
    if (!qtyState.ok && qtyState.message) toast.error(qtyState.message) // lỗi → lớp phủ tự gỡ, toast giải thích
  }, [qtyState])

  return (
    <>
      <form action={qtyAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="oldQuantity" value={optimisticQty} />
        <input type="hidden" name="newQuantity" value={optimisticQty - 1} />
        <IconButton label="Decrease quantity">−</IconButton>
      </form>
      <span>{optimisticQty}</span>
      {/* ... nút + tương tự; tổng tiền dòng tính từ optimisticQty */}
    </>
  )
}
```

> ⚠️ Lưu ý: tổng tiền của **cả giỏ** (nằm ở component khác) sẽ chưa đổi cho tới khi server trả về. Nếu muốn mọi thứ đồng bộ lạc quan, phải nâng `useOptimistic` lên component cha chứa cả danh sách — đánh đổi giữa độ phức tạp và độ "mượt".

### When NOT to use `useOptimistic`

- ❌ **Kết quả server khó đoán** — thanh toán, áp mã giảm giá (server tính giá), đặt hàng (có thể hết kho). Hiện số sai rồi nhảy lại còn tệ hơn spinner.
- ❌ **Hành động không thể "hoàn tác về mặt cảm xúc"** — "Đặt hàng thành công!" rồi 2 giây sau "À không, thất bại". Dùng pending state trung thực.
- ❌ **Hành động hiếm khi thành công ngay** (cần xác thực OTP…).
- ✅ Dùng cho: thích/bỏ thích, thêm bình luận, đổi số lượng, toggle publish, sắp xếp lại — nơi tỷ lệ thành công cao và sai lệch dễ chấp nhận.

---

## 6. Trade-offs

| Benefits | Costs |
| --- | --- |
| Hết boilerplate `pending/error/try/finally` | Phải học quy ước `(prevState, formData)` — khác `onSubmit` quen thuộc |
| Submit liên tiếp tự xếp hàng, không race | Xếp hàng tuần tự → nhiều submit nhanh sẽ chạy **lần lượt**, không song song |
| Form chạy được trước khi JS tải (với Server Action) | Dữ liệu đi qua `FormData` (string) → phải tự ép kiểu, validate |
| `useFormStatus` cho component nút tái sử dụng | Chỉ hoạt động trong component con — dễ dùng sai |
| `useOptimistic` rollback tự động | Hiển thị "giả" có thể gây hiểu nhầm nếu dùng cho hành động hay thất bại |
| Form tự reset sau submit | Mất input khi lỗi validate nếu không trả `values` về |

**Tại sao lại có những chi phí này?** Vì React chọn **nền tảng web** (`<form>`, `FormData`) làm giao diện chung. Đó là thứ giúp progressive enhancement và Server Actions hoạt động — nhưng cũng kéo theo giới hạn của nền tảng: mọi thứ là string, form có hành vi reset riêng.

## 7. Best Practices

1. ✅ **Một hình dạng state cho mọi action** (như `ActionState` của repo). Giúp mọi form xử lý kết quả giống nhau, viết `SubmitButton`/toast dùng chung được.
2. ✅ **Lỗi dự đoán được → trả về; sự cố → ném.** Validate, hết hàng, sai mật khẩu là dữ liệu.
3. ✅ **Validate ở server dù đã validate ở client.** Server Action là một endpoint công khai (file 07).
4. ✅ **Nút submit là component riêng dùng `useFormStatus`.** Đừng truyền `isPending` qua props khi không cần.
5. ✅ **Hidden input cho ngữ cảnh** (`productId`, `redirect`) thay vì closure — vẫn hoạt động khi JS chưa tải.
6. ✅ **Lạc quan chỉ khi tỷ lệ thành công cao.** Hỏi: "nếu thất bại, người dùng có thấy bị lừa không?"

---

**Trước:** [02 — Hook React 18](./02-react18-hooks.md) · **Tiếp theo:** [04 — `use()` & các API mới của React 19](./04-react19-use-and-new-apis.md)
