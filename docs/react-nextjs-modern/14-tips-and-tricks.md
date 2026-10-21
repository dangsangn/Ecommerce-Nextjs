# 14 — Tips & Tricks: những mẹo ít được dạy nhưng dùng hằng ngày

> Mỗi mẹo đều có: **vấn đề → cách làm → vì sao nó hoạt động**. Hiểu "vì sao" để biết khi nào **không** nên dùng.
> Các mẹo được nhóm theo chủ đề; số trong ngoặc trỏ tới file giải thích nền tảng.

---

## A. Form & Actions

### 1. Một form, nhiều nút, nhiều action — `formAction` trên `<button>`

**Vấn đề:** form sản phẩm cần cả "Lưu nháp" và "Xuất bản".

```tsx
<form action={saveDraftAction}>
  <input name="name" />
  <button type="submit">Lưu nháp</button>
  <button type="submit" formAction={publishAction}>Xuất bản</button> {/* ghi đè action của form */}
</form>
```

**Biến thể nhẹ hơn:** một action, phân biệt bằng `name`/`value` của nút — nút được bấm có trong `FormData`:

```tsx
<button name="intent" value="draft">Lưu nháp</button>
<button name="intent" value="publish">Xuất bản</button>
// trong action: formData.get('intent') === 'publish'
```

**Vì sao hoạt động:** đây là hành vi gốc của HTML (`formaction`, nút submit được gửi kèm). React 19 chỉ cho phép giá trị là hàm. Chạy được cả khi chưa có JS.

### 2. Truyền tham số cho Server Action bằng `.bind` thay vì hidden input

```tsx
// Thay vì <input type="hidden" name="id" value={id} />
const deleteThis = deleteProductAction.bind(null, id)
<form action={deleteThis}><button>Xoá</button></form>

// action nhận: (id: string, formData: FormData)
// với useActionState: useActionState(updateAction.bind(null, id), initial) → (id, prevState, formData)
```

**Vì sao tốt:** giữ kiểu (`id: string` chứ không phải `FormDataEntryValue`), vẫn chạy khi chưa có JS.
⚠️ **Không phải cơ chế bảo mật:** giá trị bind vẫn đi qua client và người dùng sửa được. Vẫn phải kiểm quyền trong action (file 12).

### 3. `useFormStatus().data` — hiện chính xác cái đang được gửi

```tsx
function AddingLabel() {
  const { pending, data } = useFormStatus()
  if (!pending) return null
  return <p>Đang thêm {data?.get('skuLabel') ?? 'sản phẩm'} vào giỏ…</p>
}
```

Hữu ích khi một danh sách có nhiều form giống nhau và bạn muốn phản hồi cụ thể.

### 4. Reset form thủ công với `requestFormReset`

React tự reset form sau `<form action>` (file 03). Khi bạn dùng `onSubmit` + `startTransition` (để chặn reset khi lỗi), có thể reset **có điều kiện**:

```tsx
import { requestFormReset } from 'react-dom'

<form onSubmit={(e) => {
  e.preventDefault()
  const form = e.currentTarget
  startTransition(async () => {
    const res = await createCommentAction(initialActionState, new FormData(form))
    if (res.ok) requestFormReset(form) // chỉ reset khi thành công
  })
}}>
```

`requestFormReset` phải được gọi **trong transition** — React reset sau khi commit, nên không có khoảnh khắc form trống trước khi UI cập nhật.

### 5. Reset toàn bộ state của component bằng `key`

**Vấn đề:** [ProductPurchase](../../components/store/product-purchase.tsx) khởi tạo `selection` (biến thể đang chọn) từ props **một lần** bằng `useState(() => …)`. Nếu component được render lại ở **cùng vị trí** với một sản phẩm khác, React **tái dùng** nó → lựa chọn của sản phẩm cũ còn sót.

```tsx
<ProductPurchase key={spu._id} spu={spu} skus={skus} />
```

**Vì sao:** `key` khác → React coi là component khác → unmount cũ, mount mới. Không cần `useEffect` đồng bộ props vào state (một anti-pattern kinh điển).

**Khi nào thật sự cần?** Next **đã tự remount** page khi đoạn động đổi (`/products/A` → `/products/B`), nên trang chi tiết hiện tại không bị lỗi này. Bạn cần `key` khi: chỉ `searchParams` đổi (`?sku=1` → `?sku=2` — page **không** remount), component nằm trong **layout** (layout không remount khi đổi trang con), hoặc panel client hiển thị "mục đang chọn" từ một danh sách.

### 6. Discriminated union cho state của action

```ts
type ActionResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }

if (state.ok) state.data   // ✅ TypeScript biết data tồn tại
else state.message         // ✅ và message chắc chắn là string
```

Repo có `ActionState` với `ok` và `message?` tuỳ chọn, cộng `PrepareState` có `data?`. Union giúp TypeScript bắt lỗi "đọc `data` khi thất bại" thay vì phải `?.` khắp nơi.

---

## B. Điều hướng & URL state

### 7. `startTransition` + `router.push` = pending state cho bộ lọc

**Vấn đề:** bộ lọc đưa vào URL (file 09) → mỗi lần đổi là một lần server render. Trong lúc chờ, người dùng không có phản hồi gì.

```tsx
'use client'
const router = useRouter()
const [isPending, startTransition] = useTransition()

function setCategory(cat: string) {
  startTransition(() => {
    router.push(`/?category=${cat}`, { scroll: false })
  })
}

return <div className={isPending ? 'opacity-60 transition-opacity' : ''}>{/* lưới sản phẩm */}</div>
```

**Vì sao:** điều hướng của Next chạy trong transition; bọc thêm `startTransition` của bạn cho phép bạn "nhìn thấy" transition đó qua `isPending`. `scroll: false` giữ vị trí cuộn khi chỉ đổi bộ lọc.

### 8. `<Suspense key={...}>` — hiện lại skeleton khi tham số đổi

```tsx
export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  return (
    <Suspense key={q} fallback={<GridSkeleton />}>
      <ProductGrid q={q} />
    </Suspense>
  )
}
```

**Vì sao:** mặc định, khi điều hướng (transition) React **giữ UI cũ** thay vì hiện lại fallback (file 02). Thêm `key` buộc React coi đây là boundary mới → hiện skeleton cho mỗi từ khoá mới.
**Chọn cái nào?** Mẹo 7 (giữ kết quả cũ, làm mờ) khi kết quả gần giống nhau; mẹo 8 (skeleton) khi kết quả hoàn toàn khác.

### 9. Flash message sau redirect

Repo dùng `?welcome=1` rồi `router.replace` để gỡ ([welcome-toast.tsx](../../components/seller/welcome-toast.tsx)) và `?reset=1` ở trang login. Cách này đơn giản và đúng. Khi số loại thông báo tăng lên, thay bằng **cookie sống ngắn**:

```ts
// trong action
(await cookies()).set('flash', 'Đã tạo sản phẩm', { maxAge: 10, path: '/' })
redirect('/seller/products')
```

Một Client Component đọc cookie `flash`, hiện toast và xoá cookie đó. URL sạch, không cần nhớ mỗi trang dùng tham số nào.

### 10. `typedRoutes` — link sai đường dẫn thành lỗi TypeScript

```ts
// next.config.ts
typedRoutes: true
```

`<Link href="/sellr/products">` → lỗi lúc `tsc`. Với ~20 route và nhiều link chéo trong repo, đây là lưới an toàn rẻ khi đổi tên route.

---

## C. Dữ liệu & hiệu năng

### 11. Preload pattern — bắt đầu fetch sớm, `await` muộn

```ts
// lib/products/get-product.ts
export const getProduct = cache(async (id: string) => apiFetch(`/product/${id}`))
export const preloadProduct = (id: string) => { void getProduct(id) }
```

```tsx
export default async function Page({ params }: Props) {
  const { id } = await params
  preloadProduct(id)                      // request bắt đầu NGAY
  const user = await getCurrentUser()     // làm việc khác trong lúc chờ
  const product = await getProduct(id)    // cache() trả về đúng Promise đã chạy
}
```

**Vì sao:** `cache()` (file 12) memo **Promise**, không phải kết quả — nên lần gọi đầu khởi động request, lần sau "nhận lại" request đang chạy. Một cách xoá waterfall mà không phải gom mọi thứ vào `Promise.all`.

### 12. Hook "đã ở client chưa?" không gây hydration mismatch

```ts
import { useSyncExternalStore } from 'react'

const noop = () => () => {}
export function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false)
}
```

Server và lần hydrate đầu đều nhận `false` (khớp nhau), sau đó chuyển `true`. Thay cho pattern `useState(false)` + `useEffect(() => setMounted(true))` — gọn hơn, không cần render thừa do effect.

Dùng cho: hiện giờ theo múi giờ người dùng, giá trị từ `localStorage`.
Với **một** dòng chữ chắc chắn khác nhau (timestamp), `suppressHydrationWarning` trên đúng phần tử đó là đủ.

### 13. `import 'client-only'` — chiều ngược lại của `server-only`

Module chạm `window`/`localStorage`/`navigator` (ví dụ helper gọi `navigator.credentials` khi làm passkey theo [passkey-webauthn-guide.md](../passkey-webauthn-guide.md)) → đánh dấu `import 'client-only'`. Lỡ import vào Server Component → lỗi lúc build thay vì `window is not defined` lúc runtime.

### 14. Đừng `await` thứ không cần cho phần đầu trang

```tsx
// Server Component
const reviewsPromise = getReviews(id)            // không await
return (
  <>
    <ProductInfo product={await getProduct(id)} />
    <Suspense fallback={<ReviewsSkeleton />}>
      <Reviews promise={reviewsPromise} />        {/* Client Component dùng use() */}
    </Suspense>
  </>
)
```

Nguyên tắc chung: **mỗi `await` ở cấp page là một lần bắt người dùng chờ.** Hỏi lại với từng `await`: "phần đầu trang có thật sự cần cái này không?"

---

## D. Debug

### 15. Xem mọi request server trong terminal

```ts
// next.config.ts
logging: {
  fetches: { fullUrl: true },     // in URL đầy đủ của mỗi fetch phía server, kèm cache HIT/MISS
  browserToTerminal: true,        // đẩy console.log của trình duyệt về terminal
}
```

Server Action được log mặc định ở dev (tên, tham số, thời gian chạy). Kết hợp với mẹo trên: bạn thấy ngay `/cart` bị gọi 2 lần trong một request (file 12).

### 16. Hydration error: kiểm tra theo thứ tự

1. **Extension trình duyệt** (Grammarly, dịch trang, ví crypto) chèn thuộc tính vào DOM → thử cửa sổ ẩn danh trước tiên.
2. `Date`, `Math.random()`, `toLocaleString()` trong render → mẹo 12.
3. HTML lồng sai: `<div>` trong `<p>`, `<a>` trong `<a>`, `<form>` trong `<form>`.
4. `typeof window !== 'undefined'` rẽ nhánh trong render.

React 19 hiện **diff** server/client trong thông báo lỗi — đọc diff trước khi đoán.

### 17. Kiểm tra tại sao client JS "không làm gì"

Mở bằng `localhost`, không phải `127.0.0.1` hay IP LAN — Next chặn tài nguyên dev cho host lạ, trang có HTML nhưng không hydrate. Repo đã thêm `allowedDevOrigins: ['127.0.0.1']` trong [next.config.ts](../../next.config.ts) vì đúng lý do này; IP LAN khác vẫn cần thêm vào.

### 18. Performance panel của Chrome — xem concurrent rendering tận mắt

React 19.2 thêm track **Scheduler** và **Components** vào tab Performance (file 05). Ghi lại một lần gõ vào ô tìm kiếm: bạn sẽ thấy cập nhật input ở làn "Blocking" và render danh sách ở làn "Transition". Cách nhanh nhất để kiểm chứng `useTransition`/`useDeferredValue` có thật sự hoạt động.

---

## E. Mẹo về tư duy

### 19. "Có cần `useEffect` không?" — 4 câu hỏi

| Bạn đang dùng effect để… | Thay bằng |
| --- | --- |
| Lấy dữ liệu | Server Component / `use()` |
| Tính giá trị từ props/state | Tính thẳng trong render (thêm `useMemo` nếu đo thấy chậm) |
| Reset state khi prop đổi | `key` (mẹo 5) |
| Phản ứng với hành động người dùng | Event handler / Action |

Chỉ còn lại: **đồng bộ với hệ thống bên ngoài** (DOM API, socket, thư viện không phải React, toast sau khi state đổi). Đó mới là việc của effect.

### 20. Đặt state ở đâu? — thang ưu tiên

```
 URL (searchParams)      ← chia sẻ được, sống qua F5, server đọc được
   ↓ nếu không phù hợp
 Server (DB qua action)  ← bền vững, mọi thiết bị
   ↓
 Cookie                  ← server đọc được, theo trình duyệt (theme, ngôn ngữ)
   ↓
 useState gần nơi dùng   ← tạm thời, theo component
   ↓
 Context / store toàn cục ← chỉ khi nhiều nhánh xa nhau cùng cần và cập nhật thường xuyên
```

Phần lớn "cần Redux" trong app App Router hoá ra là "cần đưa vào URL" hoặc "cần lấy ở Server Component".

---

**Trước:** [13 — Hiệu năng & Kiểm thử](./13-performance-and-testing.md) · **Về đầu:** [README](./README.md)
