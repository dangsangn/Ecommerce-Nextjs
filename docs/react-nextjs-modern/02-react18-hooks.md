# 02 — Các hook của React 18

> Năm hook mới của React 18, sắp xếp theo mức độ bạn sẽ gặp trong code ứng dụng:
>
> | Hook | Dành cho | Tần suất trong app |
> | --- | --- | --- |
> | `useTransition` / `startTransition` | Đánh dấu cập nhật "không gấp" | Thường xuyên |
> | `useDeferredValue` | Hiển thị phiên bản "trễ" của một giá trị | Thỉnh thoảng |
> | `useId` | Sinh id ổn định giữa server và client | Thỉnh thoảng (form, a11y) |
> | `useSyncExternalStore` | Đọc dữ liệu từ store bên ngoài React | Hiếm (chủ yếu thư viện) |
> | `useInsertionEffect` | Chèn CSS trước khi layout | Gần như không (chỉ thư viện CSS-in-JS) |
>
> Đọc [01 — Concurrent Rendering](./01-concurrent-rendering.md) trước nếu bạn chưa nắm khái niệm "hai làn đường".

---

## 1. `useTransition` & `startTransition`

### Là gì?

Cách bạn nói với React: *"cập nhật này không gấp — nếu có việc gấp hơn, cứ làm việc đó trước, và đừng giấu UI hiện tại bằng spinner."*

```tsx
const [isPending, startTransition] = useTransition()
```

- `startTransition(fn)`: mọi `setState` bên trong `fn` được đưa vào **làn không gấp**.
- `isPending`: `true` trong khi transition đang chạy — để bạn hiện chỉ báo nhẹ (làm mờ, spinner nhỏ).

Ngoài ra có hàm `startTransition` **độc lập** (import từ `react`) — dùng khi bạn ở ngoài component (thư viện router, store) và không cần `isPending`.

### Tại sao tồn tại?

Hai vấn đề mà trước đây phải tự xử lý bằng debounce/throttle hoặc chấp nhận:

1. **Render nặng chặn tương tác** — React 18 cho phép ngắt render của transition.
2. **Spinner nhấp nháy khi chuyển màn hình** — Khi transition gây ra Suspense, React **giữ nguyên UI cũ** thay vì nhảy về fallback. Đây là lý do chuyển trang trong Next.js không làm trắng màn hình: navigation của Next bọc trong transition.

### 🧠 Mô hình tư duy

> Transition giống như **"bản nháp chạy nền"**. React soạn màn hình mới ở hậu trường. Người dùng vẫn thấy và tương tác với màn hình cũ. Khi bản nháp xong, React đổi một phát. Nếu người dùng đổi ý giữa chừng, bản nháp cũ bị vứt.

### Ví dụ cơ bản: chuyển tab nặng

```tsx
'use client'
import { useState, useTransition } from 'react'

export function ProductTabs() {
  const [tab, setTab] = useState<'info' | 'reviews' | 'specs'>('info')
  const [isPending, startTransition] = useTransition()

  function selectTab(next: typeof tab) {
    startTransition(() => {
      setTab(next) // render tab mới ở "làn không gấp"
    })
  }

  return (
    <>
      <nav className={isPending ? 'opacity-60' : ''}>
        <button onClick={() => selectTab('info')}>Thông tin</button>
        <button onClick={() => selectTab('reviews')}>Đánh giá (render 2000 dòng)</button>
        <button onClick={() => selectTab('specs')}>Thông số</button>
      </nav>
      {tab === 'info' && <InfoTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'specs' && <SpecsTab />}
    </>
  )
}
```

Không có transition: bấm "Đánh giá" → UI đơ cho tới khi 2000 dòng render xong; bấm "Thông số" trong lúc đó không có tác dụng.
Có transition: bấm "Đánh giá" → nav mờ đi, bấm "Thông số" ngay lập tức → React bỏ bản nháp "Đánh giá" và chuyển sang "Thông số".

### Ví dụ thực tế trong repo: transition bất đồng bộ (React 19)

Từ React 19, hàm truyền vào `startTransition` **có thể là `async`**. `isPending` giữ `true` cho tới khi Promise hoàn tất. Đây chính là thứ React gọi là **Action** (file 03).

Repo dùng điều này để upload ảnh mà không cần `useState` cho loading — [components/products/image-manager.tsx](../../components/products/image-manager.tsx):

```tsx
const [uploading, startUpload] = useTransition()

const upload = (files: FileList | null) => {
  if (!files?.length) return
  const body = new FormData()
  for (const file of files) body.append('images', file)
  if (draftId) body.append('draftId', draftId)

  startUpload(async () => {
    const result = await prepareImagesAction({ ok: false }, body) // Server Action
    if (result.ok && result.data) onUploaded(result.data)
    else toast.error(result.message ?? 'Could not upload images')
  })
}

// ...
<Button disabled={uploading}>{uploading ? 'Uploading…' : 'Upload images'}</Button>
```

**Tại sao không dùng `useActionState` ở đây?** Vì input file không nằm trong một `<form>` riêng — upload xảy ra ngay khi chọn file, giữa chừng một form lớn hơn. `useTransition` là công cụ "Action không cần form".

### ⚠️ Cạm bẫy: `setState` sau `await`

```tsx
startTransition(async () => {
  const data = await fetchSomething()
  // ⚠️ Ở React 19.x, setState SAU await không còn tự động thuộc transition
  startTransition(() => {
    setResult(data) // ✅ bọc lại nếu bạn muốn nó vẫn là cập nhật không gấp
  })
})
```

Đây là giới hạn đã biết (React chưa thể theo dõi "ngữ cảnh async" qua `await`). Với cập nhật nhỏ như toast/callback như ví dụ repo thì không sao; với cập nhật có thể gây Suspense thì nên bọc lại.

### When NOT to use

- ❌ **Không bọc cập nhật của controlled input.** `startTransition(() => setQuery(e.target.value))` làm ô input lag. Input phải là cập nhật khẩn cấp; thứ được *suy ra* từ input mới nên là transition (hoặc dùng `useDeferredValue`).
- ❌ **Không dùng thay cho debounce khi gọi API.** Transition không giảm số request; nó chỉ ưu tiên render. Muốn bớt request vẫn cần debounce.
- ❌ **Không dùng khi render đã nhanh.** Thêm transition chỉ thêm độ phức tạp.

---

## 2. `useDeferredValue`

### Là gì?

```tsx
const deferredQuery = useDeferredValue(query)
// React 19: có thể cho giá trị khởi tạo
const deferredQuery = useDeferredValue(query, '')
```

Trả về một **bản sao "trễ"** của giá trị. Khi `query` đổi, React render 2 lần:
1. Lần khẩn cấp: `query` mới, `deferredQuery` **vẫn là giá trị cũ** → phần dùng `deferredQuery` không phải render lại (nếu được `memo`).
2. Lần nền (có thể bị ngắt): `deferredQuery` bắt kịp `query`.

### Khác gì `useTransition`?

| | `useTransition` | `useDeferredValue` |
| --- | --- | --- |
| Bạn kiểm soát | **Lệnh `setState`** | **Giá trị** nhận được |
| Dùng khi | Bạn sở hữu chỗ gọi `setState` | Giá trị đến từ props / thư viện / bạn không sửa được chỗ set |
| Có `isPending`? | Có | Không — tự so sánh `value !== deferredValue` |

🧠 **Mẹo nhớ:** *transition bọc **hành động**, deferred bọc **dữ liệu**.*

### Ví dụ: tìm kiếm sản phẩm phía client

```tsx
'use client'
import { memo, useDeferredValue, useState } from 'react'

export function ProductSearch({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  return (
    <>
      {/* Input luôn mượt: nó dùng `query` (khẩn cấp) */}
      <input value={query} onChange={(e) => setQuery(e.target.value)} />

      {/* Danh sách dùng giá trị trễ; làm mờ khi đang bắt kịp */}
      <div style={{ opacity: isStale ? 0.5 : 1 }}>
        <FilteredList products={products} query={deferredQuery} />
      </div>
    </>
  )
}

// ⚠️ BẮT BUỘC memo — nếu không, FilteredList vẫn render lại ở lần khẩn cấp
const FilteredList = memo(function FilteredList({ products, query }: { products: Product[]; query: string }) {
  const items = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
  return <ul>{items.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
})
```

### Kết hợp với Suspense: "giữ kết quả cũ trong khi tải kết quả mới"

Nếu `<SearchResults query={deferredQuery} />` suspend khi tải dữ liệu, React sẽ **giữ kết quả cũ** thay vì hiện fallback. Người dùng thấy kết quả cũ mờ đi thay vì spinner nhấp nháy mỗi phím gõ.

### When NOT to use

- ❌ Quên `memo` cho component con → không có lợi ích gì.
- ❌ Dùng để giảm số request API → vẫn cần debounce (deferred không trì hoãn theo thời gian cố định, nó "trễ" theo khả năng render).
- ❌ Dữ liệu cần chính xác tuyệt đối tại mọi thời điểm (tổng tiền thanh toán).

---

## 3. `useId`

### Là gì?

```tsx
const id = useId() // ví dụ: ":r1:" hoặc "«r1»" — đừng phụ thuộc định dạng
```

Sinh một id **duy nhất** và **giống nhau giữa server và client**.

### Tại sao tồn tại?

Bạn cần id để nối `<label htmlFor>` với `<input id>`, hoặc `aria-describedby`. Các cách cũ đều hỏng khi SSR:

- `Math.random()` → server sinh "abc", client sinh "xyz" → **hydration mismatch**.
- Biến đếm toàn cục → thứ tự render server/client khác nhau → lệch id.

`useId` dựa trên **vị trí của component trong cây**, nên server và client luôn khớp.

### Ví dụ: field tái sử dụng

```tsx
'use client'
import { useId } from 'react'

export function PriceField({ label, hint }: { label: string; hint: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={`${id}-hint`} type="number" />
      <p id={`${id}-hint`}>{hint}</p>
    </div>
  )
}

// Dùng 2 lần trên một trang vẫn không đụng id
<PriceField label="Giá gốc" hint="VNĐ" />
<PriceField label="Giá khuyến mãi" hint="Nhỏ hơn giá gốc" />
```

> Trong repo, các form như [login-form.tsx](../../components/auth/login-form.tsx) dùng id cố định (`id="email"`). Điều đó **ổn** vì mỗi trang chỉ có một form đăng nhập. Chuyển sang `useId` khi component được render **nhiều lần trên cùng trang** (ví dụ mỗi dòng SKU trong [sku-editor.tsx](../../components/products/sku-editor.tsx)).

### When NOT to use

- ❌ **Không dùng làm `key` cho list.** Key phải đến từ dữ liệu (`product.id`).
- ❌ **Không dùng làm selector CSS** — định dạng id có ký tự đặc biệt và có thể đổi giữa các phiên bản.
- ❌ Server Component **không cần** — nó không hydrate, dùng id tĩnh được.

---

## 4. `useSyncExternalStore`

### Là gì?

```tsx
const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)
```

Cách **chính thức và an toàn** để component đọc dữ liệu nằm **ngoài React**: store của Redux/Zustand, `navigator.onLine`, `window.matchMedia`, `localStorage`…

### Tại sao tồn tại? — Vấn đề "tearing"

Với concurrent rendering, React có thể render một nửa cây, tạm dừng, rồi render nửa còn lại. Nếu store bên ngoài **thay đổi giữa chừng**, nửa đầu thấy giá trị cũ, nửa sau thấy giá trị mới → UI "rách" (tearing): hai chỗ hiển thị số lượng giỏ hàng khác nhau trên cùng một màn hình.

Cách cũ `useState` + `useEffect(subscribe)` không chống được tearing. `useSyncExternalStore` buộc React render **đồng bộ** khi store đổi, đảm bảo mọi component thấy cùng một snapshot.

### Ví dụ: trạng thái online/offline

```tsx
'use client'
import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnline() {
  return useSyncExternalStore(
    subscribe,                 // ⚠️ định nghĩa NGOÀI component để không đổi mỗi render
    () => navigator.onLine,    // client snapshot
    () => true,                // server snapshot (không có navigator trên server)
  )
}

export function OfflineBanner() {
  const online = useOnline()
  return online ? null : <div role="alert">Bạn đang offline — giỏ hàng sẽ không được lưu.</div>
}
```

### ⚠️ Cạm bẫy

- `getSnapshot` **phải trả cùng một giá trị** nếu store không đổi. Trả về object mới mỗi lần (`() => ({ ...store })`) → vòng lặp render vô hạn.
- Thiếu `getServerSnapshot` khi dùng trong component được SSR → lỗi.

### When NOT to use

- ❌ State thuộc về React (`useState`, Context) — không cần.
- ❌ Bạn dùng Zustand/Redux/TanStack Query — thư viện đã dùng hook này bên trong, bạn chỉ cần dùng API của nó.

---

## 5. `useInsertionEffect`

Chạy **trước** mọi thay đổi DOM, dùng để chèn thẻ `<style>` động. Chỉ dành cho tác giả thư viện CSS-in-JS (styled-components, Emotion).

Repo dùng Tailwind (CSS tĩnh) nên **bạn sẽ không cần hook này**. Nếu thấy mình muốn dùng nó trong code ứng dụng, gần như chắc chắn là `useEffect` hoặc `useLayoutEffect` mới đúng.

---

## Trade-offs tổng hợp

| Hook | Benefits | Costs |
| --- | --- | --- |
| `useTransition` | UI không đơ, không flash spinner, có `isPending` miễn phí | Phải nhớ không bọc input; cạm bẫy `setState` sau `await` |
| `useDeferredValue` | Không cần sửa chỗ set state; tự thích ứng tốc độ máy | Bắt buộc `memo` con; render 2 lần |
| `useId` | Hết hydration mismatch cho id | Không dùng được làm key/selector |
| `useSyncExternalStore` | Chống tearing, hỗ trợ SSR | API thấp cấp, dễ gây loop nếu snapshot không ổn định |

## Best Practices

1. ✅ **Input khẩn cấp, kết quả không gấp.** Đây là quy tắc vàng khi nào dùng transition/deferred.
2. ✅ **Đo trước khi tối ưu.** Mở React DevTools Profiler; chỉ thêm transition khi thấy render thật sự chậm.
3. ✅ **Ưu tiên `useActionState` cho form, `useTransition` cho Action không có form** (xem file 03).
4. ✅ **`useId` cho mọi component form tái sử dụng** — chi phí bằng 0, tránh được bug a11y khi component bị nhân bản.

---

**Trước:** [01 — Concurrent Rendering](./01-concurrent-rendering.md) · **Tiếp theo:** [03 — Actions & Form trong React 19](./03-react19-actions-and-forms.md)
