# 04. `memo`, `useMemo`, `useCallback` — và vì sao repo này không dùng cái nào

> **Mục tiêu:** hiểu memo hoá giải quyết vấn đề *gì*, tính được nó có lãi hay không,
> và giải thích được vì sao một codebase React 19 hiện đại có thể **không cần một dòng memo nào**.

---

## 1. Overview

### Một sự thật cần nói trước

```bash
$ grep -rn "useMemo\|useCallback\|React.memo" app components lib actions
# (không có kết quả)
```

**Toàn bộ repo này không có một lời gọi `useMemo`, `useCallback`, hay `memo` nào.**

Đây không phải sự thiếu sót. Đây là hệ quả tự nhiên của một kiến trúc tốt, và chương này sẽ giải
thích chính xác vì sao — cùng với việc bạn cần thấy dấu hiệu gì mới thêm memo vào.

### Vấn đề mà memo hoá giải quyết

React re-render một component khi:
1. State của chính nó đổi, **hoặc**
2. Component cha re-render (mặc định: con luôn render lại theo cha)

Điều **(2)** là nguồn gốc của vấn đề. Nếu một component cha ở gần root re-render, mặc định **toàn bộ
cây con** render lại — kể cả những nhánh mà props không đổi gì cả.

Trong phần lớn trường hợp điều này **hoàn toàn ổn**, vì render một function component chỉ là gọi một
hàm và so sánh object — rất nhanh. Vấn đề chỉ xuất hiện khi:

- Cây con **rất lớn** (hàng nghìn node)
- Hoặc có component nào đó làm việc **thực sự đắt** trong lúc render

Ba công cụ memo hoá tấn công vấn đề này ở ba điểm khác nhau:

| Công cụ | Nó ghi nhớ cái gì | Để làm gì |
| --- | --- | --- |
| `useMemo(fn, deps)` | **Kết quả** của một phép tính | Không tính lại phép tính đắt |
| `useCallback(fn, deps)` | **Chính function đó** | Giữ reference ổn định để component con memo hoá không bị vô hiệu |
| `memo(Component)` | **Kết quả render** của một component | Bỏ qua render nếu props shallow-equal với lần trước |

**Điểm cực kỳ quan trọng:** ba cái này **hầu như luôn phải đi cùng nhau**. `memo` một mình vô dụng
nếu cha vẫn truyền xuống object/function mới mỗi lần render. Đây là lý do memo hoá thường thất bại.

---

## 2. Mental Model

### 🧠 Referential identity — trái tim của vấn đề

Mọi thứ về memo hoá đều quy về một sự thật của JavaScript:

```js
{} === {}                    // false
[] === []                    // false
(() => {}) === (() => {})    // false
'abc' === 'abc'              // true
42 === 42                    // true
```

`memo` so sánh props bằng `Object.is` (≈ `===`) trên từng key — gọi là **shallow comparison**.
Nghĩa là: **mọi object, array, hoặc function được tạo mới trong render của cha sẽ luôn "khác" so với
lần trước** — và `memo` ở con trở thành vô nghĩa.

```tsx
function Parent() {
  const [count, setCount] = useState(0)

  return (
    <MemoizedChild
      config={{ theme: 'dark' }}        // ← object MỚI mỗi render
      onSave={() => save()}             // ← function MỚI mỗi render
      items={data.filter(x => x.active)}// ← array MỚI mỗi render
    />
  )
}
// MemoizedChild render lại MỌI lần. memo() không giúp gì. Chỉ tốn thêm phép so sánh.
```

### 🧠 Memo hoá như một tủ đông

Đông lạnh một món ăn tốn: túi zip, chỗ trong tủ, điện, và thời gian rã đông.

- **Món đắt, ăn nhiều lần** (nồi phở) → đông lạnh **rất lãi**
- **Món rẻ, làm 10 giây** (trứng chiên) → đông lạnh **lỗ**: mất công gói, tốn chỗ, còn phải rã đông

`useMemo` cũng vậy. Nó **không miễn phí**:

- Giữ giá trị cũ trong memory (chiếm bộ nhớ cho tới khi component unmount)
- So sánh dependency array mỗi lần render
- Thêm một closure và một hook slot
- **Thêm code cho người sau phải đọc và bảo trì**

Nếu phép tính rẻ hơn tổng các chi phí trên → memo hoá làm chậm ứng dụng, và làm code khó đọc hơn.

---

## 3. How It Works — quy tắc quyết định

```
Bạn đang định memo hoá cái gì đó. Đi qua các câu hỏi này:

1. Bạn đã ĐO chưa? (React DevTools Profiler)
   ├─ Chưa ──▶ ❌ DỪNG. Đo trước. Đây là mệnh lệnh, không phải gợi ý.
   └─ Rồi
      │
2. Render này có thực sự chậm? (> ~16ms, gây drop frame)
   ├─ Không ──▶ ❌ Không memo. Bạn đang tối ưu cái không phải bottleneck.
   └─ Có
      │
3. Nguyên nhân là gì?
   ├─ Một phép tính đắt        ──▶ useMemo
   ├─ Cây con lớn render vô ích ──▶ memo() + useCallback/useMemo cho MỌI prop non-primitive
   └─ Danh sách rất dài        ──▶ Virtualization (react-window). memo KHÔNG giải quyết được.
```

Bước **1** là nơi phần lớn người ta bỏ qua, và cũng là nơi tạo ra hầu hết memo hoá vô ích trong
codebase thực tế.

---

## 4. Practical Examples — soi từng "ứng viên" trong repo

### Ứng viên #1: `groupComments` — chạy mỗi lần render

📄 `components/store/comment-section.tsx`:

```tsx
export function CommentSection({ productId, comments, currentUserId }) {
  const { topLevel, repliesByParent } = groupComments(comments)   // ← mỗi render
  const [replyOpen, setReplyOpen] = useState<string | null>(null)
```

📄 `lib/comments/group.ts`:

```tsx
export function groupComments(list: Comment[]): {
  topLevel: Comment[]
  repliesByParent: Record<string, Comment[]>
} {
  const topLevel: Comment[] = []
  const repliesByParent: Record<string, Comment[]> = {}
  for (const c of list) {
    if (c.parentId == null) {
      topLevel.push(c)
    } else {
      ;(repliesByParent[c.parentId] ??= []).push(c)
    }
  }
  return { topLevel, repliesByParent }
}
```

**Có nên `useMemo` không?**

Ta cần biết: (a) hàm này đắt bao nhiêu, (b) `CommentSection` render bao nhiêu lần.

**(a) Chi phí:** một vòng `for` O(n), mỗi bước làm một `push`. Với 100 comment → khoảng
**vài microsecond**. Ngân sách của một frame 60fps là 16.000 microsecond. Chi phí này là **0,01%** của
một frame.

**(b) Số lần render:** `CommentSection` re-render khi `replyOpen` đổi — tức là khi người dùng bấm
"Reply" hoặc "Cancel". Đó là hành động thủ công, tần suất tối đa vài lần mỗi giây.

**Kết luận: KHÔNG memo.** Chi phí ~5µs × vài lần/giây = không đáng kể. Thêm `useMemo` sẽ:
- Tăng 3 dòng code
- Thêm một hook slot + một closure + một array dependency phải so sánh
- Không cải thiện được gì có thể đo được

Nếu vẫn muốn tập viết, đây là cách nó *sẽ* trông:

```tsx
// Đúng cú pháp, nhưng KHÔNG NÊN thêm vào repo này
const { topLevel, repliesByParent } = useMemo(
  () => groupComments(comments),
  [comments],
)
```

**Khi nào con số đổi chiều?** Nếu `comments` lên tới 10.000 phần tử, hoặc nếu hàm này phải sort +
build cây nhiều tầng + format ngày cho từng comment. Lúc đó ~50ms mỗi render là vấn đề thật, và `useMemo` trở nên đúng.

> **Bài học chính:** memo hoá là bài toán *số học*, không phải bài toán *thẩm mỹ*.
> Luôn nhân **chi phí một lần** với **tần suất**, rồi so với ngân sách 16ms.

### Ứng viên #2: `set` — tạo function mới mỗi render

📄 `components/store/checkout-wizard.tsx`:

```tsx
const set = (k: keyof typeof address) => (e: React.ChangeEvent<HTMLInputElement>) =>
  setAddress((a) => ({ ...a, [k]: e.target.value }))

// ...
<Input id="street"  value={address.street}  onChange={set('street')} />
<Input id="city"    value={address.city}    onChange={set('city')} />
<Input id="state"   value={address.state}   onChange={set('state')} />
<Input id="country" value={address.country} onChange={set('country')} />
```

Mỗi lần render tạo ra **5 function mới**: bản thân `set`, cộng 4 function trả về từ `set('...')`.
Và vì `address` là controlled state, component render lại **mỗi ký tự người dùng gõ**.

**Đây có phải vấn đề?**

Không, vì `Input` **không được bọc `memo`**. Nếu con không memo hoá thì việc prop có identity ổn định
hay không **hoàn toàn vô nghĩa** — con sẽ render lại theo cha bất kể thế nào.

Việc tạo một closure trong JavaScript engine hiện đại tốn khoảng vài chục **nanosecond**. Tạo 5 cái
là ~100ns. Trong khi đó, gõ một ký tự → React render 4 `Input` + `Select` + `Card` — công việc đó
đắt hơn hàng trăm lần. Tối ưu vào 100ns là tối ưu vào chỗ sai.

> **Quy tắc:** `useCallback` **chỉ có ý nghĩa** khi function đó được truyền vào:
> 1. Một component đã bọc `memo`, **hoặc**
> 2. Dependency array của một `useEffect`/`useMemo` khác
>
> Ngoài hai trường hợp đó, `useCallback` là chi phí thuần không có lợi ích.

### Ứng viên #3: `cva` — hàm chạy mỗi render trong mọi component UI

📄 `components/ui/button.tsx`:

```tsx
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg ... [&_svg:not([class*='size-'])]:size-4",
  {
    variants: { variant: {...}, size: {...} },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({ className, variant = "default", size = "default", ...props }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

Mỗi lần render `Button`: gọi `buttonVariants(...)` để nối chuỗi class, rồi gọi `cn()` → `clsx()` →
`twMerge()`. `twMerge` phải **parse** các Tailwind class để giải quyết xung đột (`px-2` vs `px-4`).
Đây là công việc thực sự nhiều hơn `groupComments`.

**Vẫn không memo. Vì sao?**

1. **`cva()` chỉ chạy MỘT LẦN** — ở tầng module, khi file được import. Đây là kỹ thuật quan trọng:
   phần đắt (parse config variants) được đưa ra ngoài component. Chỉ lời gọi
   `buttonVariants({...})` (một phép nối chuỗi + lookup) là chạy mỗi render.

2. **`twMerge` có cache nội bộ.** Cùng chuỗi input → trả kết quả từ LRU cache. Lần đầu tốn, các lần
   sau gần như miễn phí.

3. **`useMemo` ở đây cần dependency `[variant, size, className]`.** So sánh 3 giá trị đó cộng chi phí
   hook có thể *đắt hơn* việc gọi `twMerge` với cache nóng.

> **Kỹ thuật đáng học:** thay vì memo hoá bên trong component, hãy **đưa phần đắt lên tầng module**.
> Đây là cách tối ưu tốt hơn `useMemo` vì nó chạy đúng một lần cho toàn ứng dụng, không phải một lần
> mỗi instance component.

### Ứng viên #4: dữ liệu tĩnh — tối ưu tốt nhất là tối ưu miễn phí

📄 `app/(seller)/seller/page.tsx`:

```tsx
const QUICK_ACTIONS = [
  { title: 'Products',  description: '...', href: '/seller/products',  cta: 'Manage products',  icon: Package },
  { title: 'Discounts', description: '...', href: '/seller/discounts', cta: 'Manage discounts', icon: Tag },
  { title: 'Account',   description: '...', href: '/seller/account',   cta: 'View account',     icon: User },
]

export default async function SellerHomePage() {
  // ...
  {QUICK_ACTIONS.map((action) => ( ... ))}
```

📄 `components/seller/nav-items.ts`:

```tsx
// Single source of truth for the seller navigation, shared by the desktop
// sidebar and the mobile drawer. Add new sections here (e.g. Orders) once the
// backend supports them.
export const NAV_ITEMS: SellerNavItem[] = [
  { label: 'Dashboard', href: '/seller',           icon: LayoutDashboard },
  { label: 'Products',  href: '/seller/products',  icon: Package },
  { label: 'Discounts', href: '/seller/discounts', icon: Tag },
  { label: 'Account',   href: '/seller/account',   icon: User },
]
```

📄 `components/account/upgrade-shop-form.tsx`:

```tsx
const STEPS = ['Create your shop', 'Add your first product', 'Set up discount codes']
```

Cả ba đều ở **tầng module**, ngoài component. Chúng được tạo **một lần cho cả đời ứng dụng**.

So sánh với cách viết mà rất nhiều người dùng:

```tsx
export function UpgradeShopForm({ isShop }: { isShop: boolean }) {
  // ❌ Array mới mỗi render
  const steps = ['Create your shop', 'Add your first product', 'Set up discount codes']

  // ❌ "Sửa" bằng useMemo — thêm hook, thêm code, để đạt đúng cái mà module-level cho miễn phí
  const steps2 = useMemo(() => ['Create your shop', '...'], [])
```

`useMemo(() => [...], [])` với dependency rỗng **luôn** nên là một hằng số ở tầng module. Nếu bạn thấy
pattern này trong code review, đó là dấu hiệu người viết chưa nghĩ tới lựa chọn rẻ hơn.

> **Thứ tự ưu tiên khi cần identity ổn định:**
> 1. Hằng số tầng module (miễn phí, tốt nhất)
> 2. Đưa phép tính ra ngoài component (như `cva`)
> 3. Cuối cùng mới đến `useMemo`/`useCallback`

---

## 5. Vì sao repo này không cần memo — bốn lý do kiến trúc

Đây là phần quan trọng nhất của chương, vì nó cho bạn thấy **memo hoá thường là triệu chứng của một
vấn đề kiến trúc**, không phải giải pháp.

### Lý do 1: Phần lớn cây UI là Server Component

📄 `app/(store)/orders/page.tsx`, `components/store/order-card.tsx`,
`components/products/product-list.tsx`, `components/discounts/discount-list.tsx`,
`components/store/product-grid.tsx` — **không có `'use client'`**.

Chúng render trên server, một lần, rồi biến thành HTML. **Chúng không có khái niệm "re-render".**
Memo hoá một thứ chỉ render một lần là vô nghĩa.

Con số chính xác: trong 30 component nghiệp vụ (không tính `components/ui/`), **7 file là Server
Component**: `discount-list.tsx`, `product-list.tsx`, `order-card.tsx`, `order-status-timeline.tsx`,
`product-card.tsx`, `product-grid.tsx`, `store-header.tsx`.

Con số 7/30 nghe không nhiều — nhưng hãy để ý **đó là những file nào**: toàn bộ các component render
*danh sách*. Mỗi `<ProductGrid>` chứa 12 `<ProductCard>`; mỗi `<ProductList>` chứa 20 `<TableRow>`.
Tính theo **số node DOM được render**, phần server chiếm đa số áp đảo — và đó mới là đơn vị đúng để
đo bài toán re-render, không phải số file.

### Lý do 2: Client Component đều nhỏ và ở "lá"

Hãy xem các Client Component thật:

| File | Nội dung | Số node DOM |
| --- | --- | --- |
| `submit-button.tsx` | 1 button | ~1 |
| `cancel-order-button.tsx` | 1 form + 1 button | ~3 |
| `add-to-cart.tsx` | 1 form, 1 input, 1 button | ~5 |
| `search-box.tsx` | 1 form, 1 input | ~2 |
| `welcome-toast.tsx` | `return null` | 0 |
| `cart-line.tsx` | 1 dòng giỏ hàng | ~15 |

Cái lớn nhất là `checkout-wizard.tsx` với khoảng 40 node. Render lại 40 node mất **dưới 1ms**.

Đây là kết quả của một nguyên tắc kiến trúc: **đẩy `'use client'` xuống càng sâu càng tốt** (chi tiết
ở file `08`). Khi client boundary nằm ở lá, mỗi lần re-render chỉ ảnh hưởng vài node — và bài toán
memo hoá tự biến mất.

### Lý do 3: Dữ liệu đến từ props của server, không phải state phát sinh ở client

📄 `app/(store)/orders/page.tsx`:

```tsx
export default async function OrdersPage() {
  let orders: Order[] = []
  try {
    const result = await apiFetch<OrdersResult>('/order', { auth: true })
    orders = result.data ?? []
  } catch (e) { /* ... */ }

  return (
    <div className="space-y-4">
      {orders.map((o) => <OrderCard key={o._id} order={o} />)}
    </div>
  )
}
```

`orders` là một array được fetch trên server. Nó **không đổi** trong suốt vòng đời của trang đó.
Không có `setState` nào làm nó thay đổi → không có re-render nào cần chặn.

Khi dữ liệu đổi (ví dụ sau khi cancel order), cơ chế là `revalidatePath('/orders')` → server render
lại → gửi RSC payload mới. Đây là mô hình hoàn toàn khác với "state ở client đổi → cây con render lại".

### Lý do 4: Mọi state client đều ở đúng chỗ thấp nhất

📄 `comment-section.tsx` giữ `replyOpen` ở cấp section. Khi nó đổi, cả section render lại — khoảng
vài chục node cho một trang comment thông thường. Không cần memo.

**Nhưng nếu trang có 500 comment thì sao?** Lúc đó `replyOpen` đổi sẽ render lại 500 `CommentItem`.
Và đây là lúc câu trả lời **không phải** `memo`:

```tsx
// ❌ Cách "đúng sách" nhưng vẫn phải memo 500 component
const MemoCommentItem = memo(CommentItem)

// ✅ Cách tốt hơn: đưa state xuống chỗ nó thuộc về
function CommentItemWithReply({ comment, ... }) {
  const [open, setOpen] = useState(false)   // state cục bộ cho TỪNG comment
  // ...
}
// Bấm Reply ở comment #237 → chỉ comment #237 render lại. 499 cái kia không biết gì.
```

> **Nguyên tắc:** đưa state xuống thấp thường **hiệu quả hơn** memo hoá, vì nó *loại bỏ* việc render
> chứ chỉ *chặn* nó. Và nó không thêm dòng code nào.
>
> ⚠️ Lưu ý: cách này chỉ áp dụng khi luật nghiệp vụ cho phép. Ở `comment-section.tsx` hiện tại,
> `string | null` cố ý bảo đảm **chỉ một form reply mở tại một thời điểm** — state cục bộ sẽ mất tính
> chất đó. Đây là trade-off giữa hiệu năng và ràng buộc nghiệp vụ, không phải "cách nào cũng tốt hơn".

---

## 6. React Compiler — khi memo hoá thành việc của máy

React Compiler (trước đây là "React Forget") là một build-time compiler tự động chèn memo hoá vào
code của bạn. Nó phân tích component và tự thêm cache cho những giá trị/function/JSX không cần tính lại —
tương đương việc bạn viết `useMemo`/`useCallback`/`memo` ở mọi chỗ hợp lý, nhưng chính xác hơn con người.

**Ý nghĩa thực tế:**

- Viết code **đơn giản, không memo** như repo này đang làm → chính là cách chuẩn bị tốt nhất cho compiler
- Compiler chỉ hoạt động đúng nếu component của bạn **tuân thủ Rules of React** (pure render, không
  mutate props/state). Đây lại là một lý do nữa để giữ render pure.
- Memo hoá thủ công *thừa* có thể khiến compiler **bỏ qua** component đó, vì nó thấy code đã "được
  can thiệp".

> **Hệ quả cho bạn ngay hôm nay:** đừng thêm memo "phòng xa". Code sạch, pure, không memo là code
> mà compiler tối ưu tốt nhất. Nếu bạn định bật compiler, hãy làm việc đó *trước* khi rải `useMemo`.

---

## 7. When to Use — bốn tình huống memo hoá thực sự đúng

| Tình huống | Công cụ | Ví dụ |
| --- | --- | --- |
| Phép tính > ~1ms, chạy mỗi render | `useMemo` | Sort/filter 10.000 dòng; parse markdown; tính toán trên dataset lớn |
| Giá trị đi vào dependency array của effect | `useMemo`/`useCallback` | Một object `options` truyền vào `useEffect` tạo WebSocket |
| Component lá đắt, cha render thường xuyên | `memo` + memo hoá **mọi** prop non-primitive | Chart, map, code editor nhúng |
| Callback truyền vào component đã `memo` | `useCallback` | `onSelect` truyền cho một virtualized list đã memo |

Chú ý dòng thứ 3: **`memo` + memo hoá mọi prop non-primitive**. Nếu bạn `memo(Chart)` nhưng vẫn
truyền `data={rows.map(...)}` thì bạn không đạt được gì. Memo hoá là công việc "tất cả hoặc không".

## 8. When NOT to Use

- **Chưa profile.** Không thương lượng. Bạn không thể biết bottleneck ở đâu bằng cách đọc code.
- **Để "phòng xa".** Bạn đang trả chi phí chắc chắn (code, memory, đọc hiểu) cho một lợi ích giả định.
- **`memo` một component nhận `children`.** `children` là JSX — một object mới mỗi lần cha render.
  `memo` sẽ **luôn** miss. Đây là sai lầm rất phổ biến:
  ```tsx
  const Card = memo(function Card({ children }) { ... })
  <Card><Thing /></Card>   // children là object mới mỗi render → memo vô dụng
  ```
- **Trong Server Component.** Không có re-render thì không có gì để chặn. `useMemo`/`useCallback`
  thậm chí **không gọi được** trong Server Component (chúng là hook).
- **Thay cho virtualization.** Danh sách 10.000 dòng: vấn đề là bạn đang tạo 10.000 DOM node.
  `memo` không giảm số node. Chỉ virtualization giải quyết được.
- **Thay cho việc đưa state xuống thấp.** Xem lý do 4 ở trên.

---

## 9. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Bỏ qua được phép tính hoặc render thực sự đắt | Tăng dùng memory (giá trị cũ được giữ tới khi unmount) |
| Giữ identity ổn định → chuỗi memo hoá phía dưới hoạt động | Mỗi lần render vẫn phải so sánh dependency array |
| Có thể là khác biệt giữa 60fps và 20fps ở UI nặng | **Chi phí lớn nhất: độ phức tạp code.** Dependency array sai → bug stale, khó phát hiện |
| — | Tạo cảm giác an toàn giả: "đã memo rồi nên nhanh" mà chưa từng đo |
| — | Có thể ngăn React Compiler tối ưu component đó |

**Vì sao trade-off này thường lỗ:** vì lợi ích chỉ hiện thực hoá trong một tỷ lệ nhỏ component
(những cái thực sự đắt), còn cái giá phải trả ở **mọi** component bạn memo — kể cả 99% cái không cần.
Đó là lý do quy tắc "đo trước" quan trọng đến vậy.

---

## 10. Best Practices

1. **Đo trước bằng React DevTools Profiler.** Bật "Record why each component rendered". Nếu không có
   commit nào > 16ms, bạn không có vấn đề hiệu năng render.

2. **Sửa kiến trúc trước khi memo hoá.** Theo thứ tự ưu tiên:
   1. Chuyển component sang Server Component
   2. Đưa state xuống thấp hơn (loại bỏ render thay vì chặn nó)
   3. Đưa hằng số/phép tính lên tầng module
   4. Virtualize danh sách dài
   5. **Rồi mới** memo hoá

3. **Hằng số luôn ở tầng module.** `NAV_ITEMS`, `QUICK_ACTIONS`, `STEPS`, `ORDER_PROGRESSION`,
   `PRODUCT_TYPES` trong repo này đều đúng.

4. **Nếu memo, hãy memo trọn vẹn.** `memo(Child)` phải đi kèm `useCallback`/`useMemo` cho **mọi** prop
   non-primitive. Memo hoá nửa vời tệ hơn không memo.

5. **Đừng bao giờ `memo` một component nhận `children`** (trừ khi bạn cũng memo hoá chính JSX children).

6. **Ghi lại lý do.** Nếu bạn memo, để lại comment kèm số đo:
   ```tsx
   // Profiler: 340ms mỗi render với 12k dòng (đo trên Chrome, CPU throttle 4x).
   // useMemo giảm còn 0.2ms cho các lần render sau. Xoá nếu dataset nhỏ lại.
   const sorted = useMemo(() => heavySort(rows), [rows])
   ```
   Không có số đo, người sau sẽ không biết memo này còn cần thiết hay không — và sẽ để nó ở đó mãi.

---

## Tự kiểm tra

1. Vì sao `memo(Child)` không giúp gì nếu cha truyền `config={{a: 1}}`?
2. Tính xem `groupComments` với 100 comment có đáng `useMemo` không. Trình bày phép tính.
3. `useCallback` chỉ có ích trong hai trường hợp nào?
4. Bốn lý do kiến trúc khiến repo này không cần memo hoá là gì?
5. Với danh sách 500 comment và một `replyOpen` ở cấp section: `memo` hay đưa state xuống thấp?
   Trade-off nào phải cân nhắc?
6. Vì sao `useMemo(() => [...], [])` luôn là một code smell?

➡️ Tiếp theo: `05-ref-context-va-hook-con-lai.md`
