# 11. Server Actions & Forms hiện đại

> **Mục tiêu:** hiểu `'use server'` thực chất tạo ra cái gì (một HTTP endpoint công khai),
> nắm `useActionState` + `useFormStatus` + hành vi form của React 19, biết Next 16 bảo vệ gì sẵn
> (và không bảo vệ gì), và đánh giá được 30 Server Action trong `actions/` của repo này.

---

## 1. Overview

Form kiểu SPA cũ: `useState` cho từng field → `onChange` → `onSubmit` + `preventDefault` → state
loading/error → `fetch('/api/...')` → viết API route → validate body → cập nhật UI / `router.refresh()`.
Hai file, và **một API endpoint bạn phải tự thiết kế và bảo mật**.

Server Actions rút xuống: viết một `async function` có `'use server'`, gắn vào `<form action={...}>`.
React + Next lo phần vận chuyển, re-render và cache.

> **Điều quan trọng nhất: một Server Action là một HTTP endpoint công khai.**
> Không phải "hàm được gọi từ client" — nó là một endpoint POST thật mà **bất kỳ ai** gửi được đúng
> request đều gọi được, với bất kỳ payload nào.

---

## 2. Mental Model

### 🧠 `'use server'` như một cái cửa bạn tự mở ra internet

```tsx
'use server'
export async function cancelOrderAction(_prev: ActionState, formData: FormData) { ... }
```

Lúc build, compiler:

1. Gán cho function một **action ID** (được mã hoá, thay đổi giữa các bản build)
2. Ở server: giữ nguyên implementation, đăng ký ID → function
3. Ở client bundle: **thay** implementation bằng một reference (ID + dispatcher) — thực chất là `fetch`

```
Client (đang ở /orders/abc123)            Server
──────                                    ──────
cancelOrderAction(fd)
  │  POST /orders/abc123                  ← POST vào CHÍNH route đang hiển thị
  │  Next-Action: 7f3a9c2e...             ← action ID
  │  body: FormData
  └──────────────────────────────────────▶ Tra ID → gọi cancelOrderAction
  ◀───────────────────────────────────────┘ Trả về: state mới + RSC payload mới (nếu có revalidate)
```

**Hệ quả:** `formData` là **input không tin cậy** — có thể có field lạ, sai kiểu, vượt giới hạn UI
(`max={10}` nhưng gửi `999999`), hoặc ID của resource thuộc người khác. Mọi action phải:
**validate input**, **kiểm tra quyền**, **không tin gì từ client**.

---

## 3. `useActionState`

```tsx
const [state, formAction, isPending] = useActionState(action, initialState, permalink?)
```

- `action` — `(prevState, formData) => newState | Promise<newState>`
- `state` — giá trị action trả về lần gần nhất (ban đầu = `initialState`)
- `formAction` — gắn vào `<form action>` hoặc `<button formAction>`
- `isPending` — `true` khi action đang chạy
- `permalink` (tuỳ chọn) — URL để form submit tới khi JS chưa tải (progressive enhancement cho
  trang dynamic)

⚠️ Hai hành vi hay bị bỏ qua:
- Các lần submit liên tiếp được **xếp hàng tuần tự** — lần sau nhận `prevState` là kết quả lần trước.
- Gọi `formAction` **ngoài** `<form>` (vd. trong `onClick`) phải bọc trong `startTransition`, nếu
  không `isPending` không cập nhật và React cảnh báo.

```tsx
// Gọi action thủ công, không qua <form>
const [state, formAction, isPending] = useActionState(addToCartAction, initialActionState)
function quickAdd() {
  const fd = new FormData()
  fd.set('productId', productId)
  fd.set('quantity', '1')
  startTransition(() => formAction(fd))   // ✅ có startTransition
}
```

### Tham số đầu tiên là `prevState`

📄 `actions/order.actions.ts`:

```tsx
export async function cancelOrderAction(
  _prev: ActionState,        // ← prevState, `_` vì không dùng
  formData: FormData,
): Promise<ActionState> {
```

Khi nào `prevState` hữu ích? Khi kết quả mới phụ thuộc kết quả cũ, vd. gộp danh sách:

```tsx
export async function loadMoreReviews(prev: ReviewsState, formData: FormData): Promise<ReviewsState> {
  const page = prev.page + 1
  const items = await fetchReviews(String(formData.get('productId')), page)
  return { page, items: [...prev.items, ...items] }
}
```

⚠️ `prevState` đến từ **client**, nên không phải cơ chế bảo mật — đừng đếm số lần đăng nhập sai bằng
nó. Rate limit thật phải ở server (Redis, DB).

### `ActionState` — hợp đồng dùng chung của repo

📄 `actions/state.ts`:

```tsx
export interface ActionState {
  ok: boolean
  message?: string
}

export const initialActionState: ActionState = { ok: false }
```

Một hợp đồng duy nhất → mọi component xử lý kết quả giống nhau. Cần trả thêm dữ liệu thì `extends`
— 📄 `actions/discount.actions.ts`:

```tsx
interface LookupState extends ActionState {
  data?: Discount
}

export async function lookupDiscountByCodeAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const code = String(formData.get('code') ?? '').trim()
  if (!code) return { ok: false, message: 'Enter a discount code' }
  try {
    const data = await apiFetch<Discount>(`/discount/code/${encodeURIComponent(code)}`)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'No usable discount for that code') }
  }
}
```

### ⚠️ Điểm yếu: `{ ok: false }` vừa là "chưa chạy" vừa là "lỗi không message"

Vì vậy mọi component phải thêm `&& state.message` để không toast lúc mount:

```tsx
useEffect(() => {
  if (state.ok && state.message) toast.success(state.message)
  else if (!state.ok && state.message) toast.error(state.message)
}, [state])
```

Discriminated union nói rõ hơn:

```tsx
export type ActionState<TData = never> =
  | { status: 'idle' }
  | { status: 'success'; message?: string; data?: TData }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }

export const initialActionState: ActionState = { status: 'idle' }

// Dùng: TS biết nhánh 'error' luôn có message
if (state.status === 'error') toast.error(state.message)
```

⚖️ Phải sửa 30 action + các form. Đáng làm **nếu** bạn cần lỗi theo field (mục 6); nếu không,
`ActionState` hiện tại đủ dùng.

---

## 4. `useFormStatus` — chỉ đọc được form CHA

📄 `components/auth/submit-button.tsx`:

```tsx
'use client'
import { useFormStatus } from 'react-dom'

export function SubmitButton({ children, disabled, className }: { /* ... */ }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className={cn('w-full', className)} disabled={pending || disabled}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
```

1. Import từ **`react-dom`**, không phải `react`.
2. Chỉ hoạt động khi component **nằm bên trong** `<form>`:

```tsx
// ✅ SubmitButton là con của form
<form action={formAction}>
  <Input name="email" />
  <SubmitButton>Sign in</SubmitButton>
</form>

// ❌ Cùng component render form và đọc status → pending luôn false
function MyForm() {
  const { pending } = useFormStatus()
  return <form action={formAction}>...</form>
}
```

Vì vậy `SubmitButton` **phải** là component riêng — ràng buộc kỹ thuật, không phải để tái sử dụng.

3. Trả về nhiều hơn `pending`: `{ pending, data, method, action }` — `data` là `FormData` đang gửi:

```tsx
function AddingLabel() {
  const { pending, data } = useFormStatus()
  return pending ? <span>Đang thêm {data?.get('quantity')} sản phẩm…</span> : null
}
```

📄 Repo dùng pattern này cho nút submit chung, nút toggle có nhãn động
(`components/products/product-row-actions.tsx`) và nút icon (`components/store/cart-line.tsx`):

```tsx
export function ProductRowActions({ id, published }: { id: string; published: boolean }) {
  const action = published ? unpublishProductAction : publishProductAction   // ← chọn action theo prop
  const [state, formAction] = useActionState(action, initialActionState)
  // ...
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <ToggleButton published={published} />   {/* đọc useFormStatus bên trong */}
    </form>
  )
}
```

Server Action là giá trị hạng nhất — chọn bằng biểu thức như mọi function.

Nút icon trong `cart-line.tsx` có `aria-label="Decrease quantity"`: nội dung chỉ là `−`, nếu thiếu
label thì screen reader đọc "minus" — vô nghĩa.

---

## 5. Hành vi form của React 19

### Form tự reset sau khi action thành công

Khi `<form action={fn}>` nhận **function** (Server Action hoặc client function), React 19 **tự reset
các field uncontrolled** sau khi action hoàn tất mà không throw — giống form HTML gốc. Trả về object
`{ ok: false }` vẫn tính là "hoàn tất" → form vẫn bị reset.

```tsx
// ✅ Comment form: ô textarea tự xoá sau khi gửi, không cần setState('')
<form action={commentAction}>
  <Textarea name="content" />
  <SubmitButton>Post</SubmitButton>
</form>
```

⚠️ Mặt trái: form **sửa** sản phẩm dùng `defaultValue` cũng bị reset về `defaultValue`. Nếu action
trả lỗi validate, người dùng mất những gì vừa gõ. Cách xử lý: trả lại giá trị đã nhập trong state và
render `defaultValue={state.values?.product_name ?? product.name}`, hoặc dùng controlled input.

Muốn reset thủ công (vd. form submit bằng `onSubmit`): `requestFormReset(formEl)` từ `react-dom`,
gọi bên trong transition.

### Progressive enhancement — form chạy không cần JS

Khi `<form action={serverAction}>` render ở server, React xuất ra một `<form>` HTML thật. Nếu JS chưa
tải/bị chặn, browser vẫn submit được. Nếu JS đang tải dở, Next **xếp hàng** submission và ưu tiên
hydrate form đó; sau hydration, submit không reload trang.

📄 Trạng thái các form trong repo:

| Form | Không có JS? | Vì sao |
| --- | --- | --- |
| `login-form`, `signup-form`, `verify-otp-form` | ✅ | `<form action={formAction}>` + Server Action |
| `add-to-cart`, `cart-line`, `cancel-order-button`, `product-row-actions` | ✅ | Hidden input mang ID |
| `store-header.tsx` (Sign out) | ✅ | Server Component, `<form action={logoutAction}>` |
| `edit-product-form` | ✅ | Uncontrolled input + `defaultValue` |
| `create-discount-form` | ⚠️ Một phần | `<Select>` cần JS để đổi giá trị |
| `create-product-form` | ❌ | Ảnh phải upload trước (`prepareImagesAction`) và lưu `draftId` vào `useState` |
| `checkout-wizard` | ❌ | Điều hướng bước bằng `useState` |
| `search-box` | ❌ | `action` là hàm client gọi `router.push` |

**Các kỹ thuật làm PE khả thi:**

**(a) Hidden input** — 📄 `cart-line.tsx`:

```tsx
<form action={qtyAction}>
  <input type="hidden" name="productId" value={productId} />
  <input type="hidden" name="oldQuantity" value={quantity} />
  <input type="hidden" name="newQuantity" value={quantity + 1} />
  <IconButton label="Increase quantity">+</IconButton>
</form>
```

`.bind()` cũng là lựa chọn hợp lệ — theo docs Next, `bind` **cũng hỗ trợ progressive enhancement**
(tham số bind được mã hoá vào HTML):

```tsx
const removeLine = removeFromCartAction.bind(null, productId)   // action nhận (productId, prev, fd)
<form action={removeLine}>...</form>
```

Khác biệt thật: hidden input đi qua `FormData` (phải validate như mọi field), còn `bind` đổi signature
của action. Cả hai đều là **input từ client** — vẫn phải kiểm tra quyền.

**(b) Uncontrolled input** (`defaultValue`) — giá trị sống trong DOM, có sẵn khi browser submit.

**(c) Một form, nhiều hành động bằng `formAction` trên button.** `cart-line.tsx` hiện dùng **ba**
`<form>` riêng (giảm, tăng, xoá). Gọn hơn:

```tsx
<form action={qtyAction}>
  <input type="hidden" name="productId" value={productId} />
  <input type="hidden" name="oldQuantity" value={quantity} />
  <button name="newQuantity" value={quantity - 1}>−</button>
  <span>{quantity}</span>
  <button name="newQuantity" value={quantity + 1}>+</button>
  <button formAction={rmAction}>Remove</button>   {/* ghi đè action của form */}
</form>
```

`name` + `value` trên `<button>` chỉ được gửi khi chính nút đó được bấm.

**(d) Server Action không cần `'use client'`** — 📄 `store-header.tsx` là Server Component:

```tsx
<form action={logoutAction}>
  <button type="submit">Sign out</button>
</form>
```

Không cần feedback state → không cần client → 0 byte JS cho nút này. Action dạng này có signature
`(): Promise<void>` (📄 `logoutAction`, `clearCartAction`, `cancelResetAction`).

📄 `logoutAction` còn đáng học ở chỗ cố ý nuốt lỗi mạng:

```tsx
export async function logoutAction(): Promise<void> {
  const store = await cookies()
  const clientId = store.get(COOKIE.CLIENT)?.value
  const refresh = store.get(COOKIE.REFRESH)?.value
  // Backend /auth/logout authenticates with x-client-id + x-refresh-token (not authorization).
  if (clientId && refresh) {
    try {
      await fetch(`${process.env.BACKEND_URL}/api/v1/auth/logout`, { method: 'POST', headers: { /* ... */ } })
    } catch {
      // Ignore network errors — still clear the client-side session.
    }
  }
  await clearSession()
  redirect('/login')
}
```

Backend chết thì **vẫn** phải xoá cookie — fail an toàn về phía "đăng xuất được". Nó gọi `fetch` trực
tiếp thay vì `apiFetch` vì endpoint này xác thực bằng `x-refresh-token`; comment nói rõ lý do.

---

## 6. Validation với Zod

📄 `actions/auth.actions.ts`:

```tsx
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    await apiFetch('/auth/signup', { body: parsed.data })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not create your account') }
  }
  redirect(`/verify-otp?email=${encodeURIComponent(parsed.data.email)}`)
}
```

1. **`safeParse`, không `parse`** — lỗi validate là chuyện *bình thường*, không nên throw.
2. **`Object.fromEntries(formData)`** chỉ giữ giá trị **cuối** của field trùng tên (checkbox group,
   multi-file) — khi đó dùng `formData.getAll(name)`.
3. **Chỉ dùng `parsed.data`** (đã trim/coerce) — đừng đọc lại `formData.get(...)` cho field đã qua schema.
4. **`redirect` nằm ngoài `try/catch`** — nó throw `NEXT_REDIRECT` (chương 09).

### Discriminated union & cross-field

📄 `lib/validations/product.ts` mã hoá luật nghiệp vụ vào schema:

```tsx
const clothing = z.object({
  ...baseFields,
  product_type: z.literal('CLOTHING'),
  brand: z.string().trim().min(1, 'Enter a brand'),
  material: z.string().trim().optional(),
  color: z.string().trim().optional(),   // giờ là trục biến thể (SKU); giữ optional cho sản phẩm cũ
  size: z.string().trim().optional(),
})
const electronics = z.object({
  ...baseFields,
  product_type: z.literal('ELECTRONICS'),
  manufacturer: z.string().trim().min(1, 'Enter a manufacturer'),
  model: z.string().trim().optional(),
})
export const productDetailsSchema = z.discriminatedUnion('product_type', [clothing, electronics])
```

"CLOTHING bắt buộc brand; ELECTRONICS bắt buộc manufacturer" nằm trong kiểu, và `z.infer` cho ra union
mà TS thu hẹp được theo `product_type`.

⚖️ Luật đó được viết **hai lần**: trong schema và trong `components/products/attribute-fields.tsx`.
Với 2 loại sản phẩm còn quản lý được; với 10 loại nên sinh cả schema lẫn field từ một khai báo chung
(`ATTRIBUTE_SPECS = { CLOTHING: [{ name, label, required }] }`).

📄 `lib/validations/discount.ts` — luật liên field bằng `.refine()` với `path`:

```tsx
.refine((d) => d.discount_type !== 'percentage' || d.discount_value <= 100, {
  message: 'Percentage must be between 0 and 100',
  path: ['discount_value'],
})
.refine((d) => new Date(d.discount_end_date) > new Date(d.discount_start_date), {
  message: 'End date must be after the start date',
  path: ['discount_end_date'],
})
```

`path` gắn lỗi vào field cụ thể. ⚠️ Nhưng repo chỉ trả `issues[0]` — sai 3 field thì người dùng phải
submit-sửa 3 lần. Trả **tất cả** lỗi theo field:

```tsx
if (!parsed.success) {
  return {
    status: 'error',
    message: 'Vui lòng kiểm tra lại các trường được đánh dấu',
    fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
  }
}

// Trong form
<Input name="discount_value" aria-invalid={!!state.fieldErrors?.discount_value} />
{state.fieldErrors?.discount_value && <p role="alert">{state.fieldErrors.discount_value}</p>}
```

### Khoảng trống giữa HTML và schema: chuỗi rỗng

Input số để trống gửi `''`, không phải `undefined`. Với
`discount_max_uses: z.coerce.number().int().min(1).optional()`, `Number('') === 0` → `.min(1)` fail cho
field người dùng **cố ý** bỏ trống. 📄 `actions/discount.actions.ts` xử lý một lần cho mọi field:

```tsx
// Optional numeric fields arrive as '' when left blank; drop them so z.optional applies.
function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== undefined && v !== null) out[k] = v
  }
  return out
}
```

Cách thuần Zod (theo từng field): `z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).optional())`.

---

## 7. ⚠️ Bảo mật — phần quan trọng nhất

### Next 16 bảo vệ sẵn những gì

| Cơ chế | Chặn được gì | Cấu hình |
| --- | --- | --- |
| **Chỉ POST** + so `Origin` với `Host`/`X-Forwarded-Host` | CSRF từ site khác | `serverActions.allowedOrigins` khi đứng sau proxy/CDN khác domain |
| **Giới hạn body 1MB** | Payload khổng lồ | `serverActions.bodySizeLimit` |
| **Action ID mã hoá, đổi theo build** + **dead code elimination** | Action không được import ở đâu thì không có endpoint | — |
| **Mã hoá biến closure** của action inline | Lộ giá trị bị capture ra client | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` khi chạy nhiều instance |

```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['shop.example.com', '*.cdn.example.com'],
      bodySizeLimit: '6mb',
    },
  },
}
```

⚠️ **Hệ quả thực tế cho repo:** `prepareImagesAction` / `addProductImagesAction` nhận ảnh qua Server
Action, nhưng `next.config.ts` **không** đặt `bodySizeLimit` → upload tổng > 1MB sẽ bị từ chối. Ảnh
điện thoại thường 2–5MB mỗi tấm.

Những cơ chế trên **không** làm thay việc của bạn: người dùng đã đăng nhập, gửi từ đúng origin, vẫn có
thể gửi ID sản phẩm của shop khác.

### Authorization: ai được làm gì với resource nào

📄 `actions/product.actions.ts`:

```tsx
export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not publish the product') }
  }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product published' }
}
```

`id` đến từ client. Thứ duy nhất ngăn seller A publish sản phẩm của shop B là **backend** kiểm tra quyền
sở hữu với token của A. Đó là kiến trúc hợp lệ — nhưng phải biết rõ tầng nào làm gì.

Chiều ngược lại cũng là bề mặt tấn công: **giá trị action trả về được serialize xuống client**. Trả đúng
cái UI cần, không trả nguyên record backend:

```tsx
return { ok: true, data: user }                                   // ❌ có thể kèm password hash, roles, token…
return { ok: true, data: { email: user.email, shop: user.shop } } // ✅ chỉ field UI render
```

**Proxy có chạy cho Server Action không?** Có — **nhưng chỉ tình cờ.** Action là POST tới route đang
hiển thị, nên nếu route đó khớp `matcher` (📄 `proxy.ts`: `/seller/:path*`, `/cart/:path*`, …) thì proxy
chạy. Docs Next 16 cảnh báo: đổi matcher hoặc dùng action ở route khác là **im lặng mất** lớp bảo vệ
đó. Và proxy chỉ trả lời "có được vào khu seller không?", không trả lời "có được sửa sản phẩm ID này
không?".

```tsx
// ❌ addToCartAction dùng ở /products/[id] — route này KHÔNG nằm trong matcher → proxy không chạy
// ✅ Kiểm tra trong chính action (hoặc trong Data Access Layer)
```

Defense in depth — kiểm tra sớm trong action:

```tsx
// lib/auth/require.ts
import 'server-only'
import { getAccessPayload } from '@/lib/auth/session'

export class AuthError extends Error {}

export async function requireRole(role: string) {
  const payload = await getAccessPayload()
  if (!payload) throw new AuthError('Phiên đăng nhập đã hết hạn')
  if (!payload.roles?.includes(role)) throw new AuthError('Bạn không có quyền')
  return payload
}

// actions/product.actions.ts
try {
  await requireRole('shop')
  await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
} catch (e) {
  if (e instanceof AuthError) return { ok: false, message: e.message }
  return { ok: false, message: errorMessage(e, 'Could not publish the product') }
}
```

⚠️ `decodeJwt` (📄 `lib/auth/tokens.ts`) chỉ **decode**, không **verify chữ ký**. Nên:

| Tầng | Kiểm tra gì | Là bảo mật? |
| --- | --- | --- |
| `proxy.ts` + `shouldGateShop` | Role trong JWT chưa verify | ❌ UX: chuyển hướng sớm |
| `requireRole` trong action | Role trong JWT chưa verify | ❌ Chặn sớm, giảm request rác |
| **Backend verify token** | Chữ ký + quyền sở hữu resource | ✅ **Nguồn phán quyết** |

### Validate file upload

`accept="image/*"` chỉ là gợi ý cho file picker — kẻ tấn công POST thẳng không qua input nào.
`addProductImagesAction` hiện nhận mọi loại/kích thước file:

```tsx
const MAX_FILE_BYTES = 2 * 1024 * 1024   // nhớ: tổng body còn bị bodySizeLimit chặn
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
if (files.length === 0) return { ok: false, message: 'Choose at least one image' }
for (const f of files) {
  if (!ALLOWED.has(f.type)) return { ok: false, message: `${f.name}: chỉ nhận JPEG/PNG/WebP/AVIF` }
  if (f.size > MAX_FILE_BYTES) return { ok: false, message: `${f.name}: vượt quá 2MB` }
}
```

`(f): f is File =>` là type predicate → mảng kết quả có kiểu `File[]`. Điểm đúng sẵn có của action:
`getAll` (input `multiple`), lọc File rỗng (browser gửi khi input trống), và tạo `FormData` mới chỉ chứa
`images` để field `id` không lọt vào body multipart.

---

## 8. Cập nhật UI sau mutation: `revalidatePath`, `updateTag`, `refresh`

Next 16 có bốn công cụ trong `next/cache`:

| API | Dùng ở | Tác dụng |
| --- | --- | --- |
| `revalidatePath(path, type?)` | Server Action, Route Handler | Vô hiệu cache của path; trong action thì UI cập nhật ngay **nếu đang xem path đó** |
| `updateTag(tag)` | **Chỉ** Server Action | Hết hạn tag ngay — request kế tiếp chờ dữ liệu mới (read-your-own-writes) |
| `revalidateTag(tag, 'max')` | Action, Route Handler | Đánh dấu stale, phục vụ stale-while-revalidate. Dạng 1 tham số đã **deprecated** |
| `refresh()` | **Chỉ** Server Action | Làm mới client router (trang hiện tại), **không** đụng cache có tag |

```tsx
'use server'
import { updateTag, refresh } from 'next/cache'

export async function updateProductAction(_prev: ActionState, fd: FormData) {
  // ...update
  updateTag(`product:${id}`)      // seller thấy ngay thay đổi của chính mình
  updateTag('products')           // danh sách cũng hết hạn
  return { ok: true, message: 'Saved' }
}

export async function addToCartAction(_prev: ActionState, fd: FormData) {
  // ...thêm vào giỏ (dữ liệu no-store, không có cache để vô hiệu)
  refresh()                       // chỉ cần vẽ lại header có badge giỏ hàng
  return { ok: true, message: 'Added to cart' }
}
```

`revalidateTag(tag, 'max')` hợp với webhook từ hệ thống ngoài (CMS báo giá đổi) — người dùng không
cần thấy ngay; cần hết hạn ngay từ Route Handler thì dùng `{ expire: 0 }`.

### Việc phụ không được làm chậm response: `after()`

Ghi log, gửi analytics, bắn email xác nhận — người dùng không cần chờ. `after()` (từ `next/server`) chạy
callback **sau khi** response đã gửi xong; dùng được trong Server Action, Server Component, Route Handler,
Proxy. Callback vẫn chạy kể cả khi action `redirect()` hay throw.

```tsx
'use server'
import { after } from 'next/server'

export async function cancelOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  // ... PATCH /order/:id/cancel
  // ❌ await logEvent(...) ở đây: user chờ thêm round-trip tới dịch vụ analytics
  // ✅ chạy sau khi response đã gửi
  after(() => logEvent('order_cancelled', { orderId }))
  refresh()
  return { ok: true, message: 'Order cancelled' }
}
```

### 📄 Audit repo

`apiFetch` (📄 `lib/api/server-client.ts`) mặc định `cache: 'no-store'` và repo chưa dùng
`'use cache'` → **không có data cache phía server**. Vì vậy `revalidatePath` ở đây chủ yếu có tác dụng
làm router render lại trang hiện tại (và theo docs, hiện tại nó còn khiến các trang đã ghé phải tải lại
khi quay lại). Các trang khác vốn dynamic nên tự lấy dữ liệu mới khi điều hướng tới.

| Action | Gọi từ | Revalidate | Đánh giá |
| --- | --- | --- | --- |
| `cancelOrderAction` | `/orders` **và** `/orders/[id]` | `/orders` | ❌ Ở trang chi tiết, path đang xem không được revalidate → thêm `revalidatePath(\`/orders/${orderId}\`)` hoặc `refresh()` |
| `addToCartAction` | `/products/[id]` | `/cart` | ⚠️ Trang đang xem không được làm mới → badge header không đổi tới khi điều hướng; dùng `refresh()` |
| `publishProductAction` / `unpublish…` | `/seller/products` | `/seller/products` | ✅ Hiện tại; ⚠️ khi thêm cache cho danh mục công khai thì cần tag `products` |
| `updateProductAction`, `updateSkusAction` | trang edit | edit + list (+ `/products/${id}`) | ✅ Mẫu tốt: liệt kê đủ các trang bị ảnh hưởng |
| `upgradeToShopAction` | `/seller/account` | `/seller/account` rồi `redirect('/seller?welcome=1')` | ✅ Ghi cookie mới (`setSession`) **trước** redirect — nếu không proxy vẫn thấy role cũ; toast chuyển sang trang đích qua `?welcome=1` vì form unmount khi redirect |

> **Checklist cho action mới:**
> 1. Action được gọi từ những trang nào? Trang đó phải được làm mới (path hoặc `refresh()`).
> 2. Dữ liệu có cache (`tags`, `'use cache'`) không? Có → `updateTag` trong action.
> 3. Dữ liệu hiện ở ≥ 3 trang → dùng tag thay vì liệt kê URL.

---

## 9. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Không cần API route + fetch ở client | **Mỗi export là một endpoint công khai** — validate + authz trong từng cái |
| Type-safe end-to-end | Không có OpenAPI; mobile/client khác không dùng được |
| Progressive enhancement miễn phí | Chỉ khi giữ hidden input/uncontrolled — dễ mất khi thêm state |
| Mutation và invalidation cùng chỗ | Quên làm mới trang đang xem → UI cũ im lặng |
| Truy cập secret/DB trực tiếp | Lỗi ở server, message bị ẩn ở production → khó debug |

Đáng giá vì nó xoá cả tầng "API cho chính app của mình" — nhưng đòi hỏi kỷ luật bảo mật, vì rào cản
tạo endpoint đã biến mất.

---

## 10. Best Practices

1. **Coi mọi Server Action như public API.** Validate, kiểm tra quyền; đừng dựa vào proxy matcher.
2. **Zod ở đầu action**, `safeParse`, chỉ dùng `parsed.data`; trả lỗi theo field khi form có nhiều field.
3. **`redirect()`/`notFound()` ngoài `try/catch`.**
4. **Giữ progressive enhancement:** hidden input hoặc `bind`, uncontrolled input, `formAction` trên button.
5. **Action không cần feedback → dùng thẳng trong Server Component**, 0 byte JS.
6. **Nhớ form tự reset** sau action thành công — với form sửa, trả lại giá trị đã nhập khi lỗi.
7. **Đặt `serverActions.bodySizeLimit`** nếu nhận file; validate type/size trong action.
8. **Làm mới đúng trang đang xem** (`revalidatePath`/`refresh`) và dùng `updateTag` cho dữ liệu có cache.

---

## Tự kiểm tra

1. `'use server'` tạo ra cái gì ở tầng HTTP? Action POST tới URL nào?
2. Next 16 tự chặn CSRF bằng cách nào? Khi nào cần `allowedOrigins`?
3. Vì sao `SubmitButton` phải là component riêng?
4. Sau khi action thành công, React 19 làm gì với input uncontrolled? Khi nào điều đó gây hại?
5. Proxy có chạy cho Server Action không? Vì sao vẫn không được dựa vào nó?
6. `updateTag`, `revalidateTag(tag, 'max')` và `refresh()` khác nhau thế nào?
7. Vì sao upload ảnh nhiều MB qua Server Action của repo này có thể thất bại?

➡️ Tiếp theo: `12-proxy-middleware-va-auth.md`
