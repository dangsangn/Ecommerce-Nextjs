# 02. State & Render Model — nơi 90% lỗi React thực sự sinh ra

> **Mục tiêu:** hiểu state *là gì* ở mức cơ chế, và có khung quyết định rõ ràng:
> state này nên nằm ở đâu — trong component, ở component cha, trong URL, hay không cần tồn tại?

---

## 1. Overview

**State là thông tin React ghi nhớ giữa các lần render, và khi nó đổi thì React render lại.**

- **"ghi nhớ giữa các lần render"** → khác biến local (khởi tạo lại mỗi lần render)
- **"đổi thì render lại"** → khác `ref` (ref cũng ghi nhớ, nhưng đổi thì *không* render lại)

Câu hỏi lọc khi định thêm `useState`: *"Nếu giá trị này đổi, UI có cần vẽ lại không?"*

```tsx
function ProductGallery({ images }: { images: ProductImage[] }) {
  const [activeIdx, setActiveIdx] = useState(0)      // ✅ đổi → ảnh lớn phải vẽ lại → state
  const swipeStartX = useRef(0)                      // ✅ cần nhớ, nhưng không hiển thị → ref
  const active = images[activeIdx] ?? images[0]      // ✅ tính ra được → biến local
  // ...
}
```

React đảo chiều mô hình jQuery (tự đồng bộ DOM bằng tay, DOM và biến JS dần lệch nhau):
**bạn khai báo UI như hàm của state, React lo làm DOM khớp.** `UI = f(state, props)`.

---

## 2. Mental Model

### 🧠 State như một tấm ảnh (snapshot)

**Mỗi lần render là một tấm ảnh đóng băng.** Trong một lần render, mọi biến state là **hằng số**.

```tsx
const [count, setCount] = useState(0)

function handleClick() {
  setCount(count + 1)
  setCount(count + 1)
  setCount(count + 1)
  console.log(count)   // in ra gì?
}
```

Trong render mà `count = 0`: `console.log` in **`0`**, và cả ba lệnh đều tính `0 + 1` → kết quả
**`1`**, không phải `3`. `setState` không đổi biến hiện tại — nó **xếp hàng** một lần render mới.

Muốn cộng ba lần, dùng **updater function** — nhận giá trị *mới nhất trong hàng đợi*:

```tsx
setCount(c => c + 1)   // 0 → 1
setCount(c => c + 1)   // 1 → 2
setCount(c => c + 1)   // 2 → 3 ✅
```

📄 `components/store/checkout-wizard.tsx`:

```tsx
const set = (k: keyof typeof address) => (e: React.ChangeEvent<HTMLInputElement>) =>
  setAddress((a) => ({ ...a, [k]: e.target.value }))
```

Với `onChange` đơn lẻ, `{...address, [k]: v}` cũng chạy đúng (mỗi lần gõ là một event riêng, đã
render xong trước event sau). Nhưng ngay khi có **hai cập nhật trong cùng một lô** — ví dụ nút
"Dùng địa chỉ mặc định" gọi `set('city')` rồi `set('state')` — dạng đọc từ snapshot sẽ **ghi đè mất**
cập nhật đầu. Updater luôn an toàn, nên đặt thành quy tắc:

> **Giá trị mới tính TỪ giá trị cũ → luôn dùng updater.**

📄 `components/store/comment-section.tsx`: `setReplyOpen((cur) => (cur === id ? null : id))` — cùng nguyên tắc.

### 🧠 Closure trong render — vì sao "stale state" xảy ra

Mỗi render tạo một **scope mới**; các hàm tạo trong render đó "chụp" state của nó mãi mãi:

```tsx
function CartBadge() {
  const [count, setCount] = useState(0)

  function notifyLater() {
    setTimeout(() => alert(count), 3000)   // ← giá trị LÚC RENDER, không phải lúc alert chạy
  }
}
```

Bấm khi `count = 0`, tăng lên 5, đợi 3 giây → alert **`0`**. Đây là closure của JavaScript, nhất
quán với mô hình snapshot. Cách sửa tuỳ mục đích:

```tsx
// Cần CẬP NHẬT dựa trên giá trị mới nhất → updater
setTimeout(() => setCount(c => c + 1), 3000)

// Cần ĐỌC giá trị mới nhất trong callback chạy muộn → ref (hoặc useEffectEvent trong effect, file 03/05)
const countRef = useRef(count)
useEffect(() => { countRef.current = count })   // ghi ref sau commit, không ghi trong render (file 05)
setTimeout(() => alert(countRef.current), 3000)
```

---

## 3. How It Works — khung quyết định "state này nên ở đâu?"

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

### 3.1 Nhánh "tính ra được" → derived state

📄 `components/store/checkout-wizard.tsx`:

```tsx
const [address, setAddress] = useState({ street: '', city: '', state: '', country: '' })
const addressComplete = address.street && address.city && address.state && address.country
```

`addressComplete` **không phải state** — chỉ là biến tính lại mỗi render. Cách "phổ biến nhưng sai":

```tsx
// ❌ State phái sinh + effect đồng bộ
const [addressComplete, setAddressComplete] = useState(false)
useEffect(() => {
  setAddressComplete(!!(address.street && address.city && address.state && address.country))
}, [address])
```

Ba vấn đề: (1) **render thừa** mỗi lần gõ, (2) **một frame state sai** giữa hai lần render,
(3) **nguồn sự thật thứ hai** có thể lệch.

> **Quy tắc:** viết `useEffect` chỉ để `setState` từ state/prop khác = derived state sai cách. Tính trực tiếp.

Các ví dụ cùng mẫu trong repo:

- `components/store/cart-line.tsx`: `const lineTotal = toPriceString(toPriceNumber(price) * quantity)` — không state, không `useMemo`.
- `components/store/order-status-timeline.tsx`: `const currentIndex = ORDER_PROGRESSION.indexOf(status)`.
- `components/products/create-product-form.tsx`:

  ```tsx
  // "Ảnh chính" suy ra từ lựa chọn + danh sách ảnh — không bao giờ lệch khi xoá ảnh
  const thumb = images.find((i) => i.public_id === thumbPublicId) ?? images[0] ?? null
  const ready = Boolean(draftId && thumb)
  ```

  Nếu `thumb` là state riêng, xoá đúng ảnh đang làm thumb sẽ để lại một thumb "ma" — trừ khi bạn
  nhớ cập nhật nó ở mọi chỗ.

### 3.2 Nhánh "cần khi refresh / share" → URL là state

📄 `components/products/product-list.tsx` — tab Draft/Published **không có `useState`**:

```tsx
function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link href={`/seller/products?tab=${tab}`} className={cn('...', active ? '...' : '...')}>
      {children}
    </Link>
  )
}
```

`current` đến từ Server Component đọc `searchParams` — `app/(seller)/seller/products/page.tsx`:

```tsx
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const sp = await searchParams            // Next 15+: searchParams là Promise
  const tab = sp.tab === 'published' ? 'published' : 'draft'
  const page = Number(sp.page) > 0 ? Number(sp.page) : 1
  // ... fetch theo tab
```

| | `useState` cho tab | URL cho tab (repo chọn) |
| --- | --- | --- |
| Refresh / share link | ❌ Về tab mặc định | ✅ Giữ đúng tab |
| Nút Back | ❌ Không hoạt động | ✅ Đúng |
| Data cho tab | Fetch ở client (effect + loading) | Server fetch, HTML về đã có data |
| JS gửi xuống client | Logic tab + fetch | **Không có** — `TabLink` là Server Component |

**Trong App Router, URL là store toàn cục miễn phí: persistence, sharing, history — và server làm việc fetch.**

📄 Tìm kiếm cũng vậy — `components/store/search-box.tsx`:

```tsx
export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  return (
    <form
      action={(formData) => {
        const q = String(formData.get('q') ?? '').trim()
        router.push(q ? `/?q=${encodeURIComponent(q)}` : '/')
      }}
    >
      <input name="q" type="search" defaultValue={defaultValue} aria-label="Search products" />
    </form>
  )
}
```

1. **Input uncontrolled** (`defaultValue`) → không render nào cho mỗi lần gõ.
2. **`action` nhận hàm client** (React 19). React gọi nó với `FormData` trong một transition, và
   **tự reset form** (các field uncontrolled về `defaultValue`) khi action xong.
3. **`router.push` mới là nơi ghi "state"** — từ khoá sống trong URL.

⚠️ **Bug thật:** `app/(store)/layout.tsx` gọi `<StoreHeader />` **không truyền `q`**, mà `StoreHeader`
(`({ q = '' })`) truyền `q` xuống làm `defaultValue` → luôn là `''`. Tìm "áo thun" → kết quả đúng,
nhưng ô search **trắng trơn** (cộng thêm việc React tự reset form sau action).

Gốc rễ: **layout không nhận `searchParams`** (có chủ đích — layout không re-render khi chỉ query
đổi). Sửa: đọc `q` ở client:

```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export function SearchBox() {
  const router = useRouter()
  const q = useSearchParams().get('q') ?? ''
  return (
    <form action={(fd) => { /* router.push(...) như cũ */ }}>
      {/* key={q}: q đổi → React tạo input MỚI → defaultValue được áp lại */}
      <input key={q} name="q" type="search" defaultValue={q} aria-label="Search products" />
    </form>
  )
}

// store-header.tsx — bắt buộc bọc Suspense: route prerender + useSearchParams
// mà thiếu boundary thì `next build` lỗi "Missing Suspense boundary with useSearchParams"
<Suspense fallback={<SearchBoxSkeleton />}>
  <SearchBox />
</Suspense>
```

### 3.3 Nhánh "chỉ 1 component cần" → colocation

📄 `components/discounts/create-discount-form.tsx`:

```tsx
const [type, setType] = useState<DiscountType>('fixed_amount')
const [appliesTo, setAppliesTo] = useState<AppliesTo>('all')

// chỉ ảnh hưởng UI bên trong form:
{type === 'percentage' ? '0–100 (percent)' : 'Amount off'}
{appliesTo === 'specific_products' ? (
  <Input id="discount_product_ids" name="discount_product_ids" placeholder="id1, id2, id3" />
) : null}
```

Không ai bên ngoài quan tâm → state nằm tại chỗ dùng. **Colocation là mặc định đúng.**

⚠️ Khi `appliesTo` về `all`, ô product IDs **unmount → mất giá trị đã gõ**. Ở đây đúng ý (không
gửi IDs khi chọn "all"), nhưng hãy nhớ: **unmount = mất state**. Muốn ẩn mà giữ state, React 19.2 có:

```tsx
<Activity mode={appliesTo === 'specific_products' ? 'visible' : 'hidden'}>
  <Input name="discount_product_ids" />   {/* ẩn nhưng giữ giá trị */}
</Activity>
```

(Lưu ý: field bị ẩn bằng `<Activity>` vẫn nằm trong DOM với `display: none`, nên **vẫn được submit**
cùng form — ở case này đó là lý do repo đúng khi unmount.)

### 3.4 Nhánh "2-3 component gần nhau" → lift state up

📄 `components/products/create-product-form.tsx`:

```tsx
export function CreateProductForm() {
  const [draftId, setDraftId] = useState<string | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [thumbPublicId, setThumbPublicId] = useState<string | null>(null)
  // ...
  return (
    <form action={formAction}>
      {draftId && thumb ? <input type="hidden" name="images" value={JSON.stringify(images)} /> : null}
      <ImageManager images={images} onUploaded={handleUploaded} onRemove={handleRemove} ... /> {/* GHI */}
      <VariantEditor images={images} thumb={thumb} />                                          {/* ĐỌC */}
      <SubmitButton disabled={!ready}>Create product</SubmitButton>                           {/* ĐỌC */}
    </form>
  )
}
```

`images` **không thể** nằm trong `ImageManager` vì có consumer ở nhánh khác: `VariantEditor` cần
cùng danh sách để gán ảnh cho từng option, hidden input cần nó để submit. Cha gần nhất chứa tất cả
là `CreateProductForm` — không cao hơn, không thấp hơn. (Comment đầu file ghi đúng lý do này.)

📄 **Kiểu state hẹp** — `components/store/comment-section.tsx`:

```tsx
const [replyOpen, setReplyOpen] = useState<string | null>(null)
```

`string | null` **mã hoá luật nghiệp vụ vào kiểu**: chỉ một form reply mở tại một thời điểm.

```tsx
// ❌ Cho phép trạng thái không mong muốn: { c1: true, c2: true, c3: true } — 3 form mở cùng lúc
const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
```

> **"Make illegal states unrepresentable":** chọn kiểu hẹp nhất biểu diễn được mọi trạng thái hợp lệ
> và không biểu diễn được trạng thái sai.

---

## 4. `key` — công cụ reset state bị đánh giá thấp

React nhận diện instance bằng **vị trí trong cây + `key`**. Đổi `key` = component khác →
**unmount cũ, mount mới, state reset sạch**.

```tsx
// ❌ Effect đồng bộ prop → state: render thừa + một frame hiển thị tên sản phẩm cũ
function EditForm({ spu }: { spu: Product }) {
  const [name, setName] = useState(spu.product_name)
  useEffect(() => { setName(spu.product_name) }, [spu])
}

// ✅ Để React reset bằng key
<EditForm key={spu._id} spu={spu} />
```

📄 `components/products/edit-product-form.tsx` né vấn đề bằng **uncontrolled input**:

```tsx
<form action={detailsAction} className="space-y-4">
  <input type="hidden" name="id" value={spu._id} />
  <Input id="product_name" name="product_name" defaultValue={spu.product_name} />
  <Textarea id="product_description" name="product_description" defaultValue={spu.product_description ?? ''} />
  <SubmitButton>Save changes</SubmitButton>
</form>
```

Không `useState` nào; Server Action đọc qua `FormData`. Đúng vì form không cần phản ứng theo từng
ký tự, và `spu` không đổi trong vòng đời trang.

⚠️ **Bẫy của uncontrolled:** `defaultValue` **chỉ được đọc khi input mount**. Prop đổi mà không
unmount → input giữ giá trị cũ. Đó chính là bug `SearchBox` ở 3.2, và lý do cần `key={q}`.

### Controlled vs Uncontrolled

| **Controlled** (`value` + `onChange`) khi | **Uncontrolled** (`defaultValue`) khi |
| --- | --- |
| Validate/format ngay khi gõ | Chỉ cần giá trị lúc submit |
| Giá trị điều khiển UI khác | Field độc lập |
| Preview live (giá tiền, markdown) | Không có preview |
| Repo: `<Select value={type}>` của `create-discount-form` | Repo: các field của `edit-product-form` |

`<Select name="discount_type" value={type} onValueChange={...}>` **buộc phải** controlled vì giá trị
điều khiển gợi ý `0–100 (percent)` và việc hiện/ẩn ô product IDs.

---

## 5. `useState` vs `useReducer`

`useReducer` giải quyết: **nhiều mẩu state đổi cùng nhau theo luật rõ ràng.**

📄 `checkout-wizard.tsx` có `step`, `address`, `method` — **độc lập**, chuyển step chỉ là
`setStep(2)`. Hiện tại: **không cần reducer.**

Nó thành "cần" khi xuất hiện luật liên quan: "đổi `method` sang `CARD` thì reset `country`",
"không vào step 2 nếu address chưa đủ" (hiện nằm rải rác ở `disabled={!addressComplete}`). Lúc đó:

```tsx
type WizardState = { step: 0 | 1 | 2; address: Address; method: PaymentMethod }
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

const [wizard, dispatch] = useReducer(reducer, initialWizard)
```

| Tiêu chí | `useState` | `useReducer` |
| --- | --- | --- |
| Số mẩu state | 1–3, độc lập | Nhiều, phụ thuộc nhau |
| Luật chuyển | Set giá trị | Điều kiện, guard |
| Test | Phải render component | **Test reducer như hàm pure** |
| Chi phí | Thấp | Boilerplate — không đáng cho 2 state |

> **Tín hiệu chuyển:** bạn viết `setA(); setB(); setC()` cùng lúc ở nhiều nơi, hoặc có `if` bảo vệ
> trước khi set.

---

## 6. When NOT to Use `useState`

| Bạn định lưu... | Hãy dùng... | Vì sao |
| --- | --- | --- |
| Giá trị tính ra được | Biến thường trong render | Tránh render thừa + lệch |
| Data từ server cho page | `async` Server Component | Không JS client, không loading state |
| Pending/kết quả của form | `useActionState` / `useFormStatus` | React quản lý sẵn (file `11`) |
| Tab/page/filter/từ khoá | URL `searchParams` | Refresh-safe, share được, Back đúng |
| Input chỉ cần lúc submit | `defaultValue` + `FormData` | Ít render |
| Giá trị nhớ nhưng không hiển thị, timer id | `useRef` | Đổi ref không render |

---

## 7. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Một nguồn sự thật; UI không lệch data | Phải học snapshot; stale closure là bẫy thật |
| Immutability → so sánh rẻ (`Object.is`) | Phải copy object/array; mutate ngầm = UI không cập nhật |
| Colocation → component tự chứa | Cần chia sẻ thì phải lift → prop drilling |
| URL cho persistence/sharing miễn phí | Chỉ chứa string; mỗi lần đổi là một navigation |
| Uncontrolled → cực ít render | Không phản ứng theo ký tự; bẫy `defaultValue` |

```tsx
// ❌ Mutate: cùng reference → Object.is bằng nhau → React bỏ qua render
images.push(newImage); setImages(images)
// ✅ Tạo array mới
setImages(cur => [...cur, newImage])
```

---

## 8. Best Practices

1. **Hỏi "tính ra được không?" trước khi gõ `useState`** (mẫu: `addressComplete`, `thumb`).
2. **Updater khi giá trị mới phụ thuộc giá trị cũ.**
3. **State "có ý nghĩa với người dùng" vào URL** — refresh mà mất thì khó chịu → thuộc về URL.
4. **Kiểu state hẹp nhất** — `string | null`, `0 | 1 | 2`.
5. **Uncontrolled mặc định cho form submit-một-lần.**
6. **Reset bằng `key`, không bằng `useEffect(() => setX(prop), [prop])`.**
7. **Đừng lift "cho chắc"** — state ở component thấp nhất còn thấy mọi consumer.

---

## Tự kiểm tra

1. `setCount(count+1)` ba lần liên tiếp cho ra gì? Sửa thế nào?
2. Vì sao `thumb` trong `create-product-form.tsx` không nên là state?
3. Kể 4 lợi ích của việc để tab Draft/Published trong URL.
4. Vì sao `replyOpen` là `string | null` mà không phải `Record<string, boolean>`?
5. `defaultValue` khác `value` ở điểm cốt lõi nào? Gây bug gì trong `SearchBox`?
6. Bạn chuyển `checkout-wizard` sang `useReducer` khi nào?

➡️ Tiếp theo: `03-useEffect-dung-va-sai.md`
