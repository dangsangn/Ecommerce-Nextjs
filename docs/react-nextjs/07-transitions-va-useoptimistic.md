# 07. Transitions & `useOptimistic` — làm UI cảm giác tức thì

> **Mục tiêu:** hiểu ba công cụ ưu tiên hoá của React (`useTransition`, `useDeferredValue`,
> `useOptimistic`), và áp dụng `useOptimistic` vào giỏ hàng của repo — nơi nó tạo ra khác biệt rõ nhất.

---

## 1. Overview

### Vấn đề: "chờ đợi" có hai loại hoàn toàn khác nhau

**Loại 1 — chờ CPU.** Bạn có 10.000 dòng cần filter. Việc tính toán mất 300ms. Không có mạng, chỉ là
JavaScript chạy chậm.

**Loại 2 — chờ mạng.** Bạn bấm "+1" cho một sản phẩm trong giỏ. Server mất 400ms để phản hồi. CPU rảnh
hoàn toàn, chỉ là đang chờ.

Hai loại này cần hai công cụ khác nhau:

| Loại chờ | Công cụ | Cách nó giúp |
| --- | --- | --- |
| Chờ CPU | `useTransition`, `useDeferredValue` | Cho phép React ngắt việc tính toán để xử lý input của người dùng trước |
| Chờ mạng | `useOptimistic` | Hiển thị kết quả **dự đoán** ngay lập tức, sửa lại nếu server không đồng ý |

Nhầm hai loại này là sai lầm phổ biến. `useTransition` **không** làm request mạng nhanh hơn.
`useOptimistic` **không** làm phép tính nhanh hơn.

---

## 2. Mental Model

### 🧠 Transition như hai làn đường

Hình dung có hai làn xe vào thành phố:

- **Làn ưu tiên (urgent):** xe cứu thương. Gõ chữ, click, kéo thanh trượt — mọi thứ người dùng vừa làm.
  React xử lý **ngay**, không được chậm.
- **Làn thường (transition):** xe tải. Filter danh sách, render trang mới, tính lại biểu đồ.
  Có thể **tạm dừng bên lề** khi xe cứu thương đi qua, rồi tiếp tục.

`startTransition` là cách bạn nói: *"việc này đi làn thường."*

```tsx
setQuery(input)                          // làn ưu tiên: ô input phải hiện chữ ngay
startTransition(() => {
  setFilteredResults(filter(data, input)) // làn thường: có thể chờ
})
```

### 🧠 Optimistic update như một tấm phiếu tạm

Bạn gửi hành lý ở sân bay. Nhân viên chưa nhập xong vào hệ thống, nhưng đưa cho bạn **một tấm phiếu tạm**
ghi "1 kiện đã nhận". Bạn đi tiếp ngay.

- Vài giây sau hệ thống xác nhận → phiếu tạm được thay bằng phiếu thật (giống nội dung, bạn không thấy gì đổi)
- Hệ thống báo lỗi → phiếu tạm bị thu hồi, bạn được thông báo

`useOptimistic` chính là tấm phiếu tạm đó: **hiển thị kết quả bạn tin là sẽ đúng, và tự thu hồi nếu sai.**

Điểm mấu chốt: **rollback là tự động.** Bạn không viết code hoàn tác. React chỉ đơn giản là bỏ giá trị
optimistic khi state thật về, và render lại theo state thật.

---

## 3. `useTransition` — chờ CPU

### API

```tsx
const [isPending, startTransition] = useTransition()
```

- `startTransition(fn)` — mọi `setState` trong `fn` được đánh dấu là "không gấp"
- `isPending` — `true` trong lúc transition đang chạy, để bạn hiện chỉ báo

### Ví dụ trước / sau

```tsx
// ❌ Không transition: gõ bị lag vì mỗi ký tự gây filter 10k dòng
function SearchList({ data }: { data: Row[] }) {
  const [query, setQuery] = useState('')
  const results = data.filter(r => r.name.includes(query))   // 300ms
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <List rows={results} />
    </>
  )
}
```

```tsx
// ✅ Có transition: input phản hồi ngay, danh sách theo sau
function SearchList({ data }: { data: Row[] }) {
  const [query, setQuery] = useState('')          // urgent
  const [results, setResults] = useState(data)    // transition
  const [isPending, startTransition] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setQuery(next)                                 // ← LÀN ƯU TIÊN: chữ hiện ngay
    startTransition(() => {
      setResults(data.filter(r => r.name.includes(next)))   // ← LÀN THƯỜNG
    })
  }

  return (
    <>
      <input value={query} onChange={onChange} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <List rows={results} />
      </div>
    </>
  )
}
```

Chú ý cách dùng `isPending`: làm mờ danh sách cũ (`opacity: 0.6`) **thay vì** thay nó bằng spinner.
Người dùng vẫn đọc được dữ liệu cũ trong lúc chờ dữ liệu mới. Đây là chi tiết UX quan trọng — một
spinner làm mất hoàn toàn ngữ cảnh mà người dùng đang xem.

### Repo này có cần `useTransition` không?

**Không, và lý do rất đáng học.**

Hãy xem lại `components/store/search-box.tsx`:

```tsx
export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  return (
    <form action={(formData) => {
      const q = String(formData.get('q') ?? '').trim()
      router.push(q ? `/?q=${encodeURIComponent(q)}` : '/')
    }}>
      <Input name="q" type="search" placeholder="Search products…" defaultValue={defaultValue} aria-label="Search products" />
    </form>
  )
}
```

Không có filter nào ở client. Việc tìm kiếm được đẩy hết sang server:

📄 `app/(store)/page.tsx`:

```tsx
const query = buildCatalogQuery({ q, page })
result = await apiFetch<ProductListResult>(`/product${query}`)
```

📄 `lib/products/catalog-query.ts`:

```tsx
export const CATALOG_PAGE_SIZE = 12

// Map the storefront URL's `q` to the backend's `keySearch` param and clamp paging.
export function buildCatalogQuery({ q, page }: { q?: string; page?: number }): string {
  const p = Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : 1
  let s = `?page=${p}&limit=${CATALOG_PAGE_SIZE}`
  const trimmed = (q ?? '').trim()
  if (trimmed) s += `&keySearch=${encodeURIComponent(trimmed)}`
  return s
}
```

**Không có công việc CPU nặng nào ở client để cần ưu tiên hoá.** Backend làm việc tìm kiếm, và mỗi
trang chỉ có 12 sản phẩm.

> **Bài học kiến trúc:** `useTransition` giải quyết triệu chứng "client làm việc quá nặng".
> Cách chữa gốc thường là **đừng để client làm việc đó**. Đẩy filter/sort/paginate xuống database —
> nơi có index và làm việc đó nhanh hơn JavaScript hàng trăm lần.

### Nhưng có một chỗ nên dùng `isPending`

📄 `components/store/product-grid.tsx` và `components/products/product-list.tsx` — phân trang:

```tsx
<Link
  href={pageHref(q, pagination.page + 1)}
  aria-disabled={!pagination.hasNextPage}
  className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasNextPage && 'pointer-events-none opacity-50')}
>
  Next
</Link>
```

Bấm "Next" → Next.js phải fetch trang mới từ server. Trong lúc đó **không có phản hồi trực quan nào**.
Người dùng có thể bấm 3 lần.

Next.js cung cấp `useLinkStatus` cho đúng việc này — nó đọc trạng thái pending của `<Link>` cha:

```tsx
'use client'
import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

function PendingIndicator() {
  const { pending } = useLinkStatus()
  return pending ? <span className="ml-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null
}

export function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={cn(buttonVariants({ variant: 'outline' }), disabled && 'pointer-events-none opacity-50')}
    >
      {children}
      <PendingIndicator />
    </Link>
  )
}
```

Chú ý: `PendingIndicator` là component **riêng**. Nó phải là con của `<Link>` để `useLinkStatus`
đọc được context của link đó — cùng nguyên tắc với `useFormStatus` phải là con của `<form>`
(xem file `11`).

---

## 4. `useDeferredValue` — phiên bản khai báo của transition

```tsx
const deferredValue = useDeferredValue(value)
```

React sẽ **trả về giá trị cũ** cho tới khi việc render với giá trị mới hoàn tất.

### `useTransition` vs `useDeferredValue` — chọn cái nào?

| | `useTransition` | `useDeferredValue` |
| --- | --- | --- |
| Bạn kiểm soát | **Việc cập nhật** (`setState` nào là non-urgent) | **Giá trị** (cái nào được phép trễ) |
| Cần sở hữu `setState`? | ✅ Có | ❌ Không — dùng được với prop bạn nhận từ cha |
| Trong lúc chờ hiện gì | Bạn tự quyết bằng `isPending` | Tự động hiện giá trị cũ |
| Dùng khi | Bạn viết event handler | Giá trị đến từ prop hoặc bạn không sửa được nơi set |

**Quy tắc thực dụng:**
- Bạn viết chính cái `onChange` → `useTransition`
- Bạn nhận giá trị từ prop và không sửa được component cha → `useDeferredValue`

React 19 thêm tham số `initialValue`, giải quyết vấn đề render đầu tiên:

```tsx
// Lần render đầu trả về '' thay vì query (tránh render nặng ngay khi mount)
const deferredQuery = useDeferredValue(query, '')
```

---

## 5. ⭐ `useOptimistic` — nơi repo này có cơ hội lớn nhất

### Vấn đề hiện tại

📄 `components/store/cart-line.tsx`:

```tsx
function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" size="icon" aria-label={label} disabled={pending}>
      {children}
    </Button>
  )
}

export function CartLine({ product }: { product: CartProduct }) {
  const { productId, name, thumb, price, quantity } = product
  const [qtyState, qtyAction] = useActionState(updateCartQuantityAction, initialActionState)
  const [rmState, rmAction] = useActionState(removeFromCartAction, initialActionState)
  // ...
  const lineTotal = toPriceString(toPriceNumber(price) * quantity)

  return (
    <div className="flex items-center gap-4 border-b py-4">
      <img src={thumb} alt={name} className="h-16 w-16 rounded-md border object-cover" />
      <div className="flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{toPriceString(price)} each</p>
      </div>
      <div className="flex items-center gap-2">
        <form action={qtyAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="oldQuantity" value={quantity} />
          <input type="hidden" name="newQuantity" value={quantity - 1} />
          <IconButton label="Decrease quantity">−</IconButton>
        </form>
        <span className="w-8 text-center tabular-nums">{quantity}</span>
        <form action={qtyAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="oldQuantity" value={quantity} />
          <input type="hidden" name="newQuantity" value={quantity + 1} />
          <IconButton label="Increase quantity">+</IconButton>
        </form>
      </div>
      <div className="w-20 text-right tabular-nums">{lineTotal}</div>
      ...
```

**Hãy lần theo trải nghiệm người dùng khi bấm "+":**

```
t=0ms    Người dùng bấm "+"
t=1ms    useFormStatus → pending=true → nút bị disable
         Số lượng vẫn hiện "2". Tổng tiền vẫn hiện "19.98".
t=~400ms Server Action gọi PATCH /cart/quantity, backend cập nhật
t=~410ms revalidatePath('/cart') → server render lại trang
t=~450ms RSC payload mới về, React reconcile
t=~460ms Số lượng đổi thành "3", tổng tiền thành "29.97"
```

**Người dùng chờ ~460ms mà không thấy con số nào đổi.** Nút chỉ bị mờ đi. Cảm giác: "app bị lag" hoặc
"mình bấm chưa được".

Đây là dạng chờ **loại 2** — chờ mạng. `useTransition` không giúp được gì. `useOptimistic` mới là câu trả lời.

### Giải pháp: `useOptimistic` ở cấp danh sách

Điểm quan trọng: **optimistic state phải ở cấp có đủ dữ liệu để tính lại mọi thứ bị ảnh hưởng.**
Bấm "+" ở một dòng làm đổi cả *số lượng dòng đó* và *tổng tiền của giỏ*. Nên state phải ở cấp
danh sách, không phải cấp dòng.

**Bước 1 — Tách một Client Component quản lý danh sách:**

```tsx
// components/store/cart-items.tsx  (MỚI)
'use client'
import { useOptimistic } from 'react'
import { toPriceString } from '@/lib/products/price'
import { cartSubtotal } from '@/lib/cart/summary'
import { CartLine } from '@/components/store/cart-line'
import type { CartProduct } from '@/types/cart'

type CartMutation =
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }

/**
 * Áp một thay đổi dự đoán lên danh sách giỏ hàng.
 * Phải là hàm PURE — React có thể gọi lại nhiều lần khi replay các optimistic update
 * đang chờ (ví dụ người dùng bấm "+" ba lần liên tiếp).
 */
function applyMutation(items: CartProduct[], m: CartMutation): CartProduct[] {
  switch (m.type) {
    case 'setQuantity':
      return items.map((it) =>
        it.productId === m.productId ? { ...it, quantity: m.quantity } : it,
      )
    case 'remove':
      return items.filter((it) => it.productId !== m.productId)
  }
}

export function CartItems({ items }: { items: CartProduct[] }) {
  // `items` là state THẬT từ Server Component.
  // Khi revalidatePath('/cart') chạy, prop này đổi và optimistic state tự bị loại bỏ.
  const [optimisticItems, applyOptimistic] = useOptimistic(items, applyMutation)

  return (
    <div className="space-y-6">
      <div>
        {optimisticItems.map((p) => (
          <CartLine key={p.productId} product={p} onOptimistic={applyOptimistic} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        {/* Tổng tiền tính từ optimisticItems → cập nhật NGAY khi bấm +/− */}
        <div className="flex flex-col items-end gap-2 text-right">
          <p className="text-sm text-muted-foreground">Subtotal</p>
          <p className="text-xl font-semibold tabular-nums">
            {toPriceString(cartSubtotal(optimisticItems))}
          </p>
        </div>
      </div>
    </div>
  )
}
```

**Bước 2 — `CartLine` báo ý định trước khi submit:**

```tsx
// components/store/cart-line.tsx  (sửa)
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateCartQuantityAction, removeFromCartAction } from '@/actions/cart.actions'
import { initialActionState } from '@/actions/state'
import { toPriceString, toPriceNumber } from '@/lib/products/price'
import { useActionToast } from '@/lib/hooks/use-action-toast'
import { Button } from '@/components/ui/button'
import type { CartProduct } from '@/types/cart'

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" size="icon" aria-label={label} disabled={pending}>
      {children}
    </Button>
  )
}

export function CartLine({
  product,
  onOptimistic,
}: {
  product: CartProduct
  onOptimistic: (m: CartMutation) => void
}) {
  const { productId, name, thumb, price, quantity } = product
  const [qtyState, qtyAction] = useActionState(updateCartQuantityAction, initialActionState)
  const [rmState, rmAction] = useActionState(removeFromCartAction, initialActionState)

  useActionToast(qtyState)
  useActionToast(rmState)

  const lineTotal = toPriceString(toPriceNumber(price) * quantity)

  // React 19: form action nhận async function.
  // Gọi onOptimistic TRƯỚC khi await → UI đổi ngay lập tức.
  async function changeQuantity(next: number, formData: FormData) {
    onOptimistic({ type: 'setQuantity', productId, quantity: next })
    await qtyAction(formData)
  }

  return (
    <div className="flex items-center gap-4 border-b py-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt={name} className="h-16 w-16 rounded-md border object-cover" />
      <div className="flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{toPriceString(price)} each</p>
      </div>
      <div className="flex items-center gap-2">
        <form action={(fd) => changeQuantity(quantity - 1, fd)}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="oldQuantity" value={quantity} />
          <input type="hidden" name="newQuantity" value={quantity - 1} />
          <IconButton label="Decrease quantity">−</IconButton>
        </form>
        <span className="w-8 text-center tabular-nums">{quantity}</span>
        <form action={(fd) => changeQuantity(quantity + 1, fd)}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="oldQuantity" value={quantity} />
          <input type="hidden" name="newQuantity" value={quantity + 1} />
          <IconButton label="Increase quantity">+</IconButton>
        </form>
      </div>
      <div className="w-20 text-right tabular-nums">{lineTotal}</div>
      <form action={(fd) => { onOptimistic({ type: 'remove', productId }); return rmAction(fd) }}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="oldQuantity" value={quantity} />
        <Button type="submit" variant="ghost" size="sm">Remove</Button>
      </form>
    </div>
  )
}
```

**Bước 3 — Server Component chỉ việc truyền dữ liệu xuống:**

```tsx
// app/(store)/cart/page.tsx  (sửa)
{items.length === 0 ? (
  <p className="text-sm text-muted-foreground">
    Your cart is empty. <Link href="/" className="text-primary hover:underline">Browse products</Link>
  </p>
) : (
  <CartItems items={items} />
)}
```

### Trải nghiệm sau khi sửa

```
t=0ms    Bấm "+"
t=1ms    ✅ Số lượng hiện "3". ✅ Tổng tiền hiện "29.97". Cảm giác TỨC THÌ.
t=~400ms Server phản hồi
t=~460ms State thật về, khớp với optimistic → người dùng KHÔNG THẤY GÌ ĐỔI
```

Và nếu server báo lỗi (hết hàng chẳng hạn):

```
t=~460ms State thật về là quantity=2 → React BỎ giá trị optimistic
         Số lượng quay về "2", tổng tiền về "19.98"
         useActionToast hiện "Could not update quantity"
```

**Rollback hoàn toàn tự động.** Bạn không viết một dòng code hoàn tác nào — React chỉ đơn giản là
dùng lại state thật.

### Cơ chế: vì sao rollback tự động

```
State thật (từ Server Component prop)     Optimistic overlay
        │                                          │
   items = [{qty: 2}]                              │
        │                                          │
        │  ← người dùng bấm "+"                    │
        │                          applyMutation → [{qty: 3}]  ← hiển thị cái này
        │                                          │
        │  ← revalidatePath, prop mới về            │
   items = [{qty: 3}]                     (bị xoá tự động)     ← hiển thị state thật
```

**Ba điều kiện để `useOptimistic` hoạt động đúng:**

1. **Tham số thứ nhất phải là state thật sẽ được cập nhật.** Ở đây là prop `items` từ Server Component.
   `revalidatePath('/cart')` trong action làm nó đổi. Nếu bạn truyền một `useState` không bao giờ đổi,
   optimistic value sẽ không bao giờ bị thay thế đúng cách.

2. **Reducer phải là hàm pure.** React có thể gọi lại nó nhiều lần để replay các update đang chờ.
   Nếu người dùng bấm "+" ba lần nhanh, React chạy `applyMutation` ba lần liên tiếp trên state thật.

3. **`applyOptimistic` phải được gọi trong một transition.** Form action của React 19 tự động bọc
   transition, nên gọi trong `action={...}` là đúng. Nếu gọi từ một `onClick` thường, bạn cần
   `startTransition` bằng tay.

📄 **Điểm cộng cho repo:** `revalidatePath('/cart')` **đã có sẵn** trong mọi cart action —
`actions/cart.actions.ts`:

```tsx
export async function updateCartQuantityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productId = String(formData.get('productId') ?? '')
  const oldQuantity = Number(formData.get('oldQuantity'))
  const newQuantity = Number(formData.get('newQuantity'))
  if (!productId) return { ok: false, message: 'Missing product' }
  try {
    await apiFetch('/cart/quantity', { method: 'PATCH', auth: true, body: { productId, oldQuantity, newQuantity } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not update quantity') }
  }
  revalidatePath('/cart')      // ← điều kiện #1 đã thoả
  return { ok: true }
}
```

Nghĩa là hạ tầng đã sẵn. Chỉ cần thêm lớp optimistic ở client.

### ⚠️ Một cạm bẫy đặc thù của repo này

Backend nhận cả `oldQuantity` **và** `newQuantity`:

```tsx
body: { productId, oldQuantity, newQuantity }
```

Đây là dấu hiệu backend dùng `oldQuantity` để tính delta (`newQuantity - oldQuantity`) và cập nhật
tồn kho. **Điều đó có nghĩa là thứ tự request quan trọng.**

Nếu người dùng bấm "+" ba lần nhanh:

```
Request A: old=2, new=3
Request B: old=2, new=3   ← SAI! `quantity` trong prop vẫn là 2 vì server chưa kịp trả về
Request C: old=2, new=3   ← SAI!
```

Cả ba request đều dùng `quantity` từ prop (chưa cập nhật) → gửi cùng một cặp old/new → backend có thể
tính sai tồn kho.

**Đây là bug đã tồn tại trong repo hiện tại** (`useFormStatus` disable nút, nhưng chỉ trong lúc
request đang bay — bấm lại ngay sau khi nó xong vẫn dùng prop cũ vì revalidate chưa hoàn tất).
Và `useOptimistic` **làm nó dễ gặp hơn**, vì UI phản hồi ngay nên người dùng bấm nhanh hơn.

**Cách xử lý:** dùng `optimisticItems` làm nguồn cho `oldQuantity`, để mỗi request dựa trên trạng thái
optimistic mới nhất:

```tsx
// Trong CartItems — truyền chính optimistic item xuống thay vì item gốc
{optimisticItems.map((p) => (
  <CartLine key={p.productId} product={p} onOptimistic={applyOptimistic} />
))}
```

Với cách này, `quantity` mà `CartLine` thấy **là giá trị optimistic**, nên `oldQuantity` luôn khớp
với request trước:

```
Request A: old=2, new=3
Request B: old=3, new=4   ✅ (prop quantity đã là 3 nhờ optimistic)
Request C: old=4, new=5   ✅
```

Đoạn code ở bước 1 phía trên đã làm đúng điều này — `optimisticItems.map(...)`, không phải `items.map(...)`.
Đây là lý do chi tiết đó quan trọng, không phải tình cờ.

> **Bài học tổng quát:** optimistic UI không chỉ là chuyện hiển thị. Nó đổi cả **dữ liệu bạn gửi lên
> server**. Với API dạng "delta" (gửi old + new), bạn *buộc phải* dựa trên optimistic state, nếu
> không sẽ có race condition. Với API dạng "absolute" (chỉ gửi new), rủi ro thấp hơn nhiều.
>
> Nếu có quyền sửa backend: **API absolute an toàn hơn API delta** cho đúng lý do này.

### Các chỗ khác trong repo nên dùng `useOptimistic`

| Component | Hành động | Optimistic update |
| --- | --- | --- |
| `comment-section.tsx` | Post comment | Thêm comment vào list ngay, đánh dấu "đang gửi" (mờ hơn) |
| `comment-section.tsx` | Delete comment | Xoá khỏi list ngay |
| `product-row-actions.tsx` | Publish/Unpublish | Đổi nhãn nút ngay |
| `store-header.tsx` + `add-to-cart.tsx` | Add to cart | Tăng badge số lượng giỏ ngay |

Dòng cuối là ví dụ hay về giới hạn: badge nằm trong `StoreHeader` (Server Component, trong layout),
còn nút bấm ở `AddToCart` (Client Component, trong page). Chúng **không chia sẻ được state**.
Để optimistic hoạt động qua khoảng cách đó, bạn cần một Context ở client cho cart count — và đây
chính là một trong những trường hợp Context thực sự chính đáng (xem file `05`, mục 12).

---

## 6. When NOT to Use

### Đừng dùng `useOptimistic` khi kết quả không đoán được

```tsx
// ❌ Bạn không biết trước server sẽ tính ra tổng bao nhiêu (thuế, phí ship, mã giảm giá)
onOptimistic({ type: 'placeOrder', total: guessTotal() })
```

📄 Đây là lý do `placeOrderAction` trong `checkout-wizard.tsx` **không nên** optimistic. Kết quả của
việc đặt hàng là một order ID, tình trạng thanh toán, có thể cả cảnh báo hết hàng — không đoán được.
Với những hành động này, `useFormStatus` + nút disable là câu trả lời đúng:

📄 `components/auth/submit-button.tsx`:

```tsx
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
```

### Bảng tổng hợp: chọn công cụ nào

| Tình huống | Công cụ đúng | Vì sao |
| --- | --- | --- |
| Đổi số lượng giỏ hàng | `useOptimistic` | Kết quả đoán được (quantity = n+1) |
| Xoá một item | `useOptimistic` | Đoán được (item biến mất) |
| Toggle like/publish | `useOptimistic` | Đoán được (đảo trạng thái) |
| Đặt hàng | `useFormStatus` | Kết quả không đoán được |
| Đăng nhập | `useFormStatus` | Không đoán được, và có redirect |
| Upload file | `useFormStatus` + progress | Không đoán được URL trả về |
| Filter 10k dòng ở client | `useTransition` | Chờ CPU, không phải chờ mạng |
| Nhận query từ prop, render nặng | `useDeferredValue` | Không sở hữu setState |
| Điều hướng trang | `useLinkStatus` | Next.js quản lý navigation |

### Đừng dùng `startTransition` cho input

```tsx
// ❌ Hạ ưu tiên chính cái cần gấp nhất → tạo ra lag
startTransition(() => setQuery(e.target.value))
```

Giá trị của ô input **luôn** là urgent. Chỉ những gì *phái sinh* từ nó (danh sách kết quả) mới nên
vào transition.

### Đừng optimistic khi thất bại gây hậu quả nghiêm trọng

Với thanh toán, chuyển tiền, xoá dữ liệu không hồi phục — người dùng thấy "thành công" rồi vài giây
sau bị rollback là trải nghiệm tồi và có thể gây thiệt hại thật. Hãy để họ chờ và thấy kết quả thật.

---

## 7. Trade-offs

| Công cụ | Lợi ích | Cái giá |
| --- | --- | --- |
| `useTransition` | UI không đóng băng khi render nặng | Cần `isPending` UI riêng; dùng sai (bọc input) làm chậm hơn; không giúp gì cho chờ mạng |
| `useDeferredValue` | Đơn giản, tự hiện giá trị cũ | Ít kiểm soát; hiển thị dữ liệu cũ có thể gây nhầm lẫn nếu không có chỉ báo |
| `useOptimistic` | Cảm giác tức thì — khác biệt lớn nhất về UX | Phải viết reducer pure; UI có thể "giật" khi rollback; **đổi cả dữ liệu gửi lên server** (ca `oldQuantity`) |
| `useFormStatus` | Đơn giản, trung thực, không cần reducer | Người dùng phải chờ thật |

**Vì sao `useOptimistic` đáng dù có rủi ro:** khoảng chờ 400ms cho một hành động nhỏ như "+1" là
khoảng cách giữa "app native" và "trang web". Rủi ro rollback chỉ hiện thực hoá khi request thất bại —
và với các hành động đoán được, tỷ lệ đó rất thấp.

---

## 8. Best Practices

1. **Phân loại chờ trước khi chọn công cụ.** Chờ CPU → transition. Chờ mạng → optimistic.
   Chờ mạng nhưng kết quả không đoán được → `useFormStatus`.

2. **Đặt `useOptimistic` ở cấp có đủ dữ liệu.** Nếu đổi một dòng làm đổi cả tổng, state phải ở cấp danh sách.

3. **Reducer optimistic phải pure.** React sẽ replay nó nhiều lần. Không log, không mutate, không random.

4. **Truyền optimistic state xuống con**, không truyền state thật — nếu con dùng giá trị đó để tạo
   request tiếp theo. Đây là bài học từ `oldQuantity`.

5. **Đảm bảo action gọi `revalidatePath`/`revalidateTag`** để state thật thực sự về. Không có nó,
   optimistic value không bao giờ được thay thế đúng cách.

6. **Trong lúc pending, làm mờ dữ liệu cũ thay vì thay bằng spinner.** Giữ ngữ cảnh cho người dùng.

7. **Đẩy công việc nặng sang server thay vì tối ưu transition ở client.** Cách repo này xử lý tìm kiếm
   (`buildCatalogQuery` + backend `keySearch`) là mẫu tốt.

---

## Tự kiểm tra

1. Hai loại "chờ đợi" là gì? Công cụ nào cho loại nào?
2. Vì sao `useTransition` không giúp được gì cho nút "+" trong giỏ hàng?
3. Ba điều kiện để `useOptimistic` rollback đúng?
4. Vì sao `optimisticItems.map(...)` (chứ không phải `items.map(...)`) là chi tiết quan trọng?
5. Vì sao `placeOrderAction` không nên optimistic, còn `updateCartQuantityAction` thì nên?
6. `useTransition` khác `useDeferredValue` ở điểm cốt lõi nào?

➡️ Tiếp theo: `08-server-vs-client-components.md` — bắt đầu Phần B về Next.js
