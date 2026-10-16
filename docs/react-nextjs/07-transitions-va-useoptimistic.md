# 07. Transitions & `useOptimistic` — làm UI cảm giác tức thì

> **Mục tiêu:** hiểu ba công cụ ưu tiên hoá của React 19 (`useTransition`, `useDeferredValue`,
> `useOptimistic`), và áp dụng `useOptimistic` vào giỏ hàng của repo — nơi nó tạo khác biệt rõ nhất.

---

## 1. Overview

### "Chờ" có hai loại

**Chờ CPU** — filter 10.000 dòng mất 300ms. **Chờ mạng** — bấm "+1", server mất 400ms.

| Câu hỏi | Công cụ | Nó làm gì |
| --- | --- | --- |
| Render nặng làm đơ input? | `useTransition`, `useDeferredValue` | Cho React **ngắt** render không gấp để xử lý input trước |
| Đang chờ việc async, cần biết "đang chạy"? | `useTransition` với **async function** (Action), `useFormStatus`, `useActionState` | Cho bạn `isPending` suốt từ lúc bấm tới khi UI mới commit |
| Muốn thấy **kết quả** ngay, không chờ server? | `useOptimistic` | Hiện kết quả **dự đoán**, tự bỏ khi Action xong |

Không công cụ nào làm request nhanh hơn. Điểm cập nhật quan trọng của React 19: **transition không chỉ
cho CPU** — `startTransition(async () => {...})` là một *Action*, `isPending` kéo dài qua cả `await`.

---

## 2. Mental Model

### 🧠 Transition như hai làn đường

- **Làn ưu tiên (urgent):** gõ chữ, click, kéo — React xử lý **ngay**.
- **Làn thường (transition):** render danh sách, chuyển trang, kết quả của Action — có thể **tạm dừng
  bên lề** khi có việc gấp, và giữ UI cũ trên màn hình thay vì nhảy về fallback.

```tsx
setQuery(input)                            // làn ưu tiên: ô input phải hiện chữ ngay
startTransition(() => {
  setFilteredResults(filter(data, input))  // làn thường: có thể chờ
})
```

### 🧠 Optimistic update như phiếu gửi hành lý tạm

Nhân viên đưa bạn **phiếu tạm** "1 kiện đã nhận" trước khi hệ thống xác nhận. Xác nhận xong → phiếu thật
thay phiếu tạm (bạn không thấy gì đổi). Lỗi → phiếu tạm bị thu hồi.

`useOptimistic` là phiếu tạm đó: giá trị optimistic **chỉ sống trong lúc Action đang chạy**. Action kết
thúc → React bỏ nó và hiển thị state thật (lúc đó đã được server cập nhật, hoặc giữ nguyên nếu lỗi).
Rollback không cần code.

---

## 3. `useTransition`

```tsx
const [isPending, startTransition] = useTransition()
```

### Ca 1 — render nặng (chờ CPU)

```tsx
// ❌ Gõ bị lag: mỗi ký tự filter 10k dòng đồng bộ
const [query, setQuery] = useState('')
const results = data.filter((r) => r.name.includes(query))

// ✅ Input phản hồi ngay, danh sách theo sau
const [query, setQuery] = useState('')
const [results, setResults] = useState(data)
const [isPending, startTransition] = useTransition()

function onChange(e: React.ChangeEvent<HTMLInputElement>) {
  const next = e.target.value
  setQuery(next)                                                    // urgent
  startTransition(() => setResults(data.filter((r) => r.name.includes(next))))  // non-urgent
}
// <div style={{ opacity: isPending ? 0.6 : 1 }}><List rows={results} /></div>
```

Làm mờ danh sách cũ thay vì thay bằng spinner — người dùng vẫn đọc được ngữ cảnh.

### Ca 2 — Action async (chờ mạng): repo đã dùng

📄 `components/products/image-manager.tsx`:

```tsx
const [uploading, startUpload] = useTransition()

startUpload(async () => {
  const result = await prepareImagesAction({ ok: false }, body)    // Server Action
  if (result.ok && result.data) onUploaded(result.data)
  else toast.error(result.message ?? 'Could not upload images')
})
// <Button disabled={uploading}>{uploading ? 'Uploading…' : 'Upload images'}</Button>
```

`uploading` là `true` suốt thời gian upload. ⚠️ Caveat React 19: `setState` gọi **sau** `await` không còn
được đánh dấu là transition — nếu cần, bọc lại `startTransition(() => setX(...))` sau `await`.

Điều hướng cũng là transition: `startTransition(() => router.push(url))` cho `isPending` tới khi trang mới
render xong.

```tsx
// components/store/search-box.tsx — nếu muốn chỉ báo "đang tìm"
const [isPending, startTransition] = useTransition()
<form action={(fd) => {
  const q = String(fd.get('q') ?? '').trim()
  startTransition(() => router.push(q ? `/?q=${encodeURIComponent(q)}` : '/'))
}}>
  {isPending ? <Spinner /> : <Search />}
```

### Repo có cần `useTransition` cho render nặng không? Không

Tìm kiếm đẩy hết sang server: 📄 `lib/products/catalog-query.ts` map `q` → `keySearch` của backend, mỗi trang
12 sản phẩm. Không có việc CPU nặng ở client.

> **Bài học kiến trúc:** `useTransition` (ca 1) chữa triệu chứng "client làm việc quá nặng". Cách chữa gốc
> thường là **đừng để client làm việc đó** — filter/sort/paginate ở database, nơi có index.

### Phân trang: `useLinkStatus`

📄 `components/store/product-grid.tsx` — bấm "Next" (`<Link>`) → chờ server, **không có phản hồi trực quan**.
Next.js có `useLinkStatus` đọc trạng thái pending của `<Link>` cha:

```tsx
'use client'
import Link, { useLinkStatus } from 'next/link'

function PendingIndicator() {
  const { pending } = useLinkStatus()
  return pending ? <span className="ml-2 size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null
}

export function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonVariants({ variant: 'outline' })}>
      {children}
      <PendingIndicator />   {/* PHẢI là con của <Link>, như useFormStatus phải là con của <form> */}
    </Link>
  )
}
```

⚠️ Nếu route đích **đã được prefetch**, giai đoạn pending bị bỏ qua — chỉ báo không bao giờ hiện. Docs coi
`useLinkStatus` là "vá nhanh"; cách gốc là prefetch + `loading.tsx` (file `06` §6).

---

## 4. `useDeferredValue` — phiên bản khai báo

```tsx
const deferredQuery = useDeferredValue(query)
```

React render trước với **giá trị cũ**, rồi render nền với giá trị mới (ngắt được).

```tsx
// Nhận query từ prop, không sửa được nơi setState
function ProductResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery
  return (
    <div style={{ opacity: isStale ? 0.6 : 1 }}>
      <HeavyList query={deferredQuery} />     {/* HeavyList phải được memo để có tác dụng */}
    </div>
  )
}
```

| | `useTransition` | `useDeferredValue` |
| --- | --- | --- |
| Bạn kiểm soát | **Việc cập nhật** (setState nào non-urgent) | **Giá trị** (cái nào được trễ) |
| Cần sở hữu `setState`? | Có | Không — dùng với prop |
| Chỉ báo chờ | `isPending` | So sánh `value !== deferredValue` |
| Async / Action | Có | Không |

React 19 thêm `initialValue`: `useDeferredValue(query, '')` — lần render đầu dùng `''`, rồi render nền với
`query`. Hữu ích khi mount một list nặng.

---

## 5. ⭐ `useOptimistic` — cơ hội lớn nhất của repo

### Vấn đề hiện tại

📄 `components/store/cart-line.tsx`: mỗi nút +/− là một `<form action={qtyAction}>` với hidden input
`productId`, `oldQuantity`, `newQuantity`; `IconButton` dùng `useFormStatus` để disable khi pending.

```
t=0ms    Bấm "+"  → nút disable. Số lượng vẫn "2", tổng tiền vẫn "19.98"
t=~400ms Server Action PATCH /cart/quantity xong, revalidatePath('/cart')
t=~460ms RSC payload mới về cùng response action → "3", "29.97"
```

~460ms không con số nào đổi → "app lag" / "mình bấm chưa được?".

### Giải pháp: `useOptimistic` ở cấp danh sách

Bấm "+" ở một dòng đổi cả *số lượng dòng* và *tổng giỏ* → optimistic state phải ở **cấp danh sách**.

**Bước 1 — `CartItems` sở hữu optimistic state:**

```tsx
// components/store/cart-items.tsx (MỚI)
'use client'
import { useOptimistic } from 'react'
import { toPriceString } from '@/lib/products/price'
import { cartSubtotal } from '@/lib/cart/summary'
import { CartLine } from '@/components/store/cart-line'
import type { CartProduct } from '@/types/cart'

export type CartMutation =
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }

// PURE — React replay nó trên state thật mỗi khi state thật đổi trong lúc còn Action pending
function applyMutation(items: CartProduct[], m: CartMutation): CartProduct[] {
  switch (m.type) {
    case 'setQuantity':
      return items.map((it) => (it.productId === m.productId ? { ...it, quantity: m.quantity } : it))
    case 'remove':
      return items.filter((it) => it.productId !== m.productId)
  }
}

export function CartItems({ items }: { items: CartProduct[] }) {
  const [optimisticItems, applyOptimistic] = useOptimistic(items, applyMutation)
  return (
    <>
      {optimisticItems.map((p) => (            // ← optimistic, không phải items (xem cạm bẫy bên dưới)
        <CartLine key={p.productId} product={p} onOptimistic={applyOptimistic} />
      ))}
      <p className="text-xl font-semibold tabular-nums">{toPriceString(cartSubtotal(optimisticItems))}</p>
    </>
  )
}
```

**Bước 2 — `CartLine` gọi optimistic *bên trong* action của `useActionState`:**

```tsx
// components/store/cart-line.tsx (sửa phần hook)
export function CartLine({ product, onOptimistic }: {
  product: CartProduct
  onOptimistic: (m: CartMutation) => void
}) {
  const { productId, quantity } = product

  const [qtyState, qtyAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    onOptimistic({ type: 'setQuantity', productId, quantity: Number(fd.get('newQuantity')) })
    return updateCartQuantityAction(prev, fd)        // optimistic sống tới khi dòng này xong
  }, initialActionState)

  const [rmState, rmAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    onOptimistic({ type: 'remove', productId })
    return removeFromCartAction(prev, fd)
  }, initialActionState)

  // ... JSX giữ nguyên: <form action={qtyAction}> với hidden input đọc từ `quantity`
}
```

Vì sao trong action của `useActionState` chứ không phải `form action={(fd) => { onOptimistic(...); qtyAction(fd) }}`?
`qtyAction` (dispatch) trả về `void`, nên wrapper kết thúc ngay — vòng đời của optimistic value khi đó
chỉ còn dựa vào việc React gộp (entangle) các Action đang chạy, rất khó suy luận. Đặt `onOptimistic` trong
chính hàm action (đã chạy trong transition) gắn vòng đời optimistic **tường minh** với request thật — đây
là pattern docs React dùng.

**Bước 3 — Server Component chỉ truyền dữ liệu:**

```tsx
// app/(store)/cart/page.tsx
<CartItems items={items} />
```

### Sau khi sửa

```
t=0ms    Bấm "+"  → ✅ "3", ✅ "29.97" ngay
t=~460ms Action xong, prop `items` mới (qty 3) đã về → optimistic bị bỏ, state thật = 3 → không thấy gì đổi
Lỗi:     Action xong, items vẫn qty 2 → hiện lại "2", "19.98" + toast lỗi
```

### Ba điều kiện để rollback đúng

1. **Tham số đầu là state thật sẽ được cập nhật** — prop `items` từ Server Component. Action phải làm
   server gửi UI mới (`revalidatePath('/cart')` — 📄 `actions/cart.actions.ts` **đã có** trong mọi cart
   action; hoặc `refresh()`, xem file `10`). Nếu không, Action xong → optimistic biến mất → UI nhảy về
   giá trị cũ dù server đã đổi.
2. **Reducer pure** — không log, không mutate, không random.
3. **`applyOptimistic` gọi trong transition/Action** — form action, action của `useActionState`, hoặc
   `startTransition`. Gọi từ `onClick` thường → React cảnh báo và giá trị không được giữ.

   ```tsx
   // ❌ ngoài transition → cảnh báo "optimistic state update occurred outside a transition", giá trị không giữ
   <button onClick={() => onOptimistic({ type: 'remove', productId })}>Remove</button>

   // ✅ bọc trong startTransition cùng với lời gọi Server Action
   <button onClick={() => startTransition(async () => {
     onOptimistic({ type: 'remove', productId })
     const fd = new FormData()
     fd.set('productId', productId)
     fd.set('oldQuantity', String(quantity))
     await removeFromCartAction(initialActionState, fd)
   })}>Remove</button>
   ```

### ⚠️ Cạm bẫy riêng của repo: API dạng delta

Backend nhận `{ productId, oldQuantity, newQuantity }` — dấu hiệu tính delta. Thứ tự và giá trị `old` quan trọng.

Hôm nay nút bị disable suốt Action (gồm cả nhận UI mới), nên bấm liên tiếp luôn thấy prop mới. Nhưng UI
optimistic thường đi kèm **bỏ disable** để bấm nhanh — lúc đó nếu hidden input đọc từ `items` gốc:

```
❌ CartLine nhận item gốc:          ✅ CartLine nhận optimisticItems:
A: old=2, new=3                      A: old=2, new=3
B: old=2, new=3  (prop chưa đổi)     B: old=3, new=4
C: old=2, new=3                      C: old=4, new=5
```

`useActionState` xếp hàng các lần dispatch và chạy **tuần tự**, nên chuỗi A→B→C đến server đúng thứ tự.

> **Bài học:** optimistic UI không chỉ là hiển thị — nó đổi **dữ liệu bạn gửi lên server**. Với API
> delta, buộc phải dựa trên optimistic state. Nếu sửa được backend: **API absolute** (chỉ gửi `quantity`)
> an toàn hơn.

### Chỗ khác nên dùng `useOptimistic`

| Component | Hành động | Optimistic |
| --- | --- | --- |
| `comment-section.tsx` | Post / delete comment | Thêm (mờ, "đang gửi") / xoá khỏi list ngay |
| `product-row-actions.tsx` | Publish/Unpublish | Đổi nhãn ngay |
| `store-header.tsx` + `add-to-cart.tsx` | Add to cart | Tăng badge |

Dòng cuối là giới hạn: badge ở `StoreHeader` (Server Component, trong layout), nút ở `AddToCart` (Client,
trong page) — **không chung state**. Cần một Context client cho cart count (file `05`).

---

## 6. When NOT to Use

**Kết quả không đoán được** → không optimistic. `placeOrderAction` (📄 `components/store/checkout-wizard.tsx`)
trả về order ID, trạng thái thanh toán, có thể cảnh báo hết hàng. Dùng `useFormStatus` — 📄
`components/auth/submit-button.tsx` hiện `'Processing…'` và disable khi `pending`.

**Thất bại gây hậu quả nghiêm trọng** (thanh toán, xoá không hồi phục) → để người dùng chờ kết quả thật.

**Không bọc giá trị input vào transition:**

```tsx
// ❌ Hạ ưu tiên chính thứ cần gấp nhất; input controlled còn có thể nhảy chữ
startTransition(() => setQuery(e.target.value))
```

| Tình huống | Công cụ | Vì sao |
| --- | --- | --- |
| Đổi số lượng / xoá item / toggle publish | `useOptimistic` | Đoán được |
| Đặt hàng, đăng nhập, upload | `useFormStatus` / `isPending` | Không đoán được |
| Gọi Server Action ngoài form | `useTransition` (async) | Cần `isPending` |
| Filter 10k dòng ở client | `useTransition` | Render nặng |
| Nhận query từ prop, render nặng | `useDeferredValue` | Không sở hữu setState |
| Điều hướng `<Link>` | `useLinkStatus` | Next quản lý navigation |

---

## 7. Trade-offs

| Công cụ | Lợi ích | Cái giá |
| --- | --- | --- |
| `useTransition` | UI không đơ; `isPending` cho cả việc async | `setState` sau `await` cần bọc lại; bọc input là sai |
| `useDeferredValue` | Đơn giản, tự hiện giá trị cũ | Ít kiểm soát; cần memo con nặng mới có tác dụng |
| `useOptimistic` | Cảm giác tức thì | Reducer pure; UI "giật" khi rollback; **đổi cả dữ liệu gửi lên server** |
| `useFormStatus` | Trung thực, đơn giản | Người dùng chờ thật |

---

## 8. Best Practices

1. **Hỏi đúng câu:** render nặng? cần `isPending`? hay cần thấy *kết quả* ngay?
2. **`useOptimistic` ở cấp có đủ dữ liệu** để tính lại mọi thứ bị ảnh hưởng (dòng + tổng).
3. **Gọi `applyOptimistic` trong chính Action** đang chờ server, không phải trong wrapper trả về ngay.
4. **Truyền optimistic state xuống con** nếu con dùng nó để tạo request tiếp theo.
5. **Action phải làm server gửi UI mới** (`revalidatePath` / `updateTag` / `refresh`).
6. **Pending: làm mờ dữ liệu cũ** thay vì spinner thay thế.
7. **Đẩy việc nặng sang server** thay vì tối ưu transition ở client.

---

## Tự kiểm tra

1. Vì sao câu "`useTransition` chỉ dành cho chờ CPU" sai trong React 19? Chỉ ra ví dụ trong repo.
2. Giá trị optimistic sống tới khi nào? Điều gì xảy ra nếu action không gọi `revalidatePath`?
3. Vì sao gọi `onOptimistic` trong action của `useActionState` an toàn hơn trong wrapper `form action`?
4. Vì sao `optimisticItems.map(...)` (không phải `items.map(...)`) quan trọng với API delta?
5. Vì sao `placeOrderAction` không nên optimistic, còn `updateCartQuantityAction` thì nên?
6. `useTransition` khác `useDeferredValue` ở điểm cốt lõi nào?

➡️ Tiếp theo: `08-server-vs-client-components.md` — bắt đầu Phần B về Next.js
