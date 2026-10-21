# 04 — `use()` và các API mới của React 19

> File 03 nói về Actions — "ghi" dữ liệu. File này nói về phía còn lại và những thay đổi nhỏ nhưng làm code gọn hơn hẳn:
>
> | API | Thay thế cho | Mức độ quan trọng |
> | --- | --- | --- |
> | `use(promise)` | `useEffect` + `useState` để đọc dữ liệu async | Cao |
> | `use(context)` | `useContext` (nhưng gọi được có điều kiện) | Trung bình |
> | `ref` là prop thường | `forwardRef` | Cao (giảm boilerplate) |
> | Ref cleanup function | `useEffect` đi kèm ref | Trung bình |
> | `<Context>` làm provider | `<Context.Provider>` | Thấp (cú pháp) |
> | `<title>`, `<meta>`, `<link>` trong component | `react-helmet` | Thấp trong Next (đã có Metadata API) |
> | `preload`, `preinit`, `preconnect`… | Tự chèn `<link rel=preload>` | Thấp |
> | React Compiler | `useMemo`, `useCallback`, `memo` thủ công | Cao (về lâu dài) |

---

## 1. `use()` — đọc giá trị của Promise hoặc Context ngay trong render

### Là gì?

```tsx
import { use } from 'react'

const data = use(promise)     // "mở" một Promise — suspend cho tới khi nó resolve
const theme = use(ThemeContext) // đọc Context
```

`use` **không phải là hook theo nghĩa chặt** — nó là một API đặc biệt: **được phép gọi trong `if`, trong vòng lặp**. Nhưng nó vẫn chỉ được gọi trong component hoặc hook (không gọi trong event handler).

### Tại sao tồn tại?

Trước React 19, đọc dữ liệu async ở client nghĩa là:

```tsx
// Kiểu cũ — 3 trạng thái tự quản, waterfall, double fetch ở Strict Mode
const [data, setData] = useState<Comment[] | null>(null)
const [error, setError] = useState<Error | null>(null)
useEffect(() => {
  let cancelled = false
  fetchComments(id).then((d) => !cancelled && setData(d)).catch(setError)
  return () => { cancelled = true }
}, [id])
if (error) return <ErrorView />
if (!data) return <Spinner />
return <List data={data} />
```

Với `use`, component chỉ mô tả **trường hợp đã có dữ liệu**; loading giao cho `<Suspense>`, lỗi giao cho Error Boundary:

```tsx
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise) // chưa xong → suspend → Suspense fallback hiện
  return <List data={comments} />
}
```

### 🧠 Mô hình tư duy: `await` cho component

> `use(promise)` ≈ `await promise`, nhưng dành cho component không phải `async`.
> Server Component có thể `await` thẳng. Client Component không thể `async` → dùng `use`.

### ⚠️ Quy tắc sống còn: Promise phải **ổn định**, không tạo trong render

```tsx
// ❌ SAI — mỗi lần render tạo Promise mới → suspend → render lại → Promise mới → vòng lặp vô hạn
function Comments({ id }: { id: string }) {
  const comments = use(fetch(`/api/comments?id=${id}`).then((r) => r.json()))
}
```

Promise phải đến từ **bên ngoài** lần render: được tạo ở Server Component và truyền xuống, hoặc được cache bởi thư viện (TanStack Query, SWR) / `cache()`.

### Ví dụ thực tế: streaming từ Server Component xuống Client Component

Đây là pattern mạnh nhất của `use` trong Next.js. Hiện tại [app/(store)/products/[id]/page.tsx](<../../app/(store)/products/[id]/page.tsx>) `await` **tuần tự** cả sản phẩm và bình luận trước khi trả HTML:

```tsx
// Hiện tại: trang chờ cả 2 request
detail = normalizeProductDetail(await apiFetch(`/product/${id}`))
comments = await apiFetch<Comment[]>(`/comment?productId=${id}`)
```

Bình luận không cần để hiển thị sản phẩm. Với `use`, ta có thể **bắt đầu** request bình luận nhưng **không chờ** nó:

```tsx
// app/(store)/products/[id]/page.tsx — Server Component
import { Suspense } from 'react'

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const commentsPromise = apiFetch<Comment[]>(`/comment?productId=${id}`).catch(() => []) // KHÔNG await
  const detail = normalizeProductDetail(await apiFetch(`/product/${id}`))              // chỉ chờ cái cần

  return (
    <>
      <ProductPurchase detail={detail} />
      <Suspense fallback={<CommentsSkeleton />}>
        <CommentSection commentsPromise={commentsPromise} productId={id} />
      </Suspense>
    </>
  )
}
```

```tsx
// components/store/comment-section.tsx — Client Component
'use client'
import { use } from 'react'

export function CommentSection({ commentsPromise, productId }: {
  commentsPromise: Promise<Comment[]>
  productId: string
}) {
  const comments = use(commentsPromise) // Promise được tạo ở server, stream qua ranh giới
  // ...
}
```

Kết quả: phần sản phẩm hiện ngay, bình luận stream tới sau. Next.js serialize được Promise qua ranh giới server→client (file 06).

> **Khi nào chọn cách này thay vì để Server Component tự `await` trong `<Suspense>`?** Nếu `CommentSection` đã là Client Component (cần state, form trả lời…), truyền Promise + `use` giữ nó ở client mà vẫn stream được. Nếu không cần tương tác, tách một Server Component `async` bọc trong Suspense còn đơn giản hơn.

### `use(context)` — Context có điều kiện

```tsx
function PriceTag({ price, showCurrency }: { price: number; showCurrency: boolean }) {
  if (!showCurrency) return <span>{price}</span>
  const { currency } = use(LocaleContext) // ✅ hợp lệ sau early return — useContext thì không
  return <span>{format(price, currency)}</span>
}
```

### When NOT to use `use`

- ❌ **Trong Server Component** — cứ `await` (component `async`).
- ❌ **Khi cần refetch, cache, phân trang, invalidation phía client** — `use` chỉ "mở" Promise; nó không phải thư viện data-fetching. Dùng TanStack Query/SWR (cả hai đều có chế độ Suspense).
- ❌ **Với Promise tạo trong render** của Client Component (xem trên).
- ❌ **Trong `try/catch`** — `use` suspend bằng cơ chế đặc biệt; bắt lỗi bằng Error Boundary, hoặc `.catch()` trên Promise trước khi truyền.

---

## 2. `ref` là prop thường — tạm biệt `forwardRef`

```tsx
// React 18
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  return <input ref={ref} {...props} />
})

// React 19 — ref chỉ là một prop
function Input({ ref, ...props }: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />
}
```

Bạn sẽ thấy điều này trong [components/ui/](../../components/ui/): không file nào dùng `forwardRef`. Component nhận props kiểu `React.ComponentProps<'input'>` (đã bao gồm `ref`) và rải `{...props}` xuống phần tử thật — `ref` đi theo như mọi prop khác.

**Khi nào vẫn gặp `forwardRef`?** Code cũ và thư viện còn hỗ trợ React 18. Nó vẫn hoạt động nhưng sẽ bị deprecate. Code mới: đừng dùng.

---

## 3. Ref callback có cleanup

```tsx
<div
  ref={(node) => {
    if (!node) return
    const observer = new ResizeObserver(() => { /* ... */ })
    observer.observe(node)
    return () => observer.disconnect() // ✅ React 19: chạy khi element bị gỡ
  }}
/>
```

**Tại sao quan trọng?** Trước đây, gắn logic vào DOM node cần cặp `useRef` + `useEffect`, và rất dễ quên rằng node có thể thay đổi. Ref callback có cleanup gắn vòng đời logic **trực tiếp với node**, đúng chỗ.

⚠️ Vì có cleanup, TypeScript sẽ báo lỗi nếu ref callback trả về giá trị không phải hàm: `ref={(n) => (this.node = n)}` → đổi thành `ref={(n) => { this.node = n }}`.

---

## 4. `<Context>` làm Provider

```tsx
const CartContext = createContext<Cart | null>(null)

// React 18
<CartContext.Provider value={cart}>{children}</CartContext.Provider>

// React 19
<CartContext value={cart}>{children}</CartContext>
```

Thuần cú pháp. Nhớ rằng Context chỉ tồn tại ở **Client Component** — Server Component không đọc được Context.

---

## 5. Metadata và stylesheet trong component

React 19 cho phép render `<title>`, `<meta>`, `<link>` ở bất kỳ đâu — React tự **đưa chúng lên `<head>`**:

```tsx
function BlogPost({ post }: { post: Post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.excerpt} />
      <h1>{post.title}</h1>
    </article>
  )
}
```

**Trong Next.js: KHÔNG dùng cách này cho SEO.** Next có Metadata API (`export const metadata`, `generateMetadata`) — xử lý merge giữa layout/page, Open Graph, tránh trùng lặp. Tính năng của React hữu ích cho app không dùng framework.

Tương tự, `<link rel="stylesheet" precedence="default">` và `<script async>` được React khử trùng lặp và sắp xếp — Next cũng đã lo phần này cho bạn.

---

## 6. API preload tài nguyên

```tsx
import { preload, preinit, preconnect, prefetchDNS } from 'react-dom'

function ProductGallery({ images }: { images: string[] }) {
  preconnect('https://res.cloudinary.com')        // mở kết nối sớm
  preload(images[1], { as: 'image' })             // tải trước ảnh thứ 2 (người dùng sắp lướt tới)
  return <Carousel images={images} />
}
```

Dùng khi bạn **biết chắc** tài nguyên sắp cần nhưng trình duyệt chưa phát hiện ra (ảnh trong carousel, font cho modal). Với ảnh chính của trang, `next/image` với `priority`/`preload` đã làm việc này.

⚠️ Preload thừa = lãng phí băng thông và **làm chậm** tài nguyên quan trọng thật. Chỉ dùng có đo đạc.

---

## 7. React Compiler — memo tự động

### Là gì?

Một plugin build (Babel) phân tích component và **tự chèn memoization** tương đương `useMemo`, `useCallback`, `memo` — ở mức chi tiết hơn bạn làm tay.

```tsx
// Bạn viết:
function ProductList({ products, query }) {
  const filtered = products.filter((p) => p.name.includes(query))
  const onSelect = (id) => track('select', id)
  return <List items={filtered} onSelect={onSelect} />
}
// Compiler tự đảm bảo `filtered` và `onSelect` chỉ tính lại khi products/query đổi.
```

### Trong Next.js 16

Đã **ổn định** nhưng **chưa bật mặc định** (repo này chưa bật):

```ts
// next.config.ts
const nextConfig: NextConfig = {
  reactCompiler: true, // cần cài: pnpm add -D babel-plugin-react-compiler
}
```

### Trade-offs

| Benefits | Costs |
| --- | --- |
| Hết phải nghĩ "có cần `useCallback` không?" | Build/dev chậm hơn (chạy qua Babel) |
| Memo chính xác hơn làm tay | Code vi phạm "rules of React" (mutate props, đọc ref trong render) có thể chạy sai → compiler sẽ bỏ qua component đó |
| Code gọn, dễ đọc | Debug khó hơn một chút: hành vi render khác code bạn thấy |

**Khi nào bật?** Khi có vấn đề re-render thật (đo bằng Profiler) và codebase tuân thủ rules of React (ESLint `react-hooks` v6+ báo các vi phạm mà compiler quan tâm). Với repo này — phần lớn là Server Component và form đơn giản — lợi ích hiện chưa lớn.

> ✅ Dù bật compiler hay không: **đừng rải `useMemo`/`useCallback` khắp nơi "cho chắc"**. Chúng có chi phí và làm code khó đọc. Chỉ thêm khi đo thấy vấn đề, hoặc khi giá trị là dependency của effect/prop của component `memo`.

---

## 8. Những cải thiện khác đáng biết

- **Thông báo lỗi hydration tốt hơn**: hiện diff cụ thể server vs client thay vì "Text content did not match". Gặp lỗi này trong Next → thường do `Date.now()`, `Math.random()`, `typeof window`, extension trình duyệt, hoặc HTML lồng sai (`<div>` trong `<p>`).
- **Owner Stack** (React 19.1, dev): stack trace cho biết component nào *render ra* component lỗi, không chỉ component cha trong cây.
- **`useDeferredValue(value, initialValue)`**: lần render đầu dùng `initialValue` rồi mới chuyển sang `value` ở nền — hữu ích khi render đầu nặng.
- **Server Components & Server Functions** chính thức ổn định — xem file 06 và 07.

---

## Best Practices tổng hợp

1. ✅ **Dữ liệu ban đầu: lấy ở Server Component.** `use` dùng để *stream* Promise từ server xuống client, không phải để fetch trong client.
2. ✅ **Code mới không dùng `forwardRef` và `<Context.Provider>`.**
3. ✅ **Gắn logic DOM vào ref callback có cleanup** thay vì cặp `useRef` + `useEffect` khi logic chỉ phụ thuộc node.
4. ✅ **SEO đi qua Metadata API của Next**, không qua `<title>` trong component.
5. ✅ **React Compiler là quyết định có đo đạc**, không phải mặc định.

---

**Trước:** [03 — Actions & Form](./03-react19-actions-and-forms.md) · **Tiếp theo:** [05 — React 19.2: Activity, useEffectEvent](./05-react19-2-activity-effect-event.md)
