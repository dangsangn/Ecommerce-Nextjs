# 21. TypeScript nâng cao cho React

> **Mục tiêu:** dùng type system như một **công cụ thiết kế**, không chỉ để bắt typo. Sau chương này
> bạn sẽ biết cách làm cho một class bug **không thể compile được** — thay vì phải viết test cho nó.

---

## 1. Overview

Có hai cách dùng TypeScript: **như linter** (thêm type để autocomplete, bắt typo) và **như công cụ mô
hình hoá** (thiết kế kiểu trước để trạng thái/phép gán sai **không biểu diễn được**). Chương này về cách 2,
cộng với những thay đổi type bắt buộc phải biết của **React 19** và **Next.js 16**.

📄 Repo đã có nền tốt: `tsconfig.json` bật `"strict": true`, `types/order.ts` derive `OrderStatus` từ
array `as const`, `lib/validations/product.ts` dùng `z.discriminatedUnion`. **Nhưng có một class bug lớn
mà type hiện tại không chặn** — đó là chỗ chương này bắt đầu.

---

## 2. ⭐ Type của React 19 và Next.js 16 — những gì đã đổi

### React 19 (`@types/react@19`)

```tsx
// (1) Namespace JSX global đã bị bỏ → dùng React.JSX
function Icon(): JSX.Element { }          // ❌ "Cannot find namespace 'JSX'"
function Icon(): React.JSX.Element { }    // ✅ (hoặc để TS tự suy ra — thường là tốt nhất)

// (2) useRef BẮT BUỘC có đối số
const inputRef = useRef<HTMLInputElement>()       // ❌ lỗi: Expected 1 argument
const inputRef = useRef<HTMLInputElement>(null)   // ✅ RefObject<HTMLInputElement | null>
// ref.current giờ luôn mutable — không còn phân biệt MutableRefObject / RefObject "readonly"

// (3) ref là prop thường — không cần forwardRef cho function component
// ❌ Kiểu cũ
const SearchInput = forwardRef<HTMLInputElement, Props>((props, ref) => <input ref={ref} {...props} />)
// ✅ React 19
function SearchInput({ ref, ...props }: React.ComponentProps<'input'>) {
  return <input ref={ref} {...props} />
}

// (4) Callback ref không được trả về giá trị ngầm (vì giờ ref có thể trả về cleanup function)
<div ref={(el) => (cardRef.current = el)} />     // ❌ lỗi type: arrow trả về el
<div ref={(el) => { cardRef.current = el }} />   // ✅
```

Thêm: `ReactElement` có `props` mặc định là `unknown` (không còn `any`); `useReducer` infer từ reducer,
không nên truyền generic tay. Codemod: `npx types-react-codemod@latest preset-19 ./`.

### Next.js 16 — type route được sinh tự động

`next dev` / `next build` / **`next typegen`** sinh ra các helper **global** (không cần import) từ cấu
trúc thư mục `app/`:

```tsx
// app/(store)/orders/[id]/page.tsx — route group (store) bị bỏ khỏi đường dẫn
export default async function OrderDetailPage(props: PageProps<'/orders/[id]'>) {
  const { id } = await props.params          // id: string — đã được type theo [id]
  const sp = await props.searchParams        // Record<string, string | string[] | undefined>
}

// app/(seller)/seller/layout.tsx — children + named slots (@analytics...) đều được type
export default function SellerLayout(props: LayoutProps<'/seller'>) {
  return <section>{props.children}</section>
}

// Route Handler (repo chưa có — ví dụ nếu thêm app/api/products/[id]/route.ts)
export async function GET(_req: NextRequest, ctx: RouteContext<'/api/products/[id]'>) {
  const { id } = await ctx.params
}
```

Gõ sai literal (`PageProps<'/order/[id]'>`) → lỗi compile, vì route đó không tồn tại.

**Typed links** (`typedRoutes: true` — đã stable ở top-level config, không còn `experimental`):

```ts
// next.config.ts
const nextConfig: NextConfig = { typedRoutes: true }
```

```tsx
import type { Route } from 'next'

<Link href="/products/abc" />            // ✅ literal và template literal đều được kiểm tra
<Link href="/prodcuts" />                // ❌ lỗi compile — route không tồn tại
router.push(`/orders/${orderId}`)        // ✅ next/navigation cũng được type
<Link href={('/seller/' + tab) as Route} /> // chuỗi ghép động → phải cast `as Route`
```

⚠️ **CI:** `tsc --noEmit` trên máy sạch sẽ không thấy `PageProps`/`Route` vì `.next/types` chưa tồn tại.
Script `typecheck` của repo nên là `next typegen && tsc --noEmit`.

---

## 3. ⭐ Branded Types — bug ID mà repo đang mở cửa cho

### Vấn đề

Mọi ID trong repo (`Product._id`, `Order._id`, `OrderProduct.productId`, `Comment.id/userId/parentId`,
`JwtPayload.userId`...) **đều là `string`**. Nên các phép gán sai này đều compile:

```tsx
// ❌ TẤT CẢ compile OK, tất cả đều SAI:
await apiFetch<Product>(`/product/${order._id}`)              // order ID vào endpoint product
<CancelOrderButton orderId={products[0].productId} />          // product ID vào chỗ cần order ID
<CommentForm productId={order._id} />                          // order ID vào chỗ cần product ID
```

**Đây không phải bug giả định.** Xem `components/store/comment-section.tsx`:

```tsx
function DeleteButton({ commentId, productId }: { commentId: string; productId: string }) {
  // ...
  <input type="hidden" name="commentId" value={commentId} />
  <input type="hidden" name="productId" value={productId} />
```

Hai tham số **cùng kiểu**, cạnh nhau. Gọi `<DeleteButton commentId={productId} productId={commentId} />`
compile hoàn hảo; bug chỉ lộ ra ở runtime dưới dạng "không xoá được comment".

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
// types/comment.ts
export interface Comment {
  id: CommentId
  productId: ProductId
  userId: UserId
  parentId: CommentId | null       // ← reply trỏ tới CommentId, không phải string bất kỳ
  // ...
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

export default async function OrderDetailPage(props: PageProps<'/orders/[id]'>) {
  const { id } = await props.params        // Next.js cho string — không tránh được
  const orderId = OrderId.safeParse(id)
  if (!orderId) notFound()                 // ⭐ ID sai hình dạng → 404 ngay, không gọi API

  const order = await apiFetch<Order>(`/order/${orderId}`, { auth: true })
  // Từ đây `orderId` có kiểu OrderId — không thể dùng lẫn
}
```

**Điểm cộng ngoài dự kiến:** validate miễn phí — `/orders/abc` trả 404 ngay, không tốn round-trip API.

**(2) Từ `FormData` trong Server Action:**

```tsx
// actions/comment.actions.ts
import { CommentId, ProductId } from '@/types/ids'

export async function deleteCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // ❌ TRƯỚC: String(formData.get('commentId') ?? '') — chỉ kiểm tra "có tồn tại"
  const commentId = CommentId.safeParse(formData.get('commentId'))
  const productId = ProductId.safeParse(formData.get('productId'))
  if (!commentId || !productId) return { ok: false, message: 'Missing comment' }
  // ...gọi API, revalidatePath(`/products/${productId}`)
}
```

Bản gốc nhận `commentId = "'; DROP TABLE"` và gửi lên backend; bản mới từ chối ngay.
**Branded type biến validate thành bắt buộc** — không thể có `CommentId` mà không qua `safeParse`.

**(3) Từ response của API** — dùng `parse` (throw) vì bạn tin backend, hoặc validate cả response bằng
Zod (mục 7).

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

## 4. Derive type từ value — một nguồn sự thật

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
{PAYMENT_METHODS.map((m) => (
  <SelectItem key={m} value={m}>{PAYMENT_LABELS[m]}</SelectItem>
))}
```

Thêm phương thức = sửa **một** array; `Record` bắt buộc thêm nhãn; `setMethod('BITCOIN')` → lỗi compile.

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

Thêm `'refunded'` vào `ORDER_STATUSES` → lỗi compile tại `assertNever`, buộc quyết định badge cho nó.
Với `return 'secondary'` mặc định, `refunded` âm thầm hiện màu xám.

```tsx
// lib/type-utils.ts
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`)
}
```

---

## 5. Discriminated Union — công cụ mạnh nhất

### Nguyên tắc

Một union các object, mỗi nhánh có một field **literal** làm "cờ phân biệt" (discriminant).
TypeScript dùng cờ đó để **narrow** kiểu.

📄 Repo dùng rất tốt ở Zod — `lib/validations/product.ts`:

```tsx
const clothing = z.object({
  ...baseFields,
  product_type: z.literal('CLOTHING'),      // ← discriminant
  brand: z.string().trim().min(1, 'Enter a brand'),
  color: ..., size: ..., material: z.string().trim().optional(),
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
  for (const k of ATTRIBUTE_KEYS) { /* copy field khác undefined/'' */ }
  return { product_name: data.product_name, /* ... */ product_attributes: attrs }  // ⚠️ Record<string, unknown>
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

export function splitAttributes(data: ProductDetailsInput) {
  const { product_name, product_price, product_quantity, product_description, product_type } = data
  const base = { product_name, product_price, product_quantity, product_description, product_type }

  switch (data.product_type) {
    case 'CLOTHING':
      return {
        ...base,
        product_attributes: compact<ClothingAttributes>({
          brand: data.brand, color: data.color, size: data.size, material: data.material,  // ✅ type-safe
        }),
      }
    case 'ELECTRONICS':
      return {
        ...base,
        product_attributes: compact<ElectronicsAttributes>({ manufacturer: data.manufacturer, model: data.model }),
      }
    default:
      return assertNever(data)        // ⭐ thêm loại sản phẩm mới → lỗi compile
  }
}
```

Không cast, `ATTRIBUTE_KEYS` (array bảo trì tay) biến mất, thêm `SHOES` → `assertNever` chỉ đúng chỗ sửa.

⚖️ **Có đáng?** Nếu sẽ thêm loại sản phẩm — **có**. Nếu mãi chỉ 2 loại — bản gốc chấp nhận được (file `17`).

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

**Với `data`** — `lookupDiscountByCodeAction` trả `Promise<ActionState<Discount>>`, và JSX narrow tự nhiên:

```tsx
// discount-code-lookup.tsx — không cần `state.ok && state.data`
{state.status === 'success' && state.data && <p className="font-medium">{state.data.discount_name}</p>}
{state.status === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
```

Không còn `LookupState extends ActionState { data?: Discount }` — generic làm việc đó.

---

## 6. Type-safe Component Props

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

`ComponentProps<"input">` gồm mọi attribute HTML **cộng `ref` và `key`**; `InputHTMLAttributes` chỉ có
attribute HTML. Điều React 19 thay đổi là function component **nhận `ref` như prop thường**, nên
`{...props}` ở trên chuyển luôn `ref` xuống `<input>` — không cần `forwardRef`. Muốn chủ động loại `ref`
khỏi API của component, dùng `React.ComponentPropsWithoutRef<"input">`.

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
    variant: { default: "...", outline: "...", destructive: "...", /* ... */ },
    size: { default: "...", sm: "...", lg: "...", icon: "...", /* ... */ },
  },
  defaultVariants: { variant: "default", size: "default" },
})

function Button({ className, variant = "default", size = "default", ...props }:
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) { }
```

`VariantProps<typeof buttonVariants>` **tự suy ra**:

`{ variant?: "default" | "outline" | "destructive" | ... | null; size?: ... }`. Thêm một variant vào `cva` config → kiểu tự cập nhật. **Một nguồn sự thật cho cả CSS và type.**

### Event handler và hook — để TS suy ra, chỉ khai báo khi tách hàm

```tsx
// ✅ Inline: TS tự suy ra kiểu `e` từ prop onChange — không cần annotate
<Input onChange={(e) => setQuery(e.target.value)} />

// Tách hàm ra ngoài JSX thì phải khai báo — dùng kiểu sự kiện của React, không phải DOM
const onQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => setQty(Number(e.target.value))
const onKey: React.KeyboardEventHandler<HTMLInputElement> = (e) => { if (e.key === 'Enter') submit() }

// useState: chỉ cần generic khi giá trị khởi tạo không đủ nói hết kiểu
const [replyOpen, setReplyOpen] = useState<string | null>(null)   // ✅ null → phải nói rõ union
const [qty, setQty] = useState(1)                                 // ✅ number — suy ra được

// useActionState: kiểu state suy ra từ action + initial state, không cần generic
const [state, formAction, pending] = useActionState(placeOrderAction, initialActionState)
//     ^ ActionState                ^ boolean
```

`children` thì dùng `React.ReactNode` (nhận cả string, `null`, mảng) — không dùng `React.ReactElement`
(chỉ nhận một element JSX) và không cần `React.FC`.

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
  if (items.length === 0) return empty ?? <p>Không có dữ liệu.</p>
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
<DataList items={orders} getKey={(o) => o._id} renderItem={(o) => <OrderCard order={o} />} />
//                              ^ o: Order
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

## 7. Validate ranh giới: Zod cho response API

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
  // ...method, body, auth, tags, cache... giữ nguyên
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

const decimalSchema = z.union([z.number(), z.string(), z.object({ $numberDecimal: z.string() })])

export const orderSchema = z.object({
  _id: z.string(),
  order_checkout: z.object({ totalPrice: z.number(), feeShip: z.number(), totalCheckout: z.number() /* ... */ }),
  order_products: z.array(z.object({
    shopId: z.string(),
    item_products: z.array(z.object({ productId: z.string(), price: decimalSchema, quantity: z.number() /* ... */ })),
  })),
  order_status: z.enum(ORDER_STATUSES),     // Zod 4: z.enum nhận thẳng readonly tuple
  createdAt: z.string().optional(),
  // ...
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

1. **`types/order.ts` không cần viết tay** — `z.infer` sinh ra, không thể lệch schema/type.
2. **Lỗi ở đúng chỗ** — backend đổi field → lỗi ở `apiFetch` kèm log field sai, thay vì `TypeError` sâu
   trong `OrderCard`.
3. **Fail-fast ở ranh giới, an toàn ở trong** (file `16`) — `order_products` chắc chắn là array.

⚖️ **Trade-off:**

| Lợi ích | Cái giá |
| --- | --- |
| Type là bảo đảm runtime, không phải lời hứa | Phải viết schema cho mỗi response type (~30 dòng/type) |
| Lỗi ở ranh giới với message rõ | Chi phí parse mỗi response (nhỏ, nhưng có với array lớn) |
| `z.infer` xoá việc viết type tay | Backend đổi field **optional** → parse fail dù có thể bỏ qua được |
| Bug backend lộ ra ngay | Cần chọn chế độ với field lạ (xem dưới) |

**Chiến lược thực dụng:** dùng `schema` cho **các endpoint quan trọng nhất** (order, checkout, cart),
bỏ qua cho endpoint hiển thị đơn giản — vì vậy `schema` là **optional**.

Field lạ từ backend (repo dùng **Zod 4**):

```tsx
z.object({ /* ... */ })        // mặc định: field lạ bị STRIP (bỏ đi), không lỗi
z.strictObject({ /* ... */ })  // field lạ → lỗi parse
z.looseObject({ /* ... */ })   // field lạ được giữ lại (thay cho .passthrough() đã deprecated ở Zod 4)
```

---

## 8. Vài kỹ thuật type hữu ích khác

### `satisfies` — kiểm tra mà không widen

📄 `components/seller/nav-items.ts` hiện dùng annotation `export const NAV_ITEMS: SellerNavItem[] = [...]`
→ `href` bị widen thành `string`. Dùng `satisfies` để vừa kiểm tra shape vừa giữ literal:

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

Nếu bật `typedRoutes`, khai báo `href: Route` trong `SellerNavItem` còn chặt hơn — href sai route là lỗi compile.

### Type Predicate — repo đã dùng

```tsx
// Đề xuất ở file 11
const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
//                                                 ^^^^^^^^^ type predicate
// files có kiểu File[], không phải (File | string)[]
```

Không có `f is File`, `filter` trả `FormDataEntryValue[]` và bạn phải cast. Tương tự
`isAddressComplete(a): a is CompleteAddress` ở file `18`. Type predicate + branded type = **"đã validate" trở thành một tính chất của kiểu**.

### Template Literal Types cho cache tag

Nhớ file `10`: tag như `product:${id}`. Type hoá chúng để không typo:

```tsx
// lib/cache/tags.ts
export type CacheTag = 'products' | 'orders' | `product:${string}` | `order:${string}` | `comments:${string}`

export const tags = {
  products: () => 'products' as const,
  product: (id: ProductId) => `product:${id}` as const,
  comments: (productId: ProductId) => `comments:${productId}` as const,
  // ...
} satisfies Record<string, (...args: never[]) => CacheTag>
```

```tsx
// Dùng — không thể typo, và ID được type-check
await apiFetch(`/product/${productId}`, { cache: 'force-cache', tags: [tags.products(), tags.product(productId)] })

// Trong Server Action — Next 16: revalidateTag BẮT BUỘC đối số thứ 2 (bản 1 đối số đã deprecated)
revalidateTag(tags.products(), 'max')     // stale-while-revalidate
updateTag(tags.product(productId))        // chỉ trong Server Action: hết hạn ngay, read-your-writes
```

So với `revalidateTag('prodcut:' + id)` — typo im lặng làm cache không bao giờ được invalidate.
**Đây là loại bug tệ nhất: không có lỗi, chỉ có dữ liệu cũ.**

### Share type giữa `page.tsx` và `generateMetadata`

Đừng tự derive bằng `Awaited<Parameters<...>>` — dùng chung helper `PageProps` (mục 2):

```tsx
export async function generateMetadata(props: PageProps<'/products/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  // ...
}
export default async function ProductPage(props: PageProps<'/products/[id]'>) { /* ... */ }
```

---

## 9. When NOT to over-type

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

## 10. Best Practices

1. **React 19:** `React.JSX.Element` (không phải `JSX.Element`), `useRef(null)` luôn có đối số, `ref` là
   prop thường — bỏ `forwardRef`.
2. **Next 16:** dùng `PageProps<'/route'>` / `LayoutProps` / `RouteContext` thay vì tự viết type `params`;
   bật `typedRoutes`; CI chạy `next typegen && tsc --noEmit`.
3. **Derive type từ value** bằng `as const` + `[number]`; **`Record<Union, T>`** để bắt buộc đủ mọi case.
4. **`assertNever`** ở nhánh default của mọi switch trên union.
5. **Branded types** khi có ≥3 loại ID đi cạnh nhau (`DeleteButton({ commentId, productId })`).
6. **Type predicate / branded type** để "đã validate" thành tính chất của kiểu.
7. **`ComponentProps<"input">`** cho wrapper; **`satisfies`** khi cần giữ literal type.
8. **Zod ở các endpoint quan trọng**, `z.infer` thay vì interface tay.
9. **Type lỏng ở ranh giới + hàm chuẩn hoá có test** (`Decimal` + `toPriceString`); đừng over-type.

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
11. `useRef<HTMLInputElement>()` lỗi gì ở React 19? `PageProps<'/orders/[id]'>` lấy từ đâu và vì sao CI cần `next typegen`?

➡️ Tiếp theo: `22-bundle-va-performance-engineering.md`
