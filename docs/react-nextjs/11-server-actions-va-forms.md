# 11. Server Actions & Forms hiện đại

> **Mục tiêu:** hiểu `'use server'` thực chất tạo ra cái gì (một HTTP endpoint công khai),
> nắm `useActionState` + `useFormStatus`, và đánh giá được 20 Server Action trong repo này.

---

## 1. Overview

### Vấn đề: mô hình form cũ có quá nhiều bước

Để submit một form trong SPA truyền thống, bạn cần:

```
1. Viết state cho từng field                  (useState × N)
2. Viết onChange cho từng field
3. Viết onSubmit + e.preventDefault()
4. Viết state cho loading, error, success      (useState × 3)
5. Viết fetch('/api/...') với method, headers, JSON.stringify
6. Viết API route handler ở server
7. Parse và validate body ở server
8. Trả response, xử lý ở client
9. Cập nhật UI, gọi router.refresh() hoặc mutate cache
```

Chín bước, hai file, và **một API endpoint bạn phải tự thiết kế và bảo mật**.

### Server Actions rút xuống

```
1. Viết một async function với 'use server'
2. Gắn nó vào <form action={...}>
```

Hai bước, một file. React và Next.js tự lo phần vận chuyển.

### Điều quan trọng nhất về Server Actions

> **Một Server Action là một HTTP endpoint công khai.**

Đây không phải "một hàm được gọi từ client". Nó là một endpoint POST thật, có ID riêng, mà **bất kỳ ai
trên internet cũng có thể gọi** — với bất kỳ payload nào họ muốn.

Nếu bạn chỉ nhớ một điều từ chương này, hãy nhớ điều đó. Nó quyết định cách bạn viết mọi action.

---

## 2. Mental Model

### 🧠 `'use server'` như một cái cửa hậu bạn tự mở

Khi bạn viết:

```tsx
'use server'
export async function cancelOrderAction(_prev: ActionState, formData: FormData) { ... }
```

Bundler tạo ra:

1. Một **ID duy nhất** cho function này (một hash)
2. Một **route handler** ở server: nhận POST, tra ID, gọi function tương ứng
3. Một **stub** ở client: một function trông giống thật, nhưng bên trong chỉ là `fetch` tới endpoint đó

```
Client                                    Server
──────                                    ──────
cancelOrderAction(fd)
  │
  │  POST /orders/abc123
  │  Next-Action: 7f3a9c2e...              ← ID của function
  │  body: FormData
  └───────────────────────────────────────▶ Tra ID → gọi cancelOrderAction
                                             │
  ◀──────────────────────────────────────────┘ Trả về: state mới + RSC payload mới
```

**Hệ quả trực tiếp và không thể tránh:** `formData` là **input không tin cậy**. Nó có thể chứa bất cứ
gì, kể cả:

- Field bạn không mong đợi
- Field bạn mong đợi nhưng có giá trị khác kiểu
- Giá trị vượt quá giới hạn của UI (UI ghi `max={10}`, kẻ tấn công gửi `999999`)
- ID của resource thuộc người khác

Đây là lý do **mọi** Server Action phải làm ba việc: **validate input**, **kiểm tra quyền**, và
**không tin bất cứ gì đến từ client**.

---

## 3. How It Works — `useActionState`

### Signature

```tsx
const [state, formAction, isPending] = useActionState(action, initialState)
```

- `action` — hàm có signature `(prevState, formData) => Promise<newState>`
- `initialState` — giá trị của `state` trước lần chạy đầu
- `state` — giá trị action trả về lần gần nhất
- `formAction` — gắn vào `<form action={formAction}>`
- `isPending` — `true` trong lúc action đang chạy (React 19)

### Tham số đầu tiên là `prevState` — điểm dễ nhầm

📄 Mọi action trong repo tuân thủ đúng — `actions/order.actions.ts`:

```tsx
export async function cancelOrderAction(
  _prev: ActionState,        // ← prevState, tên có `_` vì không dùng
  formData: FormData,
): Promise<ActionState> {
```

Dấu `_` là quy ước cho "tham số bắt buộc phải có nhưng tôi không dùng" — nó cũng làm ESLint không cảnh
báo unused variable.

**Khi nào `prevState` thực sự hữu ích?** Khi bạn cần biết trạng thái trước để quyết định, ví dụ đếm số
lần thử sai:

```tsx
interface LoginState { ok: boolean; message?: string; attempts: number }

export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const attempts = prev.attempts + 1
  if (attempts > 5) return { ok: false, message: 'Quá nhiều lần thử. Vui lòng chờ.', attempts }
  // ...
}
```

⚠️ Nhưng lưu ý: `prevState` sống trong bộ nhớ của **client**, nên nó **không phải cơ chế bảo mật**.
Kẻ tấn công có thể luôn gửi `attempts: 0`. Rate limiting thật phải ở server (Redis, DB).

### `ActionState` — hợp đồng dùng chung của repo

📄 `actions/state.ts` — chỉ 6 dòng nhưng là nền tảng cho 20 action:

```tsx
export interface ActionState {
  ok: boolean
  message?: string
}

export const initialActionState: ActionState = { ok: false }
```

**Đây là một quyết định thiết kế tốt:** một hợp đồng duy nhất → mọi component xử lý kết quả theo cùng
một cách → có thể trích `useActionToast` dùng chung (file `03`).

**Và cách mở rộng khi cần trả thêm dữ liệu** — 📄 `actions/discount.actions.ts`:

```tsx
interface LookupState extends ActionState {
  data?: Discount
}

export async function lookupDiscountByCodeAction(
  _prev: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const code = String(formData.get('code') ?? '').trim()
  if (!code) return { ok: false, message: 'Enter a discount code' }
  try {
    const data = await apiFetch<Discount>(`/discount/code/${encodeURIComponent(code)}`)
    return { ok: true, data }
  } catch (e) {
    // Backend throws specific reasons (expired/inactive/not-found) — surface verbatim.
    return { ok: false, message: errorMessage(e, 'No usable discount for that code') }
  }
}
```

`extends ActionState` giữ được tính tương thích với hợp đồng chung, và thêm `data` khi cần.

### ⚠️ Nhưng `ActionState` có một điểm yếu về kiểu

```tsx
const initialActionState: ActionState = { ok: false }
```

Trạng thái ban đầu là `{ ok: false }` — **không phân biệt được** với "action đã chạy và thất bại mà
không có message". Đó là lý do mọi component phải kiểm tra `state.message` trước khi toast:

```tsx
useEffect(() => {
  if (state.ok && state.message) toast.success(state.message)
  else if (!state.ok && state.message) toast.error(state.message)   // `&& state.message` để không toast lúc mount
}, [state])
```

Điều kiện `&& state.message` là một cách **vòng** để biết "action đã chạy chưa". Một kiểu discriminated
union nói rõ hơn:

```tsx
// actions/state.ts — phiên bản chặt hơn
export type ActionState<TData = never> =
  | { status: 'idle' }
  | { status: 'success'; message?: string; data?: TData }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }

export const initialActionState: ActionState = { status: 'idle' }
```

Lợi ích cụ thể:

```tsx
// Không cần `&& state.message` — trạng thái được mã hoá trong kiểu
export function useActionToast(state: ActionState) {
  useEffect(() => {
    if (state.status === 'idle') return
    if (state.status === 'success' && state.message) toast.success(state.message)
    if (state.status === 'error') toast.error(state.message)   // TS BIẾT message tồn tại
  }, [state])
}
```

- `status: 'idle'` phân biệt rõ "chưa chạy" khỏi "chạy rồi và lỗi"
- Ở nhánh `'error'`, `message` là **bắt buộc** → TypeScript bảo đảm bạn luôn có gì để hiện
- `fieldErrors` mở đường cho lỗi theo từng field (xem mục 6)

⚖️ **Trade-off:** phải sửa 20 action + 12 component. Với repo ở kích thước này, việc đó đáng làm
**nếu** bạn định thêm lỗi theo field. Nếu không, `ActionState` hiện tại đủ dùng và đơn giản hơn.

---

## 4. `useFormStatus` — hook có một ràng buộc bất thường

📄 `components/auth/submit-button.tsx`:

```tsx
'use client'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
```

### Ba điều phải biết

**(1) Import từ `react-dom`, không phải `react`.** `useFormStatus` là hook đặc thù DOM.

**(2) Nó chỉ hoạt động khi component là CON của `<form>`.**

```tsx
// ✅ ĐÚNG — SubmitButton nằm trong form
<form action={formAction}>
  <Input name="email" />
  <SubmitButton>Sign in</SubmitButton>
</form>

// ❌ SAI — cùng component render form và đọc status
function MyForm() {
  const { pending } = useFormStatus()   // luôn false! form này là CON của MyForm
  return <form action={formAction}>...</form>
}
```

Đây là lý do `SubmitButton` **phải** là một component riêng. Không phải để tái sử dụng — mà vì
**ràng buộc kỹ thuật**. Cùng nguyên tắc với `useLinkStatus` (file `07`).

**(3) Nó cho nhiều hơn `pending`:**

```tsx
const { pending, data, method, action } = useFormStatus()
// data là FormData đang được submit — hiển thị "Đang gửi: {data.get('name')}"
```

### 📄 Repo dùng pattern này ở ba biến thể

**Biến thể 1 — nút submit chung** (`submit-button.tsx`, dùng ở 13 form)

**Biến thể 2 — nút toggle có nhãn động** (`components/products/product-row-actions.tsx`):

```tsx
function ToggleButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? 'Processing…' : published ? 'Unpublish' : 'Publish'}
    </Button>
  )
}

export function ProductRowActions({ id, published }: { id: string; published: boolean }) {
  const action = published ? unpublishProductAction : publishProductAction   // ← chọn action theo prop
  const [state, formAction] = useActionState(action, initialActionState)
  // ...
  return (
    <div className="flex items-center justify-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <ToggleButton published={published} />
      </form>
      <Link href={`/seller/products/${id}/edit`} className={buttonVariants({ variant: 'outline' })}>Edit</Link>
    </div>
  )
}
```

Chi tiết hay: `const action = published ? unpublishProductAction : publishProductAction` — chọn Server
Action bằng biểu thức thường. Server Action là giá trị hạng nhất, truyền và chọn được như mọi function.

**Biến thể 3 — nút icon** (`components/store/cart-line.tsx`):

```tsx
function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" size="icon" aria-label={label} disabled={pending}>
      {children}
    </Button>
  )
}
```

`aria-label` là chi tiết accessibility quan trọng: nút chỉ có nội dung `−` hoặc `+`, screen reader
sẽ đọc "minus" — vô nghĩa. `aria-label="Decrease quantity"` làm nó có nghĩa.

---

## 5. Progressive Enhancement — form hoạt động không cần JS

Đây là lợi ích lớn nhất và ít được nói tới nhất của Server Actions.

### Cơ chế

Khi bạn viết `<form action={serverAction}>`, React render ra HTML là một `<form>` **thật** với
`method="POST"` và `action` trỏ tới endpoint. Nếu JavaScript chưa tải (hoặc bị lỗi, hoặc bị chặn),
browser submit form theo cách cổ điển và **nó vẫn hoạt động**.

### 📄 Kiểm tra từng form trong repo

| Form | Không có JS? | Vì sao |
| --- | --- | --- |
| `login-form.tsx` | ✅ Hoạt động | `<form action={formAction}>` với Server Action |
| `signup-form.tsx` | ✅ Hoạt động | Cùng lý do |
| `verify-otp-form.tsx` | ✅ Hoạt động | Cả hai form (verify + resend) |
| `add-to-cart.tsx` | ✅ Hoạt động | Hidden input mang `productId` |
| `cart-line.tsx` | ✅ Hoạt động | Mỗi nút là một `<form>` với hidden input |
| `cancel-order-button.tsx` | ✅ Hoạt động | |
| `product-row-actions.tsx` | ✅ Hoạt động | |
| `store-header.tsx` (Sign out) | ✅ Hoạt động | `<form action={logoutAction}>`, không cần `'use client'` |
| `edit-product-form.tsx` | ✅ Hoạt động | Uncontrolled input + `defaultValue` |
| `create-discount-form.tsx` | ⚠️ Một phần | `<Select>` cần JS; nhưng có `name` nên có thể submit được value mặc định |
| `create-product-form.tsx` | ❌ Không | `fieldset disabled={!uploadResult}` — cần JS để mở |
| `checkout-wizard.tsx` | ❌ Không | Điều hướng bước bằng `useState` |
| `search-box.tsx` | ❌ Không | `action` là hàm client gọi `router.push` |

**Bốn chi tiết làm progressive enhancement khả thi:**

**(a) Hidden input thay vì closure.** 📄 `cart-line.tsx`:

```tsx
<form action={qtyAction}>
  <input type="hidden" name="productId" value={productId} />
  <input type="hidden" name="oldQuantity" value={quantity} />
  <input type="hidden" name="newQuantity" value={quantity + 1} />
  <IconButton label="Increase quantity">+</IconButton>
</form>
```

So sánh với cách dùng `.bind()`:

```tsx
// Cũng hoạt động, nhưng KHÔNG có progressive enhancement
const boundAction = updateQuantity.bind(null, productId, quantity + 1)
<form action={boundAction}>
```

`.bind()` cần JavaScript để tạo closure. Hidden input là HTML thuần → browser submit được ngay.

**(b) Uncontrolled input.** 📄 `edit-product-form.tsx` dùng `defaultValue`, không `value` + `onChange`.
Giá trị sống trong DOM → có sẵn khi browser submit.

**(c) Form riêng cho mỗi hành động.** `cart-line.tsx` có **bốn** `<form>` riêng (giảm, tăng, xoá, và
chính dòng). Hơi rườm rà, nhưng nó là cách để mỗi nút mang payload riêng mà không cần JS.

Cách gọn hơn (React 19 hỗ trợ `formAction` trên button):

```tsx
<form>
  <input type="hidden" name="productId" value={productId} />
  <input type="hidden" name="oldQuantity" value={quantity} />
  <button formAction={decreaseAction} name="newQuantity" value={quantity - 1}>−</button>
  <span className="w-8 text-center tabular-nums">{quantity}</span>
  <button formAction={increaseAction} name="newQuantity" value={quantity + 1}>+</button>
</form>
```

`name` + `value` trên `<button>` gửi cặp đó khi chính nút ấy được bấm. Một form, nhiều hành động,
vẫn không cần JS.

**(d) Server Action gắn trực tiếp không cần `'use client'`.** 📄 `store-header.tsx`:

```tsx
<form action={logoutAction}>
  <button type="submit" className="text-muted-foreground hover:text-foreground">Sign out</button>
</form>
```

`StoreHeader` là **Server Component**. Không có `'use client'`, không có `useActionState`. Nút này gửi
**zero** JavaScript xuống client và vẫn hoạt động hoàn hảo.

Đây là dạng đơn giản nhất của Server Action: không cần feedback state → không cần client.

📄 Và `logoutAction` được viết cho đúng dạng này:

```tsx
export async function logoutAction(): Promise<void> {     // ← KHÔNG có prevState
  const store = await cookies()
  const clientId = store.get(COOKIE.CLIENT)?.value
  const refresh = store.get(COOKIE.REFRESH)?.value
  // Backend /auth/logout authenticates with x-client-id + x-refresh-token (not authorization).
  if (clientId && refresh) {
    try {
      await fetch(`${process.env.BACKEND_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.API_KEY!,
          'x-client-id': clientId,
          'x-refresh-token': refresh,
        },
      })
    } catch {
      // Ignore network errors — still clear the client-side session.
    }
  }
  await clearSession()
  redirect('/login')
}
```

**Hai chi tiết đáng học:**

1. **Signature `(): Promise<void>`** — không có `prevState`, không trả state. Đây là dạng dùng cho
   `<form action={...}>` trực tiếp. `clearCartAction` cũng vậy, và có comment giải thích:
   ```tsx
   // Used directly as a <form action> (like logoutAction), so it takes no args.
   export async function clearCartAction(): Promise<void> {
   ```

2. **`catch {}` cố ý bỏ qua lỗi mạng.** Nếu backend không phản hồi, ta **vẫn** phải xoá cookie phía
   client — nếu không, người dùng bấm "Sign out" mà vẫn còn đăng nhập. Comment nói rõ điều đó.
   Đây là quyết định đúng: **fail an toàn về phía "đăng xuất được"**.

⚠️ Chú ý action này **không dùng `apiFetch`** mà gọi `fetch` trực tiếp — vì backend `/auth/logout`
xác thực bằng `x-refresh-token`, không phải `authorization`. `buildHeaders` không hỗ trợ header đó.
Comment giải thích rõ, nên đây là ngoại lệ có lý do, không phải sự bất nhất.

---

## 6. Validation với Zod

📄 `lib/validations/auth.ts`:

```tsx
import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Enter your name'),
})

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})

export const verifyOtpSchema = z.object({
  email: z.string().email('Enter a valid email'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export type SignupInput = z.infer<typeof signupSchema>
```

Và cách dùng trong action — 📄 `actions/auth.actions.ts`:

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

**Bốn điều đúng ở đây:**

1. **`safeParse` không `parse`.** `parse` throw; `safeParse` trả `{ success, data | error }`. Với input
   người dùng, bạn *mong đợi* lỗi validate — dùng dạng không throw.

2. **`Object.fromEntries(formData)`** biến `FormData` thành plain object cho Zod. Lưu ý giới hạn: với
   field có nhiều giá trị cùng tên (checkbox group, multi-file), nó chỉ giữ giá trị **cuối**. Khi cần
   nhiều giá trị, dùng `formData.getAll(name)`.

3. **`parsed.data` là dữ liệu ĐÃ validate và ĐÃ coerce**, không phải `formData` gốc. Đây là điểm mấu
   chốt: sau `safeParse`, bạn làm việc với dữ liệu có kiểu, đã trim, đã convert. Không bao giờ dùng
   lại `formData.get(...)` cho những field đã qua schema.

4. **`redirect` ngoài `try/catch`** — như đã giải thích ở file `09`.

### Zod làm được nhiều hơn "kiểm tra kiểu"

📄 `lib/validations/product.ts` — **discriminated union**:

```tsx
const baseFields = {
  product_name: z.string().trim().min(1, 'Enter a product name'),
  product_price: z.coerce.number().positive('Price must be greater than 0'),
  product_quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
  product_description: z.string().trim().optional(),
}

const clothing = z.object({
  ...baseFields,
  product_type: z.literal('CLOTHING'),
  brand: z.string().trim().min(1, 'Enter a brand'),
  color: z.string().trim().min(1, 'Enter a color'),
  size: z.string().trim().min(1, 'Enter a size'),
  material: z.string().trim().optional(),
})

const electronics = z.object({
  ...baseFields,
  product_type: z.literal('ELECTRONICS'),
  manufacturer: z.string().trim().min(1, 'Enter a manufacturer'),
  model: z.string().trim().optional(),
})

export const productDetailsSchema = z.discriminatedUnion('product_type', [clothing, electronics])
```

**Đây là một schema xuất sắc.** Nó mã hoá luật nghiệp vụ vào kiểu dữ liệu: *"nếu là CLOTHING thì phải
có brand/color/size; nếu là ELECTRONICS thì phải có manufacturer."*

Cùng luật đó được thể hiện ở UI — 📄 `components/products/attribute-fields.tsx`:

```tsx
export function AttributeFields({ type, defaults }: { type: ProductType; defaults?: Record<string, unknown> }) {
  const dv = (k: string) => (defaults?.[k] != null ? String(defaults[k]) : undefined)
  if (type === 'CLOTHING') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="brand" label="Brand" required defaultValue={dv('brand')} />
        <Field name="color" label="Color" required defaultValue={dv('color')} />
        <Field name="size" label="Size" required defaultValue={dv('size')} />
        <Field name="material" label="Material" defaultValue={dv('material')} />
      </div>
    )
  }
  if (type === 'ELECTRONICS') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="manufacturer" label="Manufacturer" required defaultValue={dv('manufacturer')} />
        <Field name="model" label="Model" defaultValue={dv('model')} />
      </div>
    )
  }
  return <p className="text-sm text-muted-foreground">This product type isn&apos;t available yet.</p>
}
```

⚖️ **Nhưng đây cũng là chỗ có sự trùng lặp thật:** luật "CLOTHING cần brand/color/size" được viết
**hai lần** — một lần trong Zod schema, một lần trong JSX. Thêm field `pattern` cho CLOTHING nghĩa là
sửa hai file, và không có gì bắt buộc bạn nhớ.

Một hướng khắc phục: sinh field từ một khai báo chung:

```tsx
// lib/validations/product-attributes.ts
export const ATTRIBUTE_SPECS = {
  CLOTHING: [
    { name: 'brand',    label: 'Brand',    required: true },
    { name: 'color',    label: 'Color',    required: true },
    { name: 'size',     label: 'Size',     required: true },
    { name: 'material', label: 'Material', required: false },
  ],
  ELECTRONICS: [
    { name: 'manufacturer', label: 'Manufacturer', required: true },
    { name: 'model',        label: 'Model',        required: false },
  ],
} as const
```

Rồi cả Zod schema và `AttributeFields` đều đọc từ `ATTRIBUTE_SPECS`. Một nguồn sự thật.

⚖️ Trade-off: thêm một lớp gián tiếp, và schema sinh động thường khó đọc hơn schema viết tay. Với hai
loại sản phẩm thì trùng lặp còn quản lý được; với mười loại thì nên trích ra.

### Cross-field validation với `.refine()`

📄 `lib/validations/discount.ts` — ví dụ tốt nhất về validate liên field:

```tsx
export const createDiscountSchema = z
  .object({
    // ...các field...
    discount_applies_to: z.enum(['all', 'specific_products']),
    // Raw comma-separated string from the form; split in the action.
    discount_product_ids: z.string().trim().optional(),
  })
  .refine((d) => d.discount_type !== 'percentage' || d.discount_value <= 100, {
    message: 'Percentage must be between 0 and 100',
    path: ['discount_value'],
  })
  .refine((d) => new Date(d.discount_end_date) > new Date(d.discount_start_date), {
    message: 'End date must be after the start date',
    path: ['discount_end_date'],
  })
  .refine(
    (d) =>
      d.discount_applies_to !== 'specific_products' ||
      (d.discount_product_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).length > 0,
    { message: 'Enter at least one product id', path: ['discount_product_ids'] },
  )
```

Ba luật **không thể** biểu diễn bằng kiểu của một field đơn lẻ:

1. Percentage ≤ 100 (chỉ áp dụng khi `type === 'percentage'`)
2. Ngày kết thúc sau ngày bắt đầu
3. Có product IDs nếu `applies_to === 'specific_products'`

**Chú ý `path:` trong mỗi refine.** Nó gắn lỗi vào field cụ thể — mở đường cho việc hiện lỗi ngay
cạnh input đó (nếu bạn nâng `ActionState` như mục 3 đề xuất):

```tsx
if (!parsed.success) {
  return {
    status: 'error',
    message: 'Vui lòng kiểm tra lại các trường được đánh dấu',
    fieldErrors: Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    ),
  }
}
```

```tsx
// Trong form
<Input id="discount_value" name="discount_value" type="number" aria-invalid={!!state.fieldErrors?.discount_value} />
{state.fieldErrors?.discount_value ? (
  <p role="alert" className="text-xs text-destructive">{state.fieldErrors.discount_value}</p>
) : null}
```

⚠️ **Hiện tại repo chỉ dùng lỗi đầu tiên:**

```tsx
if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
```

Nếu người dùng sai 3 field, họ chỉ thấy 1 lỗi, sửa xong lại thấy lỗi tiếp — chu kỳ submit-lỗi-sửa lặp
3 lần. Đây là cải thiện UX rõ ràng nhất mà việc nâng `ActionState` mang lại.

### Tiền xử lý FormData

📄 `actions/discount.actions.ts`:

```tsx
// Optional numeric fields arrive as '' when left blank; drop them so z.optional applies.
function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== undefined && v !== null) out[k] = v
  }
  return out
}

export async function createDiscountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = pruneEmpty(Object.fromEntries(formData))
  const parsed = createDiscountSchema.safeParse(raw)
```

**Vấn đề nó giải quyết:** HTML form gửi `<input name="discount_max_uses">` để trống thành **chuỗi rỗng
`''`**, không phải `undefined`. Nhưng schema là:

```tsx
discount_max_uses: z.coerce.number().int().min(1).optional(),
```

`z.coerce.number()` với `''` cho ra `0` (vì `Number('') === 0`), rồi `.min(1)` fail → lỗi
"Too small" cho một field mà người dùng **cố ý** để trống. `pruneEmpty` xoá field đó đi để `.optional()`
được áp dụng.

**Đây là một khoảng trống thật giữa HTML và schema validation**, và cách xử lý bằng một hàm nhỏ có
comment giải thích là đúng đắn.

*Cách khác (Zod-only):*

```tsx
discount_max_uses: z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().min(1).optional(),
),
```

Gọn hơn về mặt kiến trúc (logic ở cùng chỗ với schema), nhưng phải viết cho từng field. Cách của repo
áp dụng một lần cho tất cả. Cả hai đều hợp lệ.

---

## 7. ⚠️ Bảo mật — phần quan trọng nhất của chương

### Nhắc lại: Server Action là endpoint công khai

Xem lại action này với con mắt của người tấn công — 📄 `actions/product.actions.ts`:

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

**`id` đến hoàn toàn từ client.** Kẻ tấn công (đã đăng nhập với tài khoản của họ) có thể gửi ID sản
phẩm của **shop khác**.

**Điều gì ngăn họ?** Chỉ có một thứ: `apiFetch(..., { auth: true })` gửi token của họ, và **backend
phải kiểm tra** rằng sản phẩm đó thuộc shop của họ.

**Đây là một kiến trúc hợp lệ** — backend là nơi giữ quyền phán quyết. Nhưng cần nói rõ hai điều:

**(a) Route middleware KHÔNG bảo vệ Server Action.**

📄 `proxy.ts`:

```tsx
export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
```

Proxy gate **route**. Nó kiểm tra `shouldGateShop(pathname, roles)` cho các request điều hướng. Nhưng:

- Nó chỉ kiểm tra **role `shop`**, không kiểm tra **quyền sở hữu resource cụ thể**
- Kiểm tra dựa trên `pathname` của request, không phải trên nội dung action

Nói cách khác: proxy trả lời "người này có được vào khu vực seller không?", **không** trả lời
"người này có được sửa sản phẩm ID này không?". Câu hỏi thứ hai chỉ backend trả lời được.

**(b) Nếu bạn không hoàn toàn tin backend, hãy thêm một tầng ở action.**

Nguyên tắc **defense in depth**: một lỗi ở một tầng không nên đủ để gây thiệt hại.

```tsx
// lib/auth/require.ts
import 'server-only'
import { getAccessPayload } from '@/lib/auth/session'
import type { JwtPayload } from '@/types/api'

export class AuthError extends Error {
  constructor(message = 'Bạn không có quyền thực hiện hành động này') {
    super(message)
    this.name = 'AuthError'
  }
}

/** Bảo đảm request có session hợp lệ với role yêu cầu. Throw nếu không. */
export async function requireRole(role: string): Promise<JwtPayload> {
  const payload = await getAccessPayload()
  if (!payload) throw new AuthError('Phiên đăng nhập đã hết hạn')
  if (!payload.roles?.includes(role)) throw new AuthError()
  return payload
}
```

```tsx
// actions/product.actions.ts
import { requireRole, AuthError } from '@/lib/auth/require'

export async function publishProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  try {
    await requireRole('shop')       // ← tầng phòng thủ đầu tiên, ở server
    await apiFetch(`/product/published/${id}`, { method: 'PATCH', auth: true, body: {} })
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: e.message }
    return { ok: false, message: errorMessage(e, 'Could not publish the product') }
  }
  revalidatePath('/seller/products')
  return { ok: true, message: 'Product published' }
}
```

⚠️ **Lưu ý quan trọng về `decodeJwt`:** 📄 `lib/auth/tokens.ts` **decode** JWT chứ **không verify
signature**:

```tsx
export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    // ... base64 decode, JSON.parse
  } catch {
    return null
  }
}
```

Nghĩa là `requireRole` chỉ tin vào **nội dung của cookie**, không kiểm tra chữ ký. Với cookie
`httpOnly` + `sameSite: 'lax'` thì JavaScript của trang không đọc/ghi được — nhưng đây vẫn **không
phải xác thực thật**.

Nên hiểu đúng vai trò của từng tầng:

| Tầng | Kiểm tra gì | Đủ để bảo mật? |
| --- | --- | --- |
| `proxy.ts` + `shouldGateShop` | Role trong JWT (chưa verify) | ❌ Chỉ để UX: chuyển hướng người không có quyền |
| `requireRole` trong action (đề xuất) | Role trong JWT (chưa verify) | ❌ Chỉ để chặn sớm, giảm request rác |
| **Backend với token đã verify** | Signature + quyền sở hữu resource | ✅ **Đây mới là nguồn phán quyết** |

> **Kết luận:** kiến trúc hiện tại **an toàn nếu backend làm đúng việc của nó**. Các tầng ở frontend
> là UX và defense-in-depth, không phải bảo mật. Điều quan trọng là **biết rõ điều đó** — vì nếu bạn
> tưởng `shouldGateShop` là lớp bảo mật, bạn có thể bỏ kiểm tra ở backend.

### ⚠️ Một `console.log` bị bỏ lại

📄 `actions/product.actions.ts`:

```tsx
export async function prepareImagesAction(_prev: PrepareState, formData: FormData): Promise<PrepareState> {
  const files = formData
    .getAll('images')
    .filter((f) => f instanceof File && f.size > 0)
  console.log('🚀 ~ files:', files)          // ← debug bị bỏ lại
  if (files.length === 0)
    return { ok: false, message: 'Choose at least one image' }
```

Đây là log **phía server**, nên nó không lộ ra client — nhưng vẫn nên xoá:

- Nó in metadata của File object (tên file người dùng, size, type) vào log production
- Với nhiều file lớn, nó làm log ồn và tốn I/O
- Tên file người dùng có thể chứa thông tin cá nhân (`cmnd-nguyen-van-a.jpg`)

Nếu cần log, dùng logger có cấu trúc và chỉ log cái an toàn:

```tsx
console.info('[prepareImages] uploading', { count: files.length })
```

### Xử lý file upload

📄 `actions/product.actions.ts` — `addProductImagesAction`:

```tsx
export async function addProductImagesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Missing product id' }
  const files = formData
    .getAll('images')
    .filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0)
    return { ok: false, message: 'Choose at least one image' }
  // Backend reads multipart field `images`; strip the id field first.
  const upload = new FormData()
  for (const f of files) upload.append('images', f)
  try {
    await apiFetch(`/product/upload/images/${id}`, {
      method: 'PUT',
      multipart: upload,
      auth: true,
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not add images') }
  }
  revalidatePath(`/seller/products/${id}/edit`)
  return { ok: true, message: 'Images added' }
}
```

**Ba chi tiết đúng:**

1. **`getAll('images')`** — không phải `get('images')`. Input có `multiple`, nên có nhiều file.
2. **`.filter((f) => f instanceof File && f.size > 0)`** — browser có thể gửi một File rỗng khi
   input trống. Filter này loại nó ra.
3. **Tạo `FormData` mới** thay vì gửi cả `formData` gốc. Comment giải thích: backend chỉ đọc field
   `images`, và field `id` (dùng cho URL) không nên lọt vào body multipart.

⚠️ **Còn thiếu: validate file.** Hiện tại action nhận **bất kỳ** file nào, kích thước nào:

```tsx
const MAX_FILE_BYTES = 5 * 1024 * 1024        // 5MB
const MAX_FILES = 8
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)

if (files.length === 0) return { ok: false, message: 'Choose at least one image' }
if (files.length > MAX_FILES) return { ok: false, message: `Tối đa ${MAX_FILES} ảnh mỗi lần` }

for (const f of files) {
  if (!ALLOWED.has(f.type))
    return { ok: false, message: `${f.name}: chỉ nhận ảnh JPEG, PNG, WebP hoặc AVIF` }
  if (f.size > MAX_FILE_BYTES)
    return { ok: false, message: `${f.name}: vượt quá 5MB` }
}
```

`accept="image/*"` trên input **chỉ là gợi ý cho file picker** — nó không ràng buộc gì cả. Người tấn
công gửi POST trực tiếp không đi qua input nào.

Chú ý `(f): f is File =>` — type predicate giúp TypeScript biết mảng kết quả là `File[]`, nên
`f.type` và `f.size` truy cập được mà không cần cast.

---

## 8. `revalidatePath` trong action — checklist

Mỗi action thay đổi dữ liệu phải trả lời: **"những trang nào hiển thị dữ liệu này?"**

📄 Audit repo:

| Action | Revalidate | Đủ chưa? |
| --- | --- | --- |
| `addToCartAction` | `/cart` | ⚠️ Thiếu badge ở layout `(store)` |
| `updateCartQuantityAction` | `/cart` | ✅ (badge count không đổi khi sửa số lượng) |
| `removeFromCartAction` | `/cart` | ⚠️ Thiếu badge |
| `clearCartAction` | `/cart` | ⚠️ Thiếu badge |
| `placeOrderAction` | `/orders` | ⚠️ Thiếu `/cart` (giỏ đã trống sau khi đặt) |
| `cancelOrderAction` | `/orders` | ❌ Thiếu `/orders/${orderId}` (xem file `10`) |
| `createCommentAction` | `/products/${productId}` | ✅ |
| `deleteCommentAction` | `/products/${productId}` | ✅ |
| `createProductAction` | `/seller/products` | ✅ (rồi redirect) |
| `updateProductAction` | `/seller/products/${id}/edit` + `/seller/products` | ✅ Tốt — cả hai trang |
| `publishProductAction` | `/seller/products` | ⚠️ Thiếu `/` và `/products/${id}` (danh mục công khai) |
| `unpublishProductAction` | `/seller/products` | ⚠️ Cùng vấn đề |
| `createDiscountAction` | `/seller/discounts` | ✅ |
| `upgradeToShopAction` | `/seller/account` | ⚠️ Thiếu layout `(store)` (header đổi từ "Start Selling" → "Seller Centre") |
| `updateAvatarAction` | `/seller/account` | ✅ |

`updateProductAction` là mẫu tốt nhất — nó revalidate **cả hai** trang bị ảnh hưởng:

```tsx
revalidatePath(`/seller/products/${id}/edit`)
revalidatePath('/seller/products')
```

> **Checklist trước khi commit một action mới:**
> 1. Dữ liệu này hiện ở những trang nào? (Grep tên endpoint trong `app/`)
> 2. Có trang nào trong **layout** hiển thị nó? (→ cần `revalidatePath(path, 'layout')`)
> 3. Nếu ≥ 3 trang → dùng `revalidateTag` thay vì liệt kê URL

---

## 9. Trade-offs

| Lợi ích của Server Actions | Cái giá |
| --- | --- |
| Ít code hơn nhiều — không cần API route, không cần fetch ở client | **Mỗi export là một endpoint công khai** — phải validate + authz trong từng cái |
| Type-safe end-to-end (cùng TypeScript, cùng type) | Không có OpenAPI spec; client khác (mobile) không dùng được |
| Progressive enhancement miễn phí | Chỉ khi bạn giữ hidden input + uncontrolled — dễ mất khi thêm state |
| `revalidatePath` tích hợp — mutation và cache cùng chỗ | Dễ quên một path → dữ liệu cũ im lặng |
| Chạy trên server → truy cập secret, DB trực tiếp | Debug khó hơn: lỗi ở server, hiện ở client, message bị ẩn ở production |
| Truyền được như giá trị hạng nhất (chọn action bằng biểu thức) | Action ID nằm trong client bundle → mọi endpoint đều discoverable |

**Vì sao đánh đổi này đáng:** nó xoá bỏ toàn bộ tầng "API cho chính app của mình" — thứ chiếm rất
nhiều code mà không tạo giá trị nghiệp vụ. Nhưng nó đòi hỏi bạn **kỷ luật về bảo mật**, vì rào cản
tạo endpoint đã biến mất.

---

## 10. Best Practices

1. **Coi mọi Server Action như một public API.** Validate mọi input, kiểm tra quyền, không tin gì
   từ client. `accept="image/*"` không phải validation.

2. **Zod ở đầu mỗi action.** `safeParse`, không `parse`. Dùng `parsed.data`, đừng đọc lại `formData`.

3. **`redirect()`/`notFound()` luôn ngoài `try/catch`.** `redirect()` throw `NEXT_REDIRECT`.

4. **Giữ progressive enhancement:** hidden input thay vì `.bind()`, uncontrolled input thay vì
   controlled, và dùng `formAction` trên button khi cần nhiều hành động trong một form.

5. **Server Action đơn giản không cần `'use client'`.** `<form action={logoutAction}>` trong Server
   Component gửi 0 byte JavaScript.

6. **Audit `revalidatePath` cho mỗi action.** Dùng checklist mục 8. Ưu tiên sửa `cancelOrderAction`.

7. **Nâng `ActionState` lên discriminated union nếu bạn cần lỗi theo field.** Đây là cải thiện UX rõ
   nhất: người dùng thấy tất cả lỗi một lượt thay vì sửa từng cái.

8. **Trích `useActionToast` để bỏ 17 chỗ trùng lặp.** (File `03`)

9. **Xoá `console.log('🚀 ~ files:', files)`.** Nếu cần log, dùng dạng có cấu trúc và không log dữ liệu
   người dùng.

10. **Viết comment giải thích ngoại lệ.** `logoutAction` không dùng `apiFetch`, `clearCartAction` không
    có `prevState`, `discount_shop_id` được gửi dù server ghi đè — cả ba đều có comment nói *vì sao*.
    Đây là chất lượng cao.

---

## Tự kiểm tra

1. `'use server'` tạo ra cái gì ở tầng HTTP? Hệ quả bảo mật là gì?
2. Vì sao `SubmitButton` phải là component riêng, không phải để tái sử dụng?
3. Kể bốn chi tiết kỹ thuật làm `cart-line.tsx` hoạt động không cần JavaScript.
4. `pruneEmpty` giải quyết vấn đề gì? Có cách nào khác?
5. Điều gì thực sự ngăn một seller publish sản phẩm của shop khác?
6. Vì sao `logoutAction` bỏ qua lỗi mạng bằng `catch {}`? Đó là quyết định đúng hay sai?
7. Vì sao `proxy.ts` không bảo vệ được Server Action?
8. Nêu ba action có `revalidatePath` chưa đủ và cách sửa.

➡️ Tiếp theo: `12-proxy-middleware-va-auth.md`
