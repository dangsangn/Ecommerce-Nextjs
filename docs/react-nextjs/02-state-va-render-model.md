# 02. State & Render Model — nơi 90% lỗi React thực sự sinh ra

> **Mục tiêu:** hiểu state *là gì* ở mức cơ chế, và có được một khung quyết định rõ ràng:
> state này nên nằm ở đâu — trong component, ở component cha, trong URL, hay không cần tồn tại?

---

## 1. Overview

### State không phải "biến để lưu dữ liệu"

Định nghĩa chính xác hơn: **state là một mẩu thông tin mà React ghi nhớ giữa các lần render, và khi
nó đổi thì React biết phải render lại.**

Hai nửa của định nghĩa này quan trọng như nhau:

- **"ghi nhớ giữa các lần render"** → phân biệt state với biến local (biến local bị khởi tạo lại mỗi lần render)
- **"khi đổi thì render lại"** → phân biệt state với `ref` (ref cũng ghi nhớ, nhưng đổi thì *không* render lại)

Từ đó suy ra một câu hỏi lọc rất hữu ích khi bạn định thêm `useState`:

> *"Nếu giá trị này đổi, UI có cần vẽ lại không?"*
>
> - Có → `useState`
> - Không, nhưng cần ghi nhớ → `useRef`
> - Không cần ghi nhớ → biến local thường

### Vấn đề mà React giải quyết bằng state

Nếu không có state, bạn phải tự đồng bộ dữ liệu với DOM: đọc `input.value`, tự gọi
`element.textContent = ...`, tự nhớ nút nào đang mở. Đó là mô hình jQuery — và nó thất bại vì
**không có một nguồn sự thật duy nhất**. DOM và biến JS của bạn dần lệch nhau, tạo ra những bug
kiểu "đóng modal rồi mở lại thì mất dữ liệu".

React đảo chiều: **bạn khai báo UI như một hàm của state, React chịu trách nhiệm làm DOM khớp với nó.**

```
UI = f(state, props)
```

---

## 2. Mental Model

### 🧠 State như một tấm ảnh (snapshot)

Đây là mô hình quan trọng nhất trong chương này.

**Mỗi lần render là một tấm ảnh đóng băng.** Trong một lần render cụ thể, mọi biến state là
**hằng số**. Chúng không đổi giữa dòng 5 và dòng 20 của cùng một lần render.

Hãy đọc đoạn này và dự đoán kết quả:

```tsx
const [count, setCount] = useState(0)

function handleClick() {
  setCount(count + 1)
  setCount(count + 1)
  setCount(count + 1)
  console.log(count)   // in ra gì?
}
```

Trong lần render mà `count = 0`:
- `console.log(count)` in ra **`0`**, không phải `3`. `count` là hằng số của tấm ảnh này.
- Cả ba lệnh `setCount` đều tính `0 + 1 = 1`. Kết quả cuối: `count = 1`, **không phải `3`**.

Muốn cộng ba lần, phải dùng **dạng updater function** — nó nhận giá trị *mới nhất trong hàng đợi*
thay vì giá trị của tấm ảnh:

```tsx
setCount(c => c + 1)   // c = 0 → 1
setCount(c => c + 1)   // c = 1 → 2
setCount(c => c + 1)   // c = 2 → 3   ✅
```

📄 **Repo này dùng đúng dạng updater ở chỗ cần** — `components/store/checkout-wizard.tsx`:

```tsx
const set = (k: keyof typeof address) => (e: React.ChangeEvent<HTMLInputElement>) =>
  setAddress((a) => ({ ...a, [k]: e.target.value }))
```

Vì sao `(a) => ({...a})` chứ không phải `({...address, [k]: value})`?

Nếu người dùng gõ nhanh vào hai ô khác nhau, hoặc nếu React batch hai lần thay đổi, dạng
`{...address}` sẽ đọc từ tấm ảnh cũ và **ghi đè mất** thay đổi kia. Dạng updater đọc từ giá trị mới
nhất nên luôn an toàn. Đây là quy tắc:

> **Khi giá trị mới được tính TỪ giá trị cũ → luôn dùng dạng updater function.**

📄 **Và một chỗ khác trong cùng repo** — `components/store/comment-section.tsx`:

```tsx
const toggle = (id: string) => setReplyOpen((cur) => (cur === id ? null : id))
```

Cùng nguyên tắc: giá trị mới (`null` hay `id`) phụ thuộc vào giá trị cũ (`cur`) → dùng updater.

### 🧠 Closure trong render — vì sao "stale state" xảy ra

Mỗi lần render tạo ra một **scope mới** với các biến state mới và các hàm mới "chụp" (capture) chúng.
Hàm `handleClick` của render #1 mãi mãi thấy `count = 0`, kể cả khi bạn gọi nó 5 giây sau:

```tsx
function Counter() {
  const [count, setCount] = useState(0)

  function handleClick() {
    setTimeout(() => {
      alert(count)      // ← luôn là giá trị TẠI LÚC RENDER, không phải lúc alert chạy
    }, 3000)
  }
}
```

Bấm nút khi `count = 0`, rồi bấm tăng lên 5, đợi 3 giây → alert hiện **`0`**.
Đây không phải bug của React. Đây là closure của JavaScript, và nó **nhất quán** với mô hình snapshot.

---

## 3. How It Works — khung quyết định "state này nên ở đâu?"

Đây là phần có giá trị thực tế nhất của chương. Với mỗi mẩu thông tin, đi qua cây quyết định này:

```
Thông tin này có thể TÍNH RA từ props/state khác không?
├─ CÓ  ──▶ ❌ Không tạo state. Tính trực tiếp trong render.
└─ KHÔNG
   │
   Nó có cần tồn tại khi người dùng refresh / share link không?
   ├─ CÓ  ──▶ 🔗 Đặt vào URL (searchParams)
   └─ KHÔNG
      │
      Có bao nhiêu component cần nó?
      ├─ 1 ──────▶ useState trong chính component đó
      ├─ 2-3 gần nhau ──▶ Lift state lên component cha gần nhất
      └─ Nhiều, rải rác ──▶ Context (hoặc state library)
```

Hãy áp dụng cây này lên từng ví dụ thật trong repo.

### 3.1 Nhánh "tính ra được" → derived state

📄 `components/store/checkout-wizard.tsx`:

```tsx
const [address, setAddress] = useState({ street: '', city: '', state: '', country: '' })

const addressComplete = address.street && address.city && address.state && address.country
```

`addressComplete` **không phải state**. Nó là một biến thường được tính lại mỗi lần render.

Nếu tác giả viết theo cách "phổ biến nhưng sai":

```tsx
// ❌ Anti-pattern: state phái sinh + effect đồng bộ
const [addressComplete, setAddressComplete] = useState(false)
useEffect(() => {
  setAddressComplete(!!(address.street && address.city && address.state && address.country))
}, [address])
```

Bạn vừa mua ba vấn đề:
1. **Một lần render thừa** cho mỗi lần gõ (render với address mới → effect → setState → render lại)
2. **Một khoảng thời gian state sai** — giữa hai lần render đó, `addressComplete` chưa khớp với `address`
3. **Một nguồn sự thật thứ hai** có thể lệch khỏi nguồn thứ nhất

> **Quy tắc:** nếu bạn viết `useEffect` chỉ để `setState` từ một state/prop khác — bạn đang tạo
> derived state sai cách. Hãy tính trực tiếp.

📄 Ví dụ tương tự, `components/store/cart-line.tsx`:

```tsx
const lineTotal = toPriceString(toPriceNumber(price) * quantity)
```

Không có `useState`, không có `useMemo`. Chỉ là phép nhân — và đó là câu trả lời đúng.

📄 Và `components/store/order-status-timeline.tsx`:

```tsx
const currentIndex = ORDER_PROGRESSION.indexOf(status)
```

Vị trí trên timeline được **suy ra** từ `status`. Nếu tác giả lưu `currentIndex` thành state, mỗi lần
`status` đổi lại phải nhớ cập nhật index — và sẽ có lúc quên.

### 3.2 Nhánh "cần khi refresh / share" → URL là state

Đây là quyết định kiến trúc quan trọng nhất mà repo này làm đúng, và nhiều dev bỏ qua.

📄 `components/products/product-list.tsx` — tab Draft/Published:

```tsx
function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      href={`/seller/products?tab=${tab}`}
      className={cn('...', active ? 'bg-background ...' : 'text-muted-foreground ...')}
    >
      {children}
    </Link>
  )
}
```

Chú ý: **không có `useState('draft')`**. Tab hiện tại là một `<Link>` đổi URL, và giá trị `current`
đến từ Server Component đọc `searchParams`:

📄 `app/(seller)/seller/products/page.tsx`:

```tsx
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab === 'published' ? 'published' : 'draft'
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
  const path = `/product/list/${tab}?page=${page}&limit=${LIMIT}`
  // ... fetch theo tab
```

**So sánh hai thiết kế:**

| | `useState` cho tab | URL cho tab (cách repo chọn) |
| --- | --- | --- |
| Refresh trang | ❌ Về tab mặc định | ✅ Giữ nguyên tab |
| Share link | ❌ Người nhận thấy tab khác | ✅ Thấy đúng tab |
| Nút Back của browser | ❌ Không hoạt động | ✅ Hoạt động đúng |
| Data cho tab | Phải fetch ở client (`useEffect` + loading state) | Server fetch, HTML về đã có data |
| JS cần gửi xuống client | Toàn bộ logic tab + fetch | **Không có gì** — `TabLink` là Server Component |
| Độ phức tạp code | Cao hơn (state + effect + loading + error) | Thấp hơn |

Đây là ví dụ rõ nhất cho nguyên tắc: **trong App Router, URL là store toàn cục miễn phí, có sẵn
persistence, sharing, history — và cho phép server làm việc fetch.**

📄 Cùng mô hình cho tìm kiếm — `components/store/search-box.tsx`:

```tsx
export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  return (
    <form
      className="w-full max-w-sm"
      action={(formData) => {
        const q = String(formData.get('q') ?? '').trim()
        router.push(q ? `/?q=${encodeURIComponent(q)}` : '/')
      }}
    >
      <Input name="q" type="search" placeholder="Search products…" defaultValue={defaultValue} aria-label="Search products" />
    </form>
  )
}
```

Ba điều đáng học từ 12 dòng này:

1. **Input là uncontrolled** (`defaultValue`, không `value`+`onChange`). Không có state nào theo dõi
   từng ký tự → không có render nào cho mỗi lần gõ.
2. **`action` nhận một hàm thường** (không phải Server Action). Đây là tính năng React 19: form action
   có thể là function ở client. React tự gọi nó với `FormData`.
3. **`router.push` mới là nơi "state" được ghi.** Từ khoá tìm kiếm sống trong URL.

⚠️ **Nhưng có một bug thật ở đây.** `app/(store)/layout.tsx`:

```tsx
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <StoreHeader />       {/* ← không truyền q */}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      ...
```

`StoreHeader` có signature `({ q = '' }: { q?: string })` và truyền `q` xuống `SearchBox` làm
`defaultValue`. Nhưng layout gọi `<StoreHeader />` **không có `q`** → `defaultValue` luôn là `''`.

Hệ quả: tìm "áo thun" → nhận kết quả đúng, nhưng ô search **bị xoá trắng**.

Vì sao? **Layout trong App Router không nhận `searchParams`.** Đó là thiết kế có chủ đích: layout
không re-render khi searchParams đổi (để giữ hiệu năng cho client-side navigation). Cách sửa đúng:
đọc `q` ở phía client trong `SearchBox`:

```tsx
'use client'
import { useSearchParams, useRouter } from 'next/navigation'

export function SearchBox() {
  const router = useRouter()
  const q = useSearchParams().get('q') ?? ''
  return (
    <form action={(fd) => { /* ... */ }}>
      {/* key ép React tạo input MỚI khi q đổi, nên defaultValue được áp lại */}
      <Input key={q} name="q" type="search" defaultValue={q} aria-label="Search products" />
    </form>
  )
}
```

Chú ý `key={q}` — sẽ giải thích ngay dưới đây.

### 3.3 Nhánh "chỉ 1 component cần" → colocation

📄 `components/discounts/create-discount-form.tsx`:

```tsx
const [type, setType] = useState<DiscountType>('fixed_amount')
const [appliesTo, setAppliesTo] = useState<AppliesTo>('all')
```

Hai state này chỉ ảnh hưởng tới UI *bên trong* form:

```tsx
<p className="text-xs text-muted-foreground">
  {type === 'percentage' ? '0–100 (percent)' : 'Amount off'}
</p>

{appliesTo === 'specific_products' ? (
  <div className="space-y-2">
    <Label htmlFor="discount_product_ids">Product IDs</Label>
    <Input id="discount_product_ids" name="discount_product_ids" placeholder="id1, id2, id3" />
  </div>
) : null}
```

Vì không component nào bên ngoài quan tâm, state nằm ngay tại chỗ dùng. Đây là **colocation** — và
là mặc định đúng. Đừng đẩy state lên cao "cho chắc".

⚠️ **Một chi tiết tinh tế:** khi `appliesTo` đổi từ `specific_products` về `all`, ô `discount_product_ids`
**bị unmount** → React xoá state của nó → giá trị người dùng đã gõ mất luôn. Ở đây điều đó là *đúng*
(không nên gửi product IDs khi chọn "all"), nhưng bạn cần **ý thức** rằng unmount = mất state.
Nếu muốn giữ giá trị khi ẩn/hiện, React 19.2 có `<Activity mode="hidden">` cho đúng việc này.

### 3.4 Nhánh "2-3 component gần nhau" → lift state up

📄 `components/products/create-product-form.tsx` — đây là ví dụ sách giáo khoa:

```tsx
export function CreateProductForm() {
  const [uploadResult, setUploadResult] = useState<PreparedImages | null>(null)
  const [type, setType] = useState<ProductType>('CLOTHING')
  const [state, formAction] = useActionState(createProductAction, initialActionState)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>1. Images</CardTitle></CardHeader>
        <CardContent>
          <ImageUploader onPrepared={setUploadResult} />   {/* ← con GHI state */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Details</CardTitle></CardHeader>
        <CardContent>
          <form action={formAction}>
            <fieldset disabled={!uploadResult} className="space-y-4 disabled:opacity-60">
              {/* ← form ĐỌC state */}
              {uploadResult ? (
                <>
                  <input type="hidden" name="productId" value={uploadResult.productId} />
                  <input type="hidden" name="thumbUrl" value={uploadResult.thumb.url} />
                  ...
```

**Vì sao `uploadResult` phải ở đây, không thể ở trong `ImageUploader`?**

Vì có **hai** consumer ở hai nhánh khác nhau của cây:
- `ImageUploader` tạo ra nó
- `<fieldset disabled>` và các `<input type="hidden">` tiêu thụ nó

Component cha gần nhất chứa cả hai chính là `CreateProductForm`. Đó là nơi đúng — không cao hơn,
không thấp hơn.

Chú ý `<fieldset disabled={!uploadResult}>` — một chi tiết hay: thay vì ẩn form hoặc render có điều
kiện, tác giả dùng thuộc tính HTML gốc để vô hiệu hoá **toàn bộ** field con trong một dòng. Ít code hơn,
accessible hơn (screen reader hiểu `disabled`), và giữ layout ổn định.

📄 **Một ví dụ lift state phức tạp hơn** — `components/store/comment-section.tsx`:

```tsx
export function CommentSection({ productId, comments, currentUserId }) {
  const { topLevel, repliesByParent } = groupComments(comments)
  const [replyOpen, setReplyOpen] = useState<string | null>(null)

  const toggle = (id: string) => setReplyOpen((cur) => (cur === id ? null : id))
  const close = () => setReplyOpen(null)
```

Hãy để ý kiểu dữ liệu: **`string | null`**, không phải `Record<string, boolean>`.

Đây là một quyết định thiết kế state rất tốt. Kiểu `string | null` **mã hoá luật nghiệp vụ vào chính
kiểu dữ liệu**: chỉ một form reply được mở tại một thời điểm. Không thể biểu diễn trạng thái sai.

So sánh với thiết kế `Record<string, boolean>`:

```tsx
// ❌ Cho phép biểu diễn trạng thái không mong muốn
const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
// { 'c1': true, 'c2': true, 'c3': true } — 3 form mở cùng lúc. Có chủ ý không?
```

> **Nguyên tắc:** chọn kiểu state hẹp nhất có thể biểu diễn được mọi trạng thái *hợp lệ*, và không
> biểu diễn được trạng thái *không hợp lệ*. Đây gọi là "make illegal states unrepresentable".

---

## 4. `key` — công cụ reset state bị đánh giá thấp

React nhận diện một component instance bằng **vị trí trong cây + `key`**. Đổi `key` = React coi đó
là component hoàn toàn khác → **unmount cái cũ, mount cái mới, state reset sạch**.

Đây là cách xử lý đúng cho tình huống "state cần reset khi prop đổi":

```tsx
// ❌ Cách sai: effect đồng bộ prop → state
function EditForm({ product }) {
  const [name, setName] = useState(product.product_name)
  useEffect(() => { setName(product.product_name) }, [product])  // render thừa + state sai tạm thời
  ...
}

// ✅ Cách đúng: để React reset bằng key
<EditForm key={product._id} product={product} />
```

📄 **Repo này tránh được vấn đề đó theo một cách còn tốt hơn** — `components/products/edit-product-form.tsx`
dùng **uncontrolled input**:

```tsx
<Input id="product_name" name="product_name" defaultValue={product.product_name} />
<Input
  id="product_price"
  name="product_price"
  type="number"
  step="0.01"
  min="0"
  defaultValue={toPriceString(product.product_price)}
/>
<Textarea
  id="product_description"
  name="product_description"
  defaultValue={product.product_description ?? ''}
/>
```

Không có `useState` nào cho các field này. Giá trị sống trong DOM, và Server Action đọc chúng qua
`FormData`. Đây là lựa chọn đúng vì:

- Form này **không cần** phản ứng theo từng ký tự (không có validate live, không có preview)
- Ít state → ít render → ít bug
- Trang là Server Component, `product` không đổi giữa các lần render → không có nguy cơ "prop đổi mà
  input không cập nhật"

⚠️ **Nhưng phải hiểu cái bẫy của uncontrolled:** `defaultValue` **chỉ được đọc một lần**, khi input
mount. Nếu prop `product` đổi mà component không unmount, input **giữ giá trị cũ**. Đó chính xác là
bug của `SearchBox` ở mục 3.2 — và là lý do bản sửa cần `key={q}`.

### Controlled vs Uncontrolled — khung quyết định

| Dùng **controlled** (`value` + `onChange`) khi | Dùng **uncontrolled** (`defaultValue`) khi |
| --- | --- |
| Cần validate/format ngay khi gõ | Chỉ cần giá trị lúc submit |
| Cần disable/enable field khác theo giá trị này | Field độc lập |
| Cần preview live (markdown, giá tiền) | Không có preview |
| Cần đồng bộ với URL hoặc state ngoài | Không cần |
| Ví dụ trong repo: `Select` của `create-discount-form` | Ví dụ trong repo: mọi `Input` trong `edit-product-form` |

Chú ý: các `<Select>` trong `create-discount-form.tsx` **buộc phải** controlled:

```tsx
<Select name="discount_type" value={type} onValueChange={(v) => setType(v as DiscountType)}>
```

vì giá trị của nó điều khiển UI khác (hiện gợi ý `0–100 (percent)` và hiện/ẩn ô product IDs).
Đây là ứng dụng đúng của controlled.

---

## 5. `useState` vs `useReducer`

`useReducer` giải quyết một vấn đề cụ thể: **khi nhiều mẩu state phải đổi cùng nhau theo luật rõ ràng.**

📄 Hãy phân tích `checkout-wizard.tsx` như một bài tập:

```tsx
const [step, setStep] = useState(0)
const [address, setAddress] = useState({ street: '', city: '', state: '', country: '' })
const [method, setMethod] = useState('COD')
```

Ba `useState` cho một wizard 3 bước. **Có nên đổi sang `useReducer`?**

Câu trả lời cho repo hiện tại: **không**. Lý do:

- Ba state này **độc lập** — đổi `step` không cần đổi `address`, và ngược lại
- Chuyển step chỉ là `setStep(1)`, không có luật phức tạp
- Tổng cộng 3 lời gọi hook, dễ đọc

**Nhưng nó sẽ đổi thành "có" khi nào?** Khi xuất hiện các luật liên quan, ví dụ:

- "Khi đổi `method` sang `CARD`, phải reset `address.country` vì chỉ ship nội địa cho card"
- "Khi lùi từ step 2 về step 1, xoá trạng thái đã xác nhận"
- "Không được vào step 2 nếu address chưa đủ" (hiện tại luật này nằm rải rác ở `disabled={!addressComplete}`)

Lúc đó `useReducer` gom mọi luật vào một chỗ có tên:

```tsx
type WizardState = {
  step: 0 | 1 | 2
  address: Address
  method: PaymentMethod
}

type WizardAction =
  | { type: 'setField'; field: keyof Address; value: string }
  | { type: 'setMethod'; method: PaymentMethod }
  | { type: 'next' }
  | { type: 'back' }

function reducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case 'setField':
      return { ...s, address: { ...s.address, [a.field]: a.value } }
    case 'setMethod':
      // Luật nghiệp vụ sống ở ĐÂY, không rải rác trong JSX
      return a.method === 'CARD'
        ? { ...s, method: a.method, address: { ...s.address, country: '' } }
        : { ...s, method: a.method }
    case 'next':
      if (s.step === 1 && !isAddressComplete(s.address)) return s   // guard
      return { ...s, step: Math.min(s.step + 1, 2) as WizardState['step'] }
    case 'back':
      return { ...s, step: Math.max(s.step - 1, 0) as WizardState['step'] }
  }
}
```

| Tiêu chí | `useState` | `useReducer` |
| --- | --- | --- |
| Số mẩu state | 1–3, độc lập | 4+, hoặc phụ thuộc nhau |
| Luật chuyển trạng thái | Đơn giản (set giá trị) | Có điều kiện, guard, side-state |
| Test | Phải render component | **Test reducer như hàm pure** — không cần React |
| Debug | Đọc rải rác các `setX` | Một chỗ duy nhất, log được mọi action |
| Chi phí đọc code | Thấp cho case đơn giản | Cao hơn (boilerplate) — không đáng cho 2 state |

> **Ranh giới thực dụng:** dùng `useState` cho tới khi bạn thấy mình viết `setA(); setB(); setC()`
> cùng lúc ở nhiều nơi, hoặc thấy một `if` bảo vệ trước khi set. Đó là tín hiệu chuyển sang reducer.

---

## 6. When NOT to Use `useState`

Bảng dưới là danh sách các trường hợp `useState` **là câu trả lời sai** — mỗi dòng đều là lỗi thường gặp:

| Bạn đang định lưu... | Đừng dùng `useState`. Hãy dùng... | Vì sao |
| --- | --- | --- |
| Giá trị tính ra được từ props/state khác | Biến thường trong render | Tránh render thừa + state lệch nhau |
| Data fetch từ server, dùng ở page | `async` Server Component | Không cần JS ở client, không có loading state |
| Trạng thái pending của form | `useFormStatus` / `useActionState` | React đã quản lý sẵn (xem file `11`) |
| Tab/page/filter/từ khoá tìm kiếm | URL `searchParams` | Refresh-safe, share-able, back button đúng |
| Giá trị input mà chỉ cần lúc submit | `defaultValue` + `FormData` | Ít state, ít render |
| Giá trị chỉ cần ghi nhớ, không cần render | `useRef` | Đổi ref không gây render |
| Một object timer/subscription | `useRef` + cleanup trong `useEffect` | Không liên quan đến UI |

---

## 7. Trade-offs

| Lợi ích của mô hình state khai báo | Cái giá |
| --- | --- |
| Một nguồn sự thật duy nhất; UI không bao giờ lệch khỏi data | Phải học mô hình snapshot; "stale closure" là bẫy thật cho người mới |
| Immutability làm việc so sánh cheap và time-travel debug khả thi | Phải copy object/array (`{...a}`, `[...arr]`) — dễ quên và tạo mutation ngầm |
| Colocation làm component tự chứa, dễ di chuyển | Khi cần chia sẻ, phải lift lên → prop drilling |
| Đưa state vào URL cho miễn phí persistence/sharing | Chỉ chứa được string; mỗi lần đổi là một navigation (có latency) |
| Uncontrolled input → cực ít render | Mất khả năng phản ứng theo từng ký tự; bẫy `defaultValue` không cập nhật |

**Vì sao mô hình này vẫn thắng:** cái giá chủ yếu là **chi phí học một lần**, còn lợi ích là
**giảm số lượng trạng thái không hợp lệ có thể tồn tại** — thứ chiếm phần lớn bug UI trong thực tế.

---

## 8. Best Practices

1. **Hỏi "có tính ra được không?" trước khi gõ `useState`.** Đây là bộ lọc hiệu quả nhất.
   `addressComplete` trong `checkout-wizard.tsx` là mẫu để noi theo.

2. **Luôn dùng updater function khi giá trị mới phụ thuộc giá trị cũ.** Repo này làm đúng ở cả
   `setAddress((a) => ...)` và `setReplyOpen((cur) => ...)`.

3. **Đưa state "có ý nghĩa với người dùng" vào URL.** Tiêu chí: nếu người dùng refresh mà mất nó thì
   họ sẽ khó chịu → nó thuộc về URL. Tab, page, filter, search query, tab của modal đang mở.

4. **Chọn kiểu state hẹp nhất.** `string | null` thay vì `Record<string, boolean>`.
   `0 | 1 | 2` thay vì `number`. Để TypeScript chặn trạng thái sai từ compile time.

5. **Mặc định dùng uncontrolled input cho form submit-một-lần.** Chỉ nâng lên controlled khi có
   nhu cầu thật (validate live, điều khiển field khác, preview).

6. **Dùng `key` để reset state, đừng dùng `useEffect`.** Nếu bạn thấy mình viết
   `useEffect(() => setX(prop), [prop])`, hãy dừng lại và nghĩ về `key`.

7. **Đừng lift state "cho chắc".** State nên ở component thấp nhất còn thấy được mọi consumer của nó.
   Lift sớm = prop drilling + render lại cả nhánh không liên quan.

---

## Tự kiểm tra

1. `setCount(count+1)` ba lần liên tiếp cho ra kết quả gì? Vì sao? Sửa thế nào?
2. Vì sao `addressComplete` trong `checkout-wizard.tsx` không nên là state?
3. Kể ra 4 lợi ích cụ thể của việc để tab Draft/Published trong URL thay vì `useState`.
4. Vì sao `replyOpen` có kiểu `string | null` mà không phải `Record<string, boolean>`?
5. `defaultValue` khác `value` ở điểm cốt lõi nào? Điều đó gây bug gì trong `SearchBox`?
6. Bạn sẽ chuyển `checkout-wizard` sang `useReducer` khi nào?

➡️ Tiếp theo: `03-useEffect-dung-va-sai.md`
