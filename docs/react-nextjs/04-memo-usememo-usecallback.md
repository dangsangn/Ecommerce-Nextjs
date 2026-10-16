# 04. `memo`, `useMemo`, `useCallback` — và vì sao repo này hầu như không cần

> **Mục tiêu:** hiểu memo hoá giải quyết vấn đề *gì*, tính được nó có lãi hay không, đánh giá
> các chỗ memo đang có trong repo, và biết React Compiler thay đổi bức tranh thế nào.

---

## 1. Overview

### Hiện trạng repo

```bash
$ grep -rnE "useMemo|useCallback|memo\(" app components lib actions --include='*.tsx' | grep -v components/ui
```

- `memo(...)`: **0**
- `useMemo`: ~10 lời gọi trong 3 file — `components/store/product-purchase.tsx`,
  `components/products/variation-editor.tsx`, `components/products/variant-editor.tsx`
- `useCallback`: 2 lời gọi trong `components/products/create-product-form.tsx`
- React Compiler: **chưa bật** (`next.config.ts` không có `reactCompiler`)

Chương này sẽ chấm điểm từng chỗ đó — và giải thích vì sao phần lớn cây UI không cần memo nào.

### Vấn đề mà memo hoá giải quyết

React re-render một component khi (1) state của nó đổi, hoặc (2) **cha re-render** — mặc định con
luôn render lại theo cha, kể cả khi props không đổi. Thường thì ổn: render function component chỉ là
gọi hàm. Vấn đề chỉ xuất hiện khi cây con **rất lớn** hoặc có việc **thực sự đắt** trong render.

| Công cụ | Ghi nhớ cái gì | Để làm gì |
| --- | --- | --- |
| `useMemo(fn, deps)` | **Kết quả** phép tính | Không tính lại phép tính đắt; giữ identity |
| `useCallback(fn, deps)` | **Chính function** | Giữ reference ổn định cho con đã `memo` / cho deps |
| `memo(Component)` | **Kết quả render** | Bỏ qua render nếu props shallow-equal lần trước |

**Ba cái này hầu như phải đi cùng nhau.** `memo` một mình vô dụng nếu cha truyền object/function mới
mỗi render.

---

## 2. Mental Model

### 🧠 Referential identity — trái tim của vấn đề

```js
{} === {}                    // false
(() => {}) === (() => {})    // false
'abc' === 'abc'              // true
```

`memo` so sánh từng prop bằng `Object.is` (**shallow comparison**) → mọi object/array/function tạo
mới trong render của cha luôn "khác":

```tsx
function ProductPage({ products }: { products: Product[] }) {
  const [qty, setQty] = useState(1)
  return (
    <MemoizedRecommendations
      config={{ layout: 'grid' }}                       // ← object MỚI mỗi render
      onAdd={(id) => addToCart(id)}                     // ← function MỚI mỗi render
      items={products.filter(p => p.isPublished)}       // ← array MỚI mỗi render
    />
  )
}
// Đổi qty → MemoizedRecommendations vẫn render lại. memo() chỉ tốn thêm phép so sánh.
```

### 🧠 Memo hoá như một tủ đông

Đông lạnh nồi phở (đắt, ăn nhiều lần) → lãi. Đông lạnh trứng chiên (10 giây) → lỗ.
`useMemo` **không miễn phí**: giữ giá trị cũ trong memory, so sánh deps mỗi render, thêm hook slot,
và — đắt nhất — **thêm code cho người sau đọc và giữ deps cho đúng**.

---

## 3. How It Works — quy tắc quyết định

```
1. Đã ĐO chưa? (React DevTools Profiler / Performance Tracks của React 19.2)
   ├─ Chưa ──▶ ❌ DỪNG. Đo trước.
   └─ Rồi
2. Render có thực sự chậm? (commit > ~16ms, drop frame, input lag)
   ├─ Không ──▶ ❌ Không memo.
   └─ Có
3. Nguyên nhân?
   ├─ Phép tính đắt             ──▶ useMemo
   ├─ Cây con lớn render vô ích ──▶ đưa state xuống thấp / tách component trước;
   │                                 rồi mới memo() + ổn định MỌI prop non-primitive
   └─ Danh sách rất dài         ──▶ Virtualization. memo KHÔNG giảm số DOM node.
```

---

## 4. Practical Examples — chấm điểm từng chỗ trong repo

### #1: `groupComments` — chạy mỗi render, không memo ✅

📄 `components/store/comment-section.tsx`:

```tsx
const { topLevel, repliesByParent } = groupComments(comments)   // ← mỗi render
const [replyOpen, setReplyOpen] = useState<string | null>(null)
```

`lib/comments/group.ts` là một vòng `for` O(n) với `push`. 100 comment → vài **micro**giây;
ngân sách một frame là 16.000µs. `CommentSection` re-render khi bấm Reply/Cancel — vài lần mỗi giây
là tối đa. **Kết luận: không memo.**

```tsx
// Đúng cú pháp, nhưng KHÔNG đáng thêm
const { topLevel, repliesByParent } = useMemo(() => groupComments(comments), [comments])
```

Khi nào đổi chiều? 10.000 comment, hoặc phải sort + build cây nhiều tầng + format ngày → ~50ms mỗi
render. Lúc đó `useMemo` đúng.

> **Memo hoá là bài toán số học:** chi phí một lần × tần suất, so với ngân sách 16ms.

### #2: `set` tạo function mới mỗi render — không sao ✅

📄 `components/store/checkout-wizard.tsx`:

```tsx
const set = (k: keyof typeof address) => (e: React.ChangeEvent<HTMLInputElement>) =>
  setAddress((a) => ({ ...a, [k]: e.target.value }))

<Input id="street" value={address.street} onChange={set('street')} />
<Input id="city"   value={address.city}   onChange={set('city')} />
```

Mỗi ký tự gõ tạo vài function mới. Không phải vấn đề, vì **`Input` không bọc `memo`** — con không
memo thì identity của prop **vô nghĩa**, con vẫn render theo cha. Tạo closure tốn vài chục nano giây.

> **`useCallback` chỉ có ý nghĩa khi function được truyền vào:**
> 1. Một component đã bọc `memo`, **hoặc**
> 2. Dependency array của `useEffect`/`useMemo`/`useCallback` khác.

### #3: `useCallback` trong `create-product-form.tsx` — không mang lại gì ⚠️

```tsx
const handleUploaded = useCallback((result: PreparedImages) => {
  setDraftId((current) => current ?? result.productId)
  setImages((current) => { /* dedupe theo public_id */ })
}, [])

const handleRemove = useCallback((publicId: string) => { /* ... */ }, [])

<ImageManager onUploaded={handleUploaded} onRemove={handleRemove} ... />
```

Áp quy tắc ở #2: `ImageManager` **không bọc `memo`**, và bên trong nó chỉ gọi `onUploaded` trong
callback của transition / `onClick` — **không** đưa vào deps của effect nào. → Hai `useCallback` này
không ngăn được render nào. Vô hại, nhưng là code thừa; viết function thường là đủ.

(Chúng *sẽ* có ý nghĩa nếu sau này `ImageManager` bọc `memo`, hoặc dùng `onUploaded` trong deps
của một effect.)

### #4: Chuỗi `useMemo` trong `product-purchase.tsx` — memo để phục vụ memo ⚠️

```tsx
// Memoised because the ?? [] fallback would otherwise be a fresh array on
// every render and re-run the gallery memo below.
const variations = useMemo(() => spu.product_variations ?? [], [spu.product_variations])

const range = useMemo(() => priceRange(spu, skus), [spu, skus])

const gallery = useMemo<ProductImage[]>(() => {
  // gộp product_images + ảnh của variation + ảnh SKU, dedupe theo url
}, [spu.product_images, spu.product_thumb, variations, skus])
```

Comment nói đúng một bài học quan trọng: **`?? []` tạo array mới mỗi render**, nên nếu đưa nó vào
deps thì memo phía dưới luôn miss. Đây là hiệu ứng dây chuyền điển hình — memo một giá trị chỉ để
memo giá trị tiếp theo.

Nhưng chấm điểm thật:
- `gallery`: dedupe vài chục ảnh — micro giây. `range`: duyệt vài SKU.
- `spu`/`skus` đến từ Server Component, **không đổi** trong vòng đời trang; component chỉ re-render
  khi người mua chọn variant/ảnh — vài lần mỗi giây.

→ Cả chuỗi có thể bỏ, tính thẳng trong render, không đo được khác biệt. Nếu muốn tránh array mới mà
không cần hook, dùng **hằng số module**:

```tsx
const EMPTY: ProductVariation[] = []                        // một lần cho cả app
const variations = spu.product_variations ?? EMPTY          // identity ổn định, không useMemo
```

`variation-editor.tsx` và `variant-editor.tsx` cùng mẫu (`stored`, `thumb`, `gallery`, `activeIdx`,
`tiers`). `cartesianTiers` trong `variant-editor` là ứng viên duy nhất *có thể* đắt (tích Descartes
tăng theo cấp số nhân) — nhưng với 2 trục × 5 option = 25 tổ hợp thì vẫn rẻ.

⚖️ Không cần vội xoá: memo đúng deps thì vô hại. Bài học là **đừng thêm mới** khi chưa đo — và khi
bật React Compiler (mục 6), những chỗ này sẽ được tự động xử lý.

### #5: `cva` — đưa phần đắt lên tầng module ✅

📄 `components/ui/button.tsx`:

```tsx
const buttonVariants = cva("inline-flex ...", {           // ← chạy MỘT LẦN khi import module
  variants: { variant: {...}, size: {...} },
  defaultVariants: { variant: "default", size: "default" },
})

function Button({ className, variant = "default", size = "default", ...props }) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
```

Mỗi render chỉ chạy lookup + nối chuỗi; `twMerge` (trong `cn`) có LRU cache nội bộ. `useMemo` với deps
`[variant, size, className]` có khi còn đắt hơn cache nóng.

### #6: Dữ liệu tĩnh ở tầng module — tối ưu miễn phí ✅

`QUICK_ACTIONS` (`app/(seller)/seller/page.tsx`), `NAV_ITEMS` (`components/seller/nav-items.ts`),
`STEPS` (`components/account/upgrade-shop-form.tsx`) đều khai báo **ngoài component** — tạo một lần
cho cả đời ứng dụng.

```tsx
export function UpgradeShopForm() {
  const steps = ['Create your shop', '...']                 // ❌ array mới mỗi render
  const steps2 = useMemo(() => ['Create your shop', '...'], [])  // ❌ hook để đạt điều module cho miễn phí
}
const STEPS = ['Create your shop', 'Add your first product', 'Set up discount codes']  // ✅
```

> **Thứ tự khi cần identity ổn định:** (1) hằng số module → (2) đưa phép tính ra ngoài component →
> (3) cuối cùng mới `useMemo`/`useCallback`. `useMemo(() => ..., [])` gần như luôn nên là hằng module.

---

## 5. Vì sao phần lớn repo không cần memo — bốn lý do kiến trúc

**Memo hoá thường là triệu chứng của vấn đề kiến trúc, không phải giải pháp.**

**1. Các component render danh sách là Server Component.** 7/38 file trong `components/` (không tính
`ui/`) không có `'use client'`: `product-list`, `discount-list`, `order-card`, `order-status-timeline`,
`product-card`, `product-grid`, `store-header`. Ít file, nhưng là **toàn bộ phần render danh sách** —
tính theo số DOM node thì server chiếm áp đảo. Server Component render một lần thành HTML/RSC payload,
**không có re-render** → không có gì để memo (và hook không gọi được ở đó).

**2. Client Component nhỏ và ở "lá".** `submit-button`, `cancel-order-button`, `add-to-cart`,
`search-box`, `cart-line`... mỗi cái vài đến vài chục node. Re-render 40 node < 1ms. Đẩy `'use client'`
xuống sâu (file `08`) làm bài toán memo tự biến mất.

**3. Dữ liệu là props từ server, không đổi ở client.** `app/(store)/orders/page.tsx` fetch `orders`
trên server; khi dữ liệu đổi (cancel order), cơ chế là `revalidatePath` → server render lại → RSC
payload mới. Không có "state client đổi → cả cây render lại".

**4. State client ở chỗ thấp nhất.** Và khi cây con lớn lên, câu trả lời đầu tiên **không phải** `memo`:

```tsx
// 500 comment, replyOpen ở cấp section → mỗi lần bấm Reply render lại 500 CommentItem

// ❌ Chặn render: phải memo 500 component + ổn định mọi prop
const MemoCommentItem = memo(CommentItem)

// ✅ Loại bỏ render: state cục bộ từng comment
function CommentItemWithReply({ comment }: { comment: Comment }) {
  const [open, setOpen] = useState(false)
  // Bấm Reply ở #237 → chỉ #237 render lại
}
```

⚖️ Nhưng `comment-section.tsx` cố ý dùng `string | null` để bảo đảm **chỉ một form reply mở** — state
cục bộ mất tính chất đó. Hiệu năng vs ràng buộc nghiệp vụ; ở quy mô hiện tại, giữ nguyên là đúng.

---

## 6. React Compiler — memo hoá thành việc của máy

**React Compiler 1.0 (stable)** là build-time compiler tự chèn memo hoá: cache giá trị, function và
JSX không cần tính lại — chi tiết hơn con người làm (memo được cả sau early return, từng phần JSX).

Bật trong Next 16 (không mặc định):

```bash
pnpm add -D babel-plugin-react-compiler
```

```ts
// next.config.ts
const nextConfig: NextConfig = {
  reactCompiler: true,          // top-level, không còn nằm trong `experimental`
  // hoặc opt-in từng file: reactCompiler: { compilationMode: 'annotation' } + 'use memo'
}
```

Next chỉ chạy compiler (qua Babel) trên file có JSX/hook, nên build chậm hơn một chút nhưng có giới hạn.

**Ý nghĩa thực tế:**

- Compiler chỉ tối ưu đúng khi code **tuân thủ Rules of React** (render pure, không mutate
  props/state, hook gọi đúng luật). Component vi phạm sẽ bị **bỏ qua** (bail out) — không sai, chỉ
  không được tối ưu. Lint `eslint-plugin-react-hooks` (preset recommended) báo các vi phạm này.
- `useMemo`/`useCallback` sẵn có **vẫn hoạt động** cùng compiler. Hướng dẫn chính thức: code mới thì
  dựa vào compiler; giữ `useMemo`/`useCallback` làm **escape hatch** khi cần kiểm soát chính xác (ví dụ
  giá trị nằm trong deps của effect); đừng xoá hàng loạt memo cũ mà không test (có thể đổi tần suất
  chạy effect).
- Muốn loại một component khỏi compiler: directive `'use no memo'` ở đầu function.

> **Cho repo này:** code đơn giản, pure, không memo "phòng xa" chính là code compiler tối ưu tốt nhất.
> Nếu cần tối ưu, bật compiler *trước* khi rải `useMemo` bằng tay.

---

## 7. When to Use / When NOT

| ✅ Dùng khi | Công cụ |
| --- | --- |
| Phép tính > ~1ms chạy mỗi render (sort/filter 10k dòng) | `useMemo` |
| Object/function nằm trong deps của effect (options tạo WebSocket) | `useMemo` / `useCallback` (hoặc tạo bên trong effect) |
| Component lá đắt (chart, map, editor), cha render thường xuyên | `memo` + ổn định **mọi** prop non-primitive |
| Callback truyền vào component đã `memo` | `useCallback` |

❌ **Không dùng khi:**

- **Chưa profile** — không đọc code mà biết được bottleneck.
- **"Phòng xa"** — trả chi phí chắc chắn cho lợi ích giả định.
- **`memo` component nhận `children`** — `children` là JSX, object mới mỗi lần cha render:

  ```tsx
  const Card = memo(function Card({ children }: { children: React.ReactNode }) { /* ... */ })
  <Card><PriceTag value={price} /></Card>   // children mới mỗi render → memo luôn miss
  ```

- **Trong Server Component** — không re-render, và hook không gọi được.
- **Thay cho virtualization** hoặc **thay cho đưa state xuống thấp**.

---

## 8. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Bỏ qua phép tính/render thực sự đắt | Giữ giá trị cũ trong memory |
| Identity ổn định → chuỗi memo phía dưới hoạt động | So sánh deps mỗi render |
| Có thể là khác biệt 60fps vs 20fps ở UI nặng | **Độ phức tạp code**: deps sai → bug stale khó phát hiện |
| — | Cảm giác an toàn giả: "đã memo nên nhanh" mà chưa đo |

Lợi ích chỉ thành hiện thực ở số ít component thực sự đắt; cái giá phải trả ở **mọi** chỗ bạn memo.

---

## 9. Best Practices

1. **Đo trước** — Profiler ("Record why each component rendered"), Performance Tracks. Không commit nào
   > 16ms → không có vấn đề render.
2. **Sửa kiến trúc trước:** Server Component → đưa state xuống → hằng số/phép tính ra tầng module →
   virtualize → bật React Compiler → **rồi mới** memo tay.
3. **Memo thì memo trọn vẹn** — `memo(Child)` kèm ổn định mọi prop non-primitive.
4. **Ghi lý do kèm số đo:**
   ```tsx
   // Profiler: 340ms/render với 12k dòng (CPU throttle 4x). useMemo → 0.2ms. Xoá nếu dataset nhỏ lại.
   const sorted = useMemo(() => heavySort(rows), [rows])
   ```

---

## Tự kiểm tra

1. Vì sao `memo(Child)` vô dụng nếu cha truyền `config={{a: 1}}`?
2. Hai `useCallback` trong `create-product-form.tsx` có ngăn được render nào không? Vì sao?
3. Vì sao `product-purchase.tsx` phải memo `variations` chỉ để memo `gallery`? Cách nào tránh mà không cần hook?
4. `useCallback` chỉ có ích trong hai trường hợp nào?
5. Bốn lý do kiến trúc khiến repo này hầu như không cần memo?
6. Bật React Compiler trong Next 16 thế nào? Component vi phạm Rules of React thì sao?

➡️ Tiếp theo: `05-ref-context-va-hook-con-lai.md`
