# 21. TypeScript nâng cao cho React

> **Mục tiêu:** dùng type system như một **công cụ thiết kế**, không chỉ để bắt typo. Sau chương này
> bạn sẽ biết cách làm cho một class bug **không thể compile được** — thay vì phải viết test cho nó.

---

## 1. Overview

### Hai cách dùng TypeScript

**Cách 1 — như một linter:** viết code JavaScript, thêm type để IDE autocomplete và bắt typo.
Đây là cách phần lớn dự án dùng. Nó có giá trị, nhưng hạn chế.

**Cách 2 — như một công cụ mô hình hoá:** thiết kế **kiểu trước**, để kiểu **loại bỏ** những trạng thái
và phép gán không hợp lệ. Bug không bị "bắt" — nó **không tồn tại**.

Chương này về cách 2.

### Repo này đang ở đâu

📄 `tsconfig.json` có `"strict": true` — nền tảng tốt. Và có nhiều chỗ dùng type khá tinh:

```tsx
// types/order.ts — derive type từ VALUE, một nguồn sự thật
export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'failed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
```

```tsx
// lib/validations/product.ts — discriminated union mã hoá luật nghiệp vụ
export const productDetailsSchema = z.discriminatedUnion('product_type', [clothing, electronics])
export type ProductDetailsInput = z.infer<typeof productDetailsSchema>
```

```tsx
// types/product.ts — union cho dữ liệu backend nhiều hình dạng
export type Decimal = number | string | { $numberDecimal: string }
```

**Nhưng có một class bug lớn mà type hiện tại không chặn.** Đó là chỗ chương này bắt đầu.

---

## 2. ⭐ Branded Types — bug ID mà repo đang mở cửa cho

### Vấn đề

Đếm số kiểu ID trong repo, **tất cả đều là `string`**:

```tsx
// types/product.ts
export interface Product { _id: string; /* ... */ }

// types/order.ts
export interface Order { _id: string; /* ... */ }
export interface OrderProduct { productId: string; /* ... */ }
export interface ShopOrderItem { shopId: string; /* ... */ }

// types/comment.ts
export interface Comment {
  id: string
  productId: string
  userId: string
  parentId: string | null
  replyToUserId: string | null
}

// types/api.ts
export interface JwtPayload { userId: string; /* ... */ }
```

**Nghĩa là mọi phép gán sau đây compile được:**

```tsx
// Trong app/(store)/orders/[id]/page.tsx
const order = await apiFetch<Order>(`/order/${id}`, { auth: true })
const products = order.order_products.flatMap((s) => s.item_products)

// ❌ TẤT CẢ compile OK, tất cả đều SAI:
await apiFetch<Product>(`/product/${order._id}`)              // order ID vào endpoint product
<CancelOrderButton orderId={products[0].productId} />          // product ID vào chỗ cần order ID
<CommentForm productId={order._id} />                          // order ID vào chỗ cần product ID
deleteCommentAction(fd)  // với commentId = userId
```

**Đây không phải bug giả định.** Xem `components/store/comment-section.tsx`:

```tsx
function DeleteButton({ commentId, productId }: { commentId: string; productId: string }) {
  // ...
  <input type="hidden" name="commentId" value={commentId} />
  <input type="hidden" name="productId" value={productId} />
```

Hai tham số **cùng kiểu**, cạnh nhau. Gọi `<DeleteButton commentId={productId} productId={commentId} />`
compile hoàn hảo. Bug chỉ lộ ra ở runtime, dưới dạng "không xoá được comment" — và bạn sẽ đi debug
backend trước khi nghĩ tới việc hai tham số bị đổi chỗ.

### Giải pháp: Branded (Nominal) Types

TypeScript dùng **structural typing** — hai kiểu giống cấu trúc thì tương thích. Branded type mô phỏng
**nominal typing** bằng cách thêm một field "ảo" chỉ tồn tại ở compile time:

```tsx
// types/ids.ts
declare const brand: unique symbol

/** Gắn một "nhãn" vào kiểu gốc. Nhãn chỉ tồn tại lúc compile — runtime vẫn là string. */
type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand }

export type ProductId = Brand<string, 'ProductId'>
export type OrderId = Brand<string, 'OrderId'>
export type CommentId = Brand<string, 'CommentId'>
export type UserId = Brand<string, 'UserId'>
export type ShopId = Brand<string, 'ShopId'>
export type DiscountId = Brand<string, 'DiscountId'>

/**
 * Các hàm ép kiểu — điểm DUY NHẤT nơi string trở thành một ID có nhãn.
 * Chúng validate hình dạng, nên vừa là type assertion vừa là runtime guard.
 */
const OBJECT_ID = /^[a-f\d]{24}$/i

function makeId<T extends string>(brandName: T) {
  return {
    /** Ném lỗi nếu không phải ObjectId hợp lệ. Dùng khi bạn TIN nguồn dữ liệu. */
    parse(value: string): Brand<string, T> {
      if (!OBJECT_ID.test(value)) {
        throw new Error(`Invalid ${brandName}: ${value}`)
      }
      return value as Brand<string, T>
    },
    /** Trả null nếu không hợp lệ. Dùng cho input người dùng (params, formData). */
    safeParse(value: unknown): Brand<string, T> | null {
      return typeof value === 'string' && OBJECT_ID.test(value)
        ? (value as Brand<string, T>)
        : null
    },
  }
}

export const ProductId = makeId('ProductId')
export const OrderId = makeId('OrderId')
export const CommentId = makeId('CommentId')
export const UserId = makeId('UserId')
export const ShopId = makeId('ShopId')
```

### Áp dụng vào types

```tsx
// types/product.ts
import type { ProductId, ShopId } from '@/types/ids'

export interface Product {
  _id: ProductId              // ← không còn là string trần
  product_name: string
  product_shop?: ShopId
  // ...
}
```

```tsx
// types/comment.ts
import type { CommentId, ProductId, UserId } from '@/types/ids'

export interface Comment {
  id: CommentId
  productId: ProductId
  userId: UserId
  content: string
  parentId: CommentId | null       // ← reply trỏ tới CommentId, không phải string bất kỳ
  replyToUserId: UserId | null
  user?: CommentAuthor
  replyToUser?: CommentAuthor
  createdAt?: string
}
```

```tsx
// components/store/comment-section.tsx
function DeleteButton({ commentId, productId }: { commentId: CommentId; productId: ProductId }) {
```

Giờ thì:

```tsx
// ✅ Đúng
<DeleteButton commentId={comment.id} productId={productId} />

// ❌ LỖI COMPILE — bug được bắt trước khi chạy
<DeleteButton commentId={productId} productId={comment.id} />
//                       ^^^^^^^^^ Type 'ProductId' is not assignable to type 'CommentId'
```

### Ranh giới: nơi string trở thành ID

Branded type chỉ có giá trị nếu bạn kiểm soát được **điểm vào**. Có đúng ba điểm:

**(1) Từ `params` của route:**

```tsx
// app/(store)/orders/[id]/page.tsx
import { notFound } from 'next/navigation'
import { OrderId } from '@/types/ids'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>          // Next.js cho string — không tránh được
}) {
  const { id } = await params
  const orderId = OrderId.safeParse(id)
  if (!orderId) notFound()                 // ⭐ ID sai hình dạng → 404 ngay, không gọi API

  const order = await apiFetch<Order>(`/order/${orderId}`, { auth: true })
  // Từ đây `orderId` có kiểu OrderId — không thể dùng lẫn
}
```

**Điểm cộng ngoài dự kiến:** bạn vừa được **validate miễn phí**. Trước đó, `/orders/abc` (ID sai) sẽ
gọi API rồi nhận lỗi. Giờ nó trả 404 ngay, không tốn round-trip.

**(2) Từ `FormData` trong Server Action:**

```tsx
// actions/comment.actions.ts
import { CommentId, ProductId } from '@/types/ids'

export async function deleteCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const commentId = CommentId.safeParse(formData.get('commentId'))
  const productId = ProductId.safeParse(formData.get('productId'))
  if (!commentId || !productId) return { ok: false, message: 'Missing comment' }

  try {
    await apiFetch('/comment', { method: 'DELETE', auth: true, body: { commentId, productId } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not delete the comment') }
  }
  revalidatePath(`/products/${productId}`)
  return { ok: true, message: 'Comment deleted' }
}
```

So sánh với bản gốc:

```tsx
// TRƯỚC — chỉ kiểm tra "có tồn tại"
const commentId = String(formData.get('commentId') ?? '')
const productId = String(formData.get('productId') ?? '')
if (!commentId || !productId) return { ok: false, message: 'Missing comment' }
```

Bản gốc nhận `commentId = "'; DROP TABLE"` và gửi lên backend. Bản mới từ chối ngay.
**Branded type biến việc validate thành bắt buộc** — bạn không thể có `CommentId` mà không đi qua
`safeParse`.

**(3) Từ response của API** — dùng `parse` (throw) vì bạn tin backend:

```tsx
// Nếu muốn chặt chẽ hoàn toàn, validate cả response bằng Zod (xem mục 6)
```

⚖️ **Trade-off thật của branded types:**

| Lợi ích | Cái giá |
| --- | --- |
| Cả một class bug thành lỗi compile | Phải thêm `.safeParse()` ở mọi điểm vào |
| Validate hình dạng ID trở thành bắt buộc | Một file `types/ids.ts` + khái niệm mới để giải thích cho team |
| Đọc signature là biết cần ID gì | Đôi khi phải cast khi làm việc với API bên thứ ba |
| 404 sớm, không tốn round-trip | Với codebase đã lớn, migration tốn công |

**Khi nào đáng:** khi bạn có **≥3 loại ID** và chúng **xuất hiện cạnh nhau** trong signature.
Repo này có 6 loại ID và `DeleteButton({ commentId, productId })` là ví dụ sống — **rõ ràng đáng**.

**Khi nào không:** app có một loại ID duy nhất, hoặc ID không bao giờ đi cạnh nhau.

---

## 3. Derive type từ value — một nguồn sự thật

📄 Repo làm đúng ở hai chỗ:

```tsx
// types/order.ts
export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'failed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
```

```tsx
// types/product.ts
export const PRODUCT_TYPES = ['CLOTHING', 'ELECTRONICS', 'SHOES', 'OTHER'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]
export const CREATABLE_TYPES: ProductType[] = ['CLOTHING', 'ELECTRONICS']
```

**Vì sao pattern này quan trọng:** bạn cần **cả** giá trị runtime (để `.map()` ra `<SelectItem>`)
**và** kiểu compile-time. Viết riêng hai lần là hai nguồn sự thật sẽ lệch nhau:

```tsx
// ❌ Hai nguồn sự thật
export type ProductType = 'CLOTHING' | 'ELECTRONICS' | 'SHOES' | 'OTHER'
export const PRODUCT_TYPES = ['CLOTHING', 'ELECTRONICS', 'SHOES']    // thiếu OTHER, không ai biết
```

Với `as const` + `[number]`, thêm một loại vào array là **tự động** cập nhật kiểu.

### `as const` làm gì chính xác

```tsx
const a = ['x', 'y']              // string[]
const b = ['x', 'y'] as const     // readonly ["x", "y"]

type A = (typeof a)[number]        // string          ← vô dụng
type B = (typeof b)[number]        // "x" | "y"       ← đúng
```

`as const` làm hai việc: (1) `readonly`, (2) **literal type** thay vì widened type.

### ⚠️ Chỗ repo còn thiếu `as const`

📄 `components/store/checkout-wizard.tsx`:

```tsx
const [method, setMethod] = useState('COD')
// ...
<SelectItem value="COD">Cash on delivery</SelectItem>
<SelectItem value="CARD">Card</SelectItem>
<SelectItem value="MOMO">MoMo</SelectItem>
```

`method` có kiểu `string`. Nên:

```tsx
setMethod('BITCOIN')     // ✅ compile — nhưng backend không hỗ trợ
setMethod('cod')         // ✅ compile — sai case, backend từ chối
```

**Sửa — derive từ một nguồn:**

```tsx
// types/order.ts
export const PAYMENT_METHODS = ['COD', 'CARD', 'MOMO'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Nhãn hiển thị — Record bắt buộc đủ mọi key. */
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  COD: 'Thanh toán khi nhận hàng',
  CARD: 'Thẻ tín dụng',
  MOMO: 'Ví MoMo',
}
```

```tsx
// checkout-wizard.tsx
const [method, setMethod] = useState<PaymentMethod>('COD')
// ...
<Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
  <SelectContent>
    {PAYMENT_METHODS.map((m) => (
      <SelectItem key={m} value={m}>{PAYMENT_LABELS[m]}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Ba lợi ích cùng lúc:**
- Thêm phương thức mới = sửa **một** array; `Record` bắt buộc bạn thêm nhãn (không quên được)
- Không hardcode 3 `<SelectItem>` — không lệch với backend
- `setMethod('BITCOIN')` → lỗi compile

📄 **Cùng vấn đề ở `statusVariant`** — `lib/orders/display.ts`:

```tsx
// Maps an order status to a Badge variant.
export function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'cancelled' || status === 'failed') return 'destructive'
  if (status === 'pending') return 'default'
  return 'secondary'
}
```

Tham số là `string`, không phải `OrderStatus`. Nên `statusVariant('shiping')` (typo) compile được và
âm thầm trả `'secondary'`.

**Sửa và đồng thời có exhaustiveness:**

```tsx
import type { OrderStatus } from '@/types/order'
import { assertNever } from '@/lib/type-utils'

type BadgeVariant = 'default' | 'secondary' | 'destructive'

/**
 * Map trạng thái đơn hàng sang Badge variant.
 * Dùng switch với assertNever để TypeScript bắt lỗi khi thêm status mới.
 */
export function statusVariant(status: OrderStatus): BadgeVariant {
  switch (status) {
    case 'cancelled':
    case 'failed':
      return 'destructive'
    case 'pending':
      return 'default'
    case 'confirmed':
    case 'shipping':
    case 'delivered':
      return 'secondary'
    default:
      return assertNever(status)     // ⭐ thêm status mới → lỗi compile ở đây
  }
}
```

Nếu ai đó thêm `'refunded'` vào `ORDER_STATUSES`, TypeScript báo lỗi ngay tại `assertNever` —
buộc họ quyết định badge nào cho trạng thái đó. Với `if/return 'secondary'` mặc định, `refunded` âm
thầm hiện màu xám và không ai để ý.

```tsx
// lib/type-utils.ts
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`)
}
```

---

## 4. Discriminated Union — công cụ mạnh nhất

### Nguyên tắc

Một union các object, mỗi nhánh có một field **literal** làm "cờ phân biệt" (discriminant).
TypeScript dùng cờ đó để **narrow** kiểu.

📄 Repo dùng rất tốt ở Zod — `lib/validations/product.ts`:

```tsx
const clothing = z.object({
  ...baseFields,
  product_type: z.literal('CLOTHING'),      // ← discriminant
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
export type ProductDetailsInput = z.infer<typeof productDetailsSchema>
```

Lợi ích ở call site:

```tsx
function describe(p: ProductDetailsInput): string {
  if (p.product_type === 'CLOTHING') {
    return `${p.brand} ${p.color} size ${p.size}`      // ✅ TS biết có brand/color/size
    // p.manufacturer  ❌ lỗi compile — CLOTHING không có field này
  }
  return `${p.manufacturer} ${p.model ?? ''}`          // ✅ TS biết có manufacturer
}
```

### ⚠️ Nhưng `splitAttributes` phá vỡ nó

📄 `lib/validations/product.ts`:

```tsx
const ATTRIBUTE_KEYS = ['brand', 'color', 'size', 'material', 'manufacturer', 'model'] as const

export function splitAttributes(data: ProductDetailsInput) {
  const record = data as Record<string, unknown>      // ⚠️ CAST — mất hết type safety
  const attrs: Record<string, unknown> = {}
  for (const k of ATTRIBUTE_KEYS) {
    if (k in record && record[k] !== undefined && record[k] !== '') {
      attrs[k] = record[k]
    }
  }
  return {
    product_name: data.product_name,
    product_price: data.product_price,
    product_quantity: data.product_quantity,
    product_description: data.product_description,
    product_type: data.product_type,
    product_attributes: attrs,                         // ⚠️ Record<string, unknown>
  }
}
```

Hàm này **hoạt động đúng**, nhưng nó `as Record<string, unknown>` — nghĩa là bạn đã dựng một
discriminated union đẹp rồi phá nó ngay ở bước cuối. `product_attributes` trở thành túi `unknown`.

**Cách giữ được type safety bằng exhaustive switch:**

```tsx
export interface ClothingAttributes {
  brand: string
  color: string
  size: string
  material?: string
}
export interface ElectronicsAttributes {
  manufacturer: string
  model?: string
}
export type ProductAttributes = ClothingAttributes | ElectronicsAttributes

/** Bỏ các field undefined/rỗng — HTML form gửi '' cho field trống (file 11). */
function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>
}

export function splitAttributes(data: ProductDetailsInput): {
  product_name: string
  product_price: number
  product_quantity: number
  product_description?: string
  product_type: ProductType
  product_attributes: Partial<ProductAttributes>
} {
  const base = {
    product_name: data.product_name,
    product_price: data.product_price,
    product_quantity: data.product_quantity,
    product_description: data.product_description,
    product_type: data.product_type,
  }

  switch (data.product_type) {
    case 'CLOTHING':
      return {
        ...base,
        product_attributes: compact<ClothingAttributes>({
          brand: data.brand,          // ✅ TS biết các field này tồn tại
          color: data.color,
          size: data.size,
          material: data.material,
        }),
      }
    case 'ELECTRONICS':
      return {
        ...base,
        product_attributes: compact<ElectronicsAttributes>({
          manufacturer: data.manufacturer,
          model: data.model,
        }),
      }
    default:
      return assertNever(data)        // ⭐ thêm loại sản phẩm mới → lỗi compile
  }
}
```

Dài hơn 10 dòng, nhưng đổi lại:
- **Không có cast nào** — mọi field được truy cập type-safe
- `ATTRIBUTE_KEYS` (một array phải bảo trì tay) **biến mất**
- Thêm `SHOES` vào schema → `assertNever` báo lỗi → bạn buộc phải xử lý

⚖️ **Có đáng?** Nếu bạn dự định thêm loại sản phẩm — **có**, vì `assertNever` sẽ chỉ đúng chỗ cần sửa.
Nếu chỉ mãi 2 loại — bản gốc chấp nhận được. Nhớ file `17`: đừng abstract chỉ để đẹp.

### Áp dụng: `ActionState` như discriminated union

Nhắc lại từ file `11`, giờ với chi tiết type:

```tsx
// actions/state.ts
export type FieldErrors = Record<string, string>

export type ActionState<TData = never> =
  | { status: 'idle' }
  | { status: 'success'; message?: string; data?: TData }
  | { status: 'error'; message: string; fieldErrors?: FieldErrors }

export const initialActionState: ActionState = { status: 'idle' }

/** Type guard tiện dụng cho JSX. */
export function isError<T>(s: ActionState<T>): s is Extract<ActionState<T>, { status: 'error' }> {
  return s.status === 'error'
}
```

Lợi ích cụ thể so với `{ ok: boolean; message?: string }`:

```tsx
// TRƯỚC: `message` là optional ở MỌI nhánh → luôn phải kiểm tra
if (!state.ok && state.message) toast.error(state.message)
//                ^^^^^^^^^^^^ bắt buộc, dù lỗi thì LUÔN phải có message

// SAU: ở nhánh 'error', message là BẮT BUỘC → TS đảm bảo
if (state.status === 'error') toast.error(state.message)
//                                        ^^^^^^^^^^^^ TS biết nó tồn tại
```

Và `status: 'idle'` giải quyết vấn đề "không phân biệt được chưa-chạy với đã-chạy-và-lỗi" —
điều mà `{ ok: false }` không làm được.

**Với `data`:**

```tsx
// actions/discount.actions.ts
export async function lookupDiscountByCodeAction(
  _prev: ActionState<Discount>,
  formData: FormData,
): Promise<ActionState<Discount>> {
  const code = String(formData.get('code') ?? '').trim()
  if (!code) return { status: 'error', message: 'Enter a discount code' }
  try {
    const data = await apiFetch<Discount>(`/discount/code/${encodeURIComponent(code)}`)
    return { status: 'success', data }
  } catch (e) {
    return { status: 'error', message: errorMessage(e, 'No usable discount for that code') }
  }
}
```

```tsx
// discount-code-lookup.tsx — narrow tự nhiên, không cần `state.ok && state.data`
{state.status === 'success' && state.data ? (
  <div className="rounded-md border p-3 text-sm">
    <p className="font-medium">{state.data.discount_name}</p>
  </div>
) : null}
{state.status === 'error' ? (
  <p role="alert" className="text-sm text-destructive">{state.message}</p>
) : null}
```

Không còn `LookupState extends ActionState { data?: Discount }` — generic làm việc đó.

---

## 5. Type-safe Component Props

### Kế thừa props của element gốc

📄 Repo dùng đúng ở khắp `components/ui/`:

```tsx
// input.tsx — nhận MỌI prop của <input>, kể cả ref (React 19)
function Input({ className, type, ...props }: React.ComponentProps<"input">) { }

// table.tsx
function TableRow({ className, ...props }: React.ComponentProps<"tr">) { }

// card.tsx — thêm prop riêng vào props của <div>
function Card({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "sm" }) { }
```

**`React.ComponentProps<"input">` vs `React.InputHTMLAttributes<HTMLInputElement>`:**

`ComponentProps` **bao gồm `ref`** (từ React 19), `key`, và các prop React thêm vào.
`InputHTMLAttributes` chỉ có attribute HTML. Dùng `ComponentProps` — nó là cái bạn muốn.

### Kế thừa từ component khác

```tsx
// Props của một component do bạn viết
type ButtonProps = React.ComponentProps<typeof Button>

// Props của primitive từ library
function SelectTrigger({ className, size = "default", children, ...props }: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) { }
```

`@base-ui/react` xuất `Trigger.Props` như một namespace — bạn không phải khai báo lại gì.

### `VariantProps` từ CVA

```tsx
// button.tsx
const buttonVariants = cva("...", {
  variants: {
    variant: { default: "...", outline: "...", secondary: "...", destructive: "...", ghost: "...", link: "..." },
    size: { default: "...", xs: "...", sm: "...", lg: "...", icon: "...", "icon-xs": "...", "icon-sm": "...", "icon-lg": "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
})

function Button({ className, variant = "default", size = "default", ...props }:
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) { }
```

`VariantProps<typeof buttonVariants>` **tự suy ra**:

```tsx
{
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link" | null
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | null
}
```

Thêm một variant vào `cva` config → kiểu tự cập nhật. **Một nguồn sự thật cho cả CSS và type.**

### Generic Component

Chưa có trong repo, nhưng cần cho `<Pagination>` hoặc một `<DataTable>` dùng chung:

```tsx
// components/ui/data-list.tsx
interface DataListProps<T> {
  items: readonly T[]
  /** Lấy key ổn định từ item — bắt buộc, để không ai dùng index (file 15) */
  getKey: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  empty?: React.ReactNode
  className?: string
}

export function DataList<T>({ items, getKey, renderItem, empty, className }: DataListProps<T>) {
  if (items.length === 0) {
    return empty ?? <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
  }
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={getKey(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  )
}
```

```tsx
// TS infer T = Order, không cần khai báo
<DataList
  items={orders}
  getKey={(o) => o._id}          // o có kiểu Order
  renderItem={(o) => <OrderCard order={o} />}
  empty={<p className="text-sm text-muted-foreground">Chưa có đơn hàng nào.</p>}
  className="space-y-4"
/>
```

**Kỹ thuật nâng cao: ràng buộc `getKey` bằng type để chỉ nhận field ID:**

```tsx
/** Chỉ cho phép key là tên field có kiểu string. */
type StringKeys<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T]

interface DataListProps<T> {
  items: readonly T[]
  keyField: StringKeys<T>        // ← thay vì getKey function
  renderItem: (item: T) => React.ReactNode
}

// Dùng:
<DataList items={orders} keyField="_id" renderItem={...} />
//                                 ^^^^^ autocomplete chỉ hiện các field string của Order
//                                       "quantity" (number) → lỗi compile
```

`StringKeys<T>` là một **mapped type có filter**: map mọi key thành `K` nếu giá trị là `string`, thành
`never` nếu không, rồi lấy union — `never` tự biến mất khỏi union.

---

## 6. Validate ranh giới: Zod cho response API

📄 `lib/api/http.ts` hiện `cast` response:

```tsx
export async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) { /* throw ApiError */ }
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data       // ⚠️ CAST — TS tin bạn, không kiểm tra
  }
  return body as T
}
```

**`apiFetch<Order>(...)` chỉ là một lời hứa, không phải bảo đảm.** Nếu backend đổi
`order_products` thành `orderProducts`, TypeScript **không biết gì** — và bạn gặp `TypeError` ở
runtime, trong lúc render (nhớ file `16`).

### Giải pháp: validate ở ranh giới

```tsx
// lib/api/server-client.ts — thêm option `schema`
import type { ZodType } from 'zod'

export interface FetchOptions<T = unknown> {
  method?: string
  body?: unknown
  multipart?: FormData
  auth?: boolean
  tags?: string[]
  cache?: RequestCache
  signal?: AbortSignal
  /** Nếu truyền, response được validate — kiểu trả về suy ra từ schema. */
  schema?: ZodType<T>
}

export async function apiFetch<T>(path: string, opts: FetchOptions<T> = {}): Promise<T> {
  // ...phần fetch giữ nguyên...
  const raw = await unwrap<unknown>(res)

  if (!opts.schema) return raw as T           // hành vi cũ — tương thích ngược

  const parsed = opts.schema.safeParse(raw)
  if (!parsed.success) {
    // Log chi tiết ở server, không lộ ra client
    console.error('[apiFetch] response schema mismatch', {
      path,
      issues: parsed.error.issues.slice(0, 5),
    })
    throw new ApiError(502, 'Dữ liệu từ hệ thống không đúng định dạng')
  }
  return parsed.data
}
```

```tsx
// lib/validations/order.ts
import { z } from 'zod'

const decimalSchema = z.union([
  z.number(),
  z.string(),
  z.object({ $numberDecimal: z.string() }),
])

const orderProductSchema = z.object({
  productId: z.string(),
  price: decimalSchema,
  quantity: z.number(),
  name: z.string(),
  thumb: z.string(),
})

export const orderSchema = z.object({
  _id: z.string(),
  order_checkout: z.object({
    totalPrice: z.number(),
    totalDiscount: z.number(),
    feeShip: z.number(),
    totalCheckout: z.number(),
  }),
  order_shipping: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  order_payment: z.object({ method: z.string().optional() }).optional(),
  order_products: z.array(z.object({
    shopId: z.string(),
    item_products: z.array(orderProductSchema),
    price_raw: z.number(),
    price_apply_discount: z.number(),
  })),
  order_status: z.enum(ORDER_STATUSES),
  order_tracking_number: z.string().optional(),
  createdAt: z.string().optional(),
})

/** Type được DERIVE từ schema — một nguồn sự thật. */
export type Order = z.infer<typeof orderSchema>
```

```tsx
// app/(store)/orders/[id]/page.tsx
const order = await apiFetch(`/order/${orderId}`, { auth: true, schema: orderSchema })
// `order` có kiểu z.infer<typeof orderSchema> — ĐÃ ĐƯỢC KIỂM TRA ở runtime
```

**Ba lợi ích:**

1. **`types/order.ts` không còn cần viết tay** — `z.infer` sinh ra nó. Không thể lệch giữa schema và type.
2. **Lỗi ở đúng chỗ.** Backend đổi field → lỗi ở `apiFetch` với message rõ ràng và log field nào sai,
   thay vì `TypeError: Cannot read properties of undefined` sâu trong `OrderCard`.
3. **`order_products` được đảm bảo là array** → `.flatMap()` an toàn, không cần `?? []` (nhớ file `16`
   về defensive vs fail-fast — giờ bạn được **cả hai**: fail-fast ở ranh giới, an toàn ở trong).

⚖️ **Trade-off:**

| Lợi ích | Cái giá |
| --- | --- |
| Type là bảo đảm runtime, không phải lời hứa | Phải viết schema cho mỗi response type (~30 dòng/type) |
| Lỗi ở ranh giới với message rõ | Chi phí parse mỗi response (nhỏ, nhưng có với array lớn) |
| `z.infer` xoá việc viết type tay | Backend đổi field **optional** → parse fail dù có thể bỏ qua được |
| Bug backend lộ ra ngay | Cần quyết định: strict (`z.object`) hay lỏng (`.passthrough()`) |

**Chiến lược thực dụng:** dùng `schema` cho **các endpoint quan trọng nhất** (order, checkout, cart —
nơi dữ liệu sai gây thiệt hại), bỏ qua cho các endpoint hiển thị đơn giản. Đây là lý do `schema` là
**optional** trong thiết kế trên.

Và dùng `.passthrough()` nếu backend hay thêm field mới:

```tsx
export const orderSchema = z.object({ /* ... */ }).passthrough()
// Field lạ được giữ lại thay vì bị strip → thêm field ở backend không phá frontend
```

---

## 7. Vài kỹ thuật type hữu ích khác

### `satisfies` — kiểm tra mà không widen

```tsx
// ❌ Annotation làm MẤT literal type
const NAV: Record<string, { href: string; label: string }> = {
  dashboard: { href: '/seller', label: 'Dashboard' },
}
NAV.typo    // ✅ compile — Record<string, ...> nhận key nào cũng được

// ✅ satisfies: kiểm tra shape, GIỮ literal type
const NAV = {
  dashboard: { href: '/seller', label: 'Dashboard' },
  products: { href: '/seller/products', label: 'Products' },
} satisfies Record<string, { href: string; label: string }>

NAV.typo         // ❌ lỗi compile
type NavKey = keyof typeof NAV    // "dashboard" | "products"
```

📄 Áp dụng vào `components/seller/nav-items.ts`:

```tsx
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/seller',           icon: LayoutDashboard },
  { label: 'Products',  href: '/seller/products',  icon: Package },
  { label: 'Discounts', href: '/seller/discounts', icon: Tag },
  { label: 'Account',   href: '/seller/account',   icon: User },
] satisfies readonly SellerNavItem[]

/** Union của mọi href — dùng được để type-check link nội bộ. */
export type SellerHref = (typeof NAV_ITEMS)[number]['href']
// "/seller" | "/seller/products" | "/seller/discounts" | "/seller/account"
```

Bản gốc dùng `: SellerNavItem[]` (annotation) nên `href` bị widen thành `string`, và bạn mất khả năng
derive `SellerHref`.

### Type Predicate — repo đã dùng

📄 Trong đề xuất ở file `11`:

```tsx
const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
//                                                 ^^^^^^^^^ type predicate
// files có kiểu File[], không phải (File | string)[]
```

Không có `f is File`, `filter` trả `FormDataEntryValue[]` và bạn phải cast để dùng `f.type`.

📄 Và trong FSM ở file `18`:

```tsx
export function isAddressComplete(a: Address): a is CompleteAddress {
  return Boolean(a.street.trim() && a.city.trim() && a.state.trim() && a.country.trim())
}
```

Type predicate + branded type = **"đã validate" trở thành một tính chất của kiểu**.

### Template Literal Types cho cache tag

Nhớ file `10`: tag như `product:${id}`. Type hoá chúng để không typo:

```tsx
// lib/cache/tags.ts
export type CacheTag =
  | 'products'
  | 'orders'
  | 'cart'
  | `product:${string}`
  | `order:${string}`
  | `comments:${string}`

export const tags = {
  products: () => 'products' as const,
  product: (id: ProductId) => `product:${id}` as const,
  orders: () => 'orders' as const,
  order: (id: OrderId) => `order:${id}` as const,
  comments: (productId: ProductId) => `comments:${productId}` as const,
} satisfies Record<string, (...args: never[]) => CacheTag>
```

```tsx
// Dùng — không thể typo, và ID được type-check
await apiFetch(`/product/${productId}`, {
  cache: 'force-cache',
  tags: [tags.products(), tags.product(productId)],
})

// Trong action
revalidateTag(tags.product(productId))
revalidateTag(tags.products())
```

So với `revalidateTag('prodcut:' + id)` — typo im lặng làm cache không bao giờ được invalidate.
**Đây là loại bug tệ nhất: không có lỗi, chỉ có dữ liệu cũ.**

### `Awaited` cho async params

```tsx
// Thay vì viết lại type của params
type OrderPageParams = Awaited<Parameters<typeof OrderDetailPage>[0]['params']>
// { id: string }
```

Hữu ích khi bạn muốn share type giữa `page.tsx` và `generateMetadata`.

---

## 8. When NOT to over-type

Type system có thể trở thành gánh nặng. Ba dấu hiệu bạn đã đi quá xa:

**(1) Type khó đọc hơn code nó mô tả.**

```tsx
// ❌ Không ai bảo trì được cái này
type DeepPartialExcept<T, K extends keyof T> = {
  [P in keyof T]?: P extends K ? T[P] : T[P] extends object ? DeepPartialExcept<T[P], never> : T[P]
}
```

**(2) Bạn phải `as any` / `@ts-expect-error` để dùng chính type của mình.**
Đó là dấu hiệu type không mô tả đúng thực tế.

**(3) Thêm một field vào interface làm 20 chỗ lỗi compile mà không có chỗ nào thật sự sai.**
Type quá chặt cũng tốn kém như type quá lỏng.

📄 **Ví dụ repo giữ đúng mức lỏng:**

```tsx
// types/product.ts
// product_price arrives as Decimal128 JSON; keep it loose here and normalize on display.
export type Decimal = number | string | { $numberDecimal: string }
```

Comment nói rõ **quyết định có chủ đích**: giữ lỏng ở kiểu, chuẩn hoá ở hàm. Cùng với
`toPriceString`/`toPriceNumber` xử lý cả ba dạng và có test cho từng dạng.

Nếu type chặt hơn (`{ $numberDecimal: string }`), mọi chỗ dùng phải cast — và bạn không kiểm soát
được backend trả gì. **Type lỏng ở ranh giới + hàm chuẩn hoá có test = giải pháp đúng.**

---

## 9. Trade-offs

| Kỹ thuật | Lợi ích | Cái giá |
| --- | --- | --- |
| **Branded types** | Cả class bug ID thành lỗi compile; validate bắt buộc | `.safeParse()` ở mọi điểm vào; khái niệm mới cho team |
| **`as const` + `[number]`** | Một nguồn sự thật cho value + type | Không có (nên dùng mặc định) |
| **Discriminated union** | Trạng thái sai không biểu diễn được | Verbose hơn; cần hiểu narrowing |
| **`assertNever`** | Mở rộng union → lỗi compile ở mọi chỗ thiếu | Thêm một dòng mỗi switch |
| **Zod validate response** | Type thành bảo đảm runtime; lỗi ở ranh giới | ~30 dòng schema/type; chi phí parse |
| **Generic component** | Tái dùng type-safe | Signature phức tạp hơn; TS error khó đọc |
| **`satisfies`** | Kiểm tra shape + giữ literal | Cần TS 4.9+ |
| **Template literal types** | Tag/route không typo được | Chỉ hữu ích khi có nhiều literal |

---

## 10. Best Practices

1. **Derive type từ value bằng `as const` + `[number]`.** Đừng viết union literal tay khi bạn cũng cần
   array runtime.

2. **`Record<Union, T>` để bắt buộc đủ mọi case.** `PAYMENT_LABELS: Record<PaymentMethod, string>` —
   thêm method mới mà quên nhãn = lỗi compile.

3. **`assertNever` ở nhánh default của mọi switch trên union.** Đây là cách rẻ nhất để type system
   bảo vệ bạn khi mở rộng.

4. **Branded types khi có ≥3 loại ID và chúng đi cạnh nhau.** `DeleteButton({ commentId, productId })`
   là dấu hiệu rõ ràng.

5. **Type predicate để "đã validate" trở thành tính chất của kiểu**, không phải một boolean rời rạc.

6. **`ComponentProps<"input">`, không `InputHTMLAttributes`.** Nó bao gồm `ref`.

7. **`satisfies` thay vì annotation** khi bạn muốn giữ literal type.

8. **Validate response bằng Zod ở các endpoint quan trọng**, và `z.infer` thay vì viết interface tay.

9. **Type lỏng ở ranh giới + hàm chuẩn hoá có test.** `Decimal` + `toPriceString` là mẫu đúng.

10. **Đừng over-type.** Nếu type khó đọc hơn code, hoặc bạn phải `as any` để dùng nó — hãy đơn giản hoá.

---

## Tự kiểm tra

1. Chỉ ra một phép gán sai mà `DeleteButton({ commentId, productId })` hiện tại cho phép compile.
2. Branded type hoạt động bằng cách nào? Nó tồn tại ở runtime không?
3. Lợi ích **ngoài dự kiến** của việc dùng `OrderId.safeParse(id)` trong page là gì?
4. `as const` làm hai việc gì? Vì sao cần cả hai cho `(typeof X)[number]`?
5. `statusVariant(status: string)` cho phép bug gì? Sửa thế nào để TS bắt được?
6. `splitAttributes` phá vỡ discriminated union ở đâu? Đánh đổi của việc sửa nó?
7. Vì sao `{ status: 'idle' }` giải quyết được vấn đề mà `{ ok: false }` không giải quyết được?
8. `StringKeys<T>` hoạt động thế nào? `never` biến đi đâu?
9. `apiFetch<Order>()` hiện tại là "lời hứa" hay "bảo đảm"? Zod thay đổi điều đó ra sao?
10. Vì sao `Decimal = number | string | {...}` là type lỏng **đúng đắn**, không phải sự lười?

➡️ Tiếp theo: `22-bundle-va-performance-engineering.md`
