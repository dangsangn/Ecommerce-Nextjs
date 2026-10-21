# 08 — Rendering & Caching trong Next.js: Streaming, Suspense, Cache Components

> Câu hỏi file này trả lời: *"Trang của tôi được render khi nào, ở đâu, và dữ liệu được giữ lại bao lâu?"*
> Đây là phần **thay đổi nhiều nhất** qua các bản Next 13 → 14 → 15 → 16. Nếu đọc bài viết cũ trên mạng, hãy kiểm tra phiên bản — rất nhiều lời khuyên về cache của Next 13/14 **đã sai** với Next 16.

---

## 1. Overview — Tổng quan

### Ba câu hỏi, ba cơ chế

| Câu hỏi | Cơ chế | File / API |
| --- | --- | --- |
| Phần chậm có làm cả trang chờ không? | **Streaming + Suspense** | `loading.tsx`, `<Suspense>` |
| Có thể dựng sẵn HTML lúc build không? | **Prerendering** (static vs dynamic) | Tự động dựa trên API bạn dùng |
| Có thể tái sử dụng kết quả giữa các request không? | **Caching** | `'use cache'`, `cacheLife`, `cacheTag` (Next 16) |

### Lịch sử ngắn — để hiểu vì sao lại thế này

```
 Next 13/14  "Cache mọi thứ mặc định"  → fetch tự cache, người dùng bối rối vì thấy dữ liệu cũ
 Next 15     "Không cache mặc định"    → fetch mặc định no-store, phải chủ động bật cache
 Next 16     "Cache có chủ đích"       → Cache Components: mặc định động, đánh dấu
                                          'use cache' ở đúng chỗ muốn cache
```

Bài học đằng sau: **cache ngầm định gây bug khó thấy.** Next 16 chọn để bạn **nói rõ** cái gì được cache.

---

## 2. Streaming & Suspense

### 🧠 Mô hình tư duy: nhà hàng phục vụ từng món

> Thay vì đợi nấu xong cả mâm mới bưng ra (SSR cổ điển), bếp bưng **khung bàn + món nhanh** ra trước, món lâu (bình luận, gợi ý sản phẩm) bưng ra sau khi xong. Khách bắt đầu ăn sớm hơn nhiều.

```
 t=0ms    ┌──────────────────────────┐
          │ Header, ảnh, giá  ✅      │   ← gửi ngay
          │ [skeleton bình luận] ⏳   │   ← fallback của <Suspense>
          └──────────────────────────┘
 t=800ms  ┌──────────────────────────┐
          │ Header, ảnh, giá  ✅      │
          │ 12 bình luận      ✅      │   ← stream tới, thay chỗ skeleton
          └──────────────────────────┘
```

### Hai cách khai báo

**`loading.tsx` — cấp route:**

```tsx
// app/(store)/orders/loading.tsx
export default function Loading() {
  return <OrdersSkeleton />
}
```

Next tự bọc `page.tsx` của route đó trong `<Suspense fallback={<Loading />}>`. Lợi ích phụ quan trọng: điều hướng tới route này **phản hồi tức thì** (hiện skeleton ngay khi click), vì skeleton có thể prefetch sẵn.

> Repo hiện **chưa có file `loading.tsx` nào**. Các trang như `/orders`, `/cart`, `/seller/products` đều gọi API trước khi có gì để hiện → khi backend chậm, click vào link sẽ có cảm giác "không ăn". Thêm `loading.tsx` là cải thiện rẻ nhất có thể làm.

**`<Suspense>` — cấp component, chi tiết hơn:**

```tsx
// app/(store)/products/[id]/page.tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getProduct(id)        // phần chính: chờ
  return (
    <>
      <ProductPurchase detail={detail} />
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments productId={id} />          {/* Server Component async: tự fetch, stream sau */}
      </Suspense>
    </>
  )
}

async function Comments({ productId }: { productId: string }) {
  const comments = await apiFetch<Comment[]>(`/comment?productId=${productId}`)
  return <CommentList comments={comments} />
}
```

### ⚠️ Cạm bẫy: waterfall tuần tự

```tsx
// ❌ Tuần tự: tổng thời gian = A + B
const product = await getProduct(id)
const comments = await getComments(id)

// ✅ Song song khi cả hai đều cần trước khi render: tổng = max(A, B)
const [product, comments] = await Promise.all([getProduct(id), getComments(id)])

// ✅✅ Tốt nhất khi B không cần cho phần đầu: stream B qua Suspense (như ví dụ trên)
```

[products/[id]/page.tsx](<../../app/(store)/products/[id]/page.tsx>) hiện `await` sản phẩm rồi mới `await` bình luận — ví dụ thực tế của waterfall có thể cải thiện.

### When NOT to use Suspense

- ❌ **Bọc mọi thứ trong Suspense riêng** → "bỏng ngô": hàng chục skeleton nhảy ra không theo thứ tự, layout giật. Gom theo **khu vực có nghĩa** với người dùng.
- ❌ **Phần nội dung chính / quan trọng cho SEO** (tên, giá sản phẩm) → nên có trong HTML đầu tiên, không ở sau fallback.

---

## 3. Static vs Dynamic rendering (khi chưa bật Cache Components)

Đây là chế độ **repo đang chạy**.

Next quyết định từng route là **static** (render lúc build, phục vụ HTML có sẵn) hay **dynamic** (render mỗi request) dựa trên việc bạn có dùng **API phụ thuộc request** không:

| Dùng những thứ này → route thành **dynamic** |
| --- |
| `cookies()`, `headers()`, `draftMode()` |
| `searchParams` của page |
| `fetch(..., { cache: 'no-store' })` |
| `connection()` — tuyên bố tường minh "cần request thật" |

Trong repo: [lib/api/server-client.ts](../../lib/api/server-client.ts) — `apiFetch` mặc định `cache: 'no-store'` **và** luôn gọi `headers()` (để lấy IP client). Header cửa hàng ([store-header.tsx](../../components/store/store-header.tsx)) đọc cookie. Kết quả: **gần như mọi trang đều dynamic**. Đây là lựa chọn **an toàn và đúng** cho một app có đăng nhập, giỏ hàng cá nhân — đổi lại mỗi request đều đi tới backend.

---

## 4. Cache Components (Next 16): `'use cache'`, `cacheLife`, `cacheTag`

### Là gì?

Bật bằng một cờ:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
}
```

Khi bật, mô hình đổi thành:

1. **Mọi thứ mặc định là động** (chạy mỗi request).
2. Bạn đánh dấu `'use cache'` cho **hàm, component, hoặc cả file** muốn cache.
3. Next **prerender một "vỏ tĩnh" (static shell)** gồm mọi thứ không phụ thuộc request + nội dung được cache; phần động **stream** vào các "lỗ" `<Suspense>`. Đây chính là **Partial Prerendering (PPR)** — trong Next 16 PPR không còn là cờ riêng, nó là hành vi mặc định của Cache Components.

```
 ┌────────────────── HTML gửi ngay từ CDN (static shell) ───────────────────┐
 │  Layout, menu danh mục, footer                    (tĩnh)                   │
 │  Danh sách sản phẩm nổi bật                       ('use cache', 1 giờ)     │
 │  ┌──── <Suspense> ─────────────────┐                                     │
 │  │ Giỏ hàng của BẠN (đọc cookie)  │  ← lỗ động: stream sau mỗi request   │
 │  └────────────────────────────────┘                                     │
 └──────────────────────────────────────────────────────────────────────────┘
```

### Cú pháp

```ts
import { cacheLife, cacheTag } from 'next/cache'

// Cấp hàm
export async function getFeaturedProducts() {
  'use cache'
  cacheLife('hours')             // hồ sơ thời gian sống
  cacheTag('products')           // nhãn để vô hiệu hoá có chủ đích
  return publicFetch<Product[]>('/product/featured')
}

// Cấp component
export async function CategoryMenu() {
  'use cache'
  cacheLife('days')
  const categories = await publicFetch<Category[]>('/category')
  return <nav>{/* ... */}</nav>
}
```

**Khoá cache** = build ID + vị trí hàm + **các tham số** (và biến closure). `getProduct('123')` và `getProduct('456')` là hai mục cache riêng.

### `cacheLife` — hồ sơ có sẵn

| Hồ sơ | Dùng cho | `stale` (client) | `revalidate` (server làm mới nền) | `expire` |
| --- | --- | --- | --- | --- |
| `seconds` | Gần thời gian thực | 30 giây | 1 giây | 1 phút |
| `minutes` | Cập nhật thường xuyên | 5 phút | 1 phút | 1 giờ |
| `hours` | Vài lần/ngày | 5 phút | 1 giờ | 1 ngày |
| `days` | Hằng ngày | 5 phút | 1 ngày | 1 tuần |
| `weeks` | Hằng tuần | 5 phút | 1 tuần | 30 ngày |
| `max` | Hầu như không đổi | 5 phút | 30 ngày | 1 năm |
| `default` (khi không gọi) | | 5 phút | 15 phút | không bao giờ |

✅ Luôn gọi `cacheLife` tường minh — người đọc code biết ngay dữ liệu cũ tối đa bao lâu.

### `cacheTag` + `updateTag` / `revalidateTag` — vô hiệu hoá có chủ đích

```ts
// Đọc
async function getProduct(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('products', `product-${id}`)
  return publicFetch(`/product/${id}`)
}

// Ghi (Server Action của seller)
'use server'
export async function updateProductAction(_prev: ActionState, formData: FormData) {
  const id = String(formData.get('id'))
  await apiFetch(`/product/${id}`, { method: 'PATCH', auth: true, body: /* ... */ })
  updateTag(`product-${id}`)  // seller thấy ngay thay đổi của mình
  updateTag('products')       // danh sách cũng làm mới
  return { ok: true, message: 'Saved' }
}
```

Xem file 07 để chọn giữa `updateTag`, `revalidateTag(tag, 'max')`, `revalidatePath`, `refresh`.

### ⚠️ Quy tắc vàng: không đọc dữ liệu theo request bên trong `'use cache'`

```ts
// ❌ Lỗi: cookies() trong phạm vi cache — kết quả của user A sẽ bị phục vụ cho user B
async function getCart() {
  'use cache'
  const store = await cookies()
  // ...
}

// ✅ Đọc runtime data BÊN NGOÀI, truyền vào như tham số → tham số thành một phần khoá cache
async function CartBadge() {
  const userId = await getClientId()          // ngoài cache
  return <CachedCartCount userId={userId} />
}
async function CachedCartCount({ userId }: { userId: string }) {
  'use cache'
  cacheTag(`cart-${userId}`)
  // ...
}
```

Các biến thể khi thật sự cần:
- `'use cache: private'` — được đọc `cookies()`/`headers()`, nhưng kết quả **chỉ cache trong bộ nhớ trình duyệt**, không lưu trên server.
- `'use cache: remote'` — cache ở handler từ xa (Redis…) do nền tảng cung cấp, dùng khi cache in-memory không đủ.

### Một hệ quả quan trọng khi bật `cacheComponents`

Mọi truy cập dữ liệu **không cache và phụ thuộc request** phải nằm **trong `<Suspense>`** (hoặc có `loading.tsx`), nếu không Next báo lỗi lúc build/dev — vì nó không biết vẽ vỏ tĩnh thế nào. Đây là cố ý: buộc bạn quyết định rõ ràng phần nào là vỏ, phần nào là lỗ.

Và router sẽ giữ trang cũ ở trạng thái `<Activity mode="hidden">` khi điều hướng (file 05) — state của form được giữ khi bấm Back.

---

## 5. Áp dụng cho repo này? — Phân tích

| Dữ liệu | Cache được? | Vì sao |
| --- | --- | --- |
| Danh mục, sản phẩm nổi bật, chi tiết sản phẩm công khai | ✅ Ứng viên tốt | Giống nhau cho mọi người, đổi ít |
| Bình luận sản phẩm | 🤔 Có, với `cacheLife('minutes')` + `updateTag` khi đăng bình luận | Công khai, nhưng người đăng muốn thấy ngay |
| Giỏ hàng, đơn hàng, thông tin tài khoản | ❌ Không (hoặc `private`) | Theo từng người dùng |
| Trang seller | ❌ Không | Theo shop, cần chính xác |

**Rào cản hiện tại:** `apiFetch` luôn gọi `headers()` để chuyển IP client cho backend (rate-limit). Gọi nó trong `'use cache'` sẽ lỗi. Muốn áp dụng phải tách một hàm `publicFetch` cho endpoint công khai **không đọc headers/cookies** — và chấp nhận backend không thấy IP thật cho các request đó (rate-limit tính theo IP server Next).

**Khuyến nghị:** chưa cần bật ngay. Làm trước theo thứ tự lợi ích/chi phí:
1. Thêm `loading.tsx` cho các route chính.
2. Bỏ waterfall (Suspense cho bình luận).
3. Khi lượng truy cập trang sản phẩm thực sự gây tải cho backend → bật `cacheComponents`, tách `publicFetch`, cache sản phẩm với `cacheTag`.

---

## 6. Trade-offs

| Benefits | Costs |
| --- | --- |
| **Streaming**: trang hiện sớm, phần chậm không chặn phần nhanh | Layout shift nếu skeleton không khớp kích thước thật |
| **`loading.tsx`**: điều hướng phản hồi tức thì | Thêm file cần bảo trì cho mỗi route |
| **`'use cache'`**: giảm tải backend, phản hồi nhanh như trang tĩnh | **Dữ liệu cũ** là rủi ro có thật — phải thiết kế vô hiệu hoá (tag) ngay từ đầu |
| **PPR**: vỏ tĩnh từ CDN + lỗ động | Bắt buộc tư duy rõ phần nào tĩnh/động; lỗi build nếu truy cập động ngoài Suspense |
| **Cache có chủ đích**: dễ đọc, dễ audit | Rò rỉ dữ liệu giữa người dùng nếu đọc cookie trong scope cache |

**Tại sao những chi phí này tồn tại?** Cache luôn là đánh đổi giữa **tốc độ** và **độ tươi/độ đúng**. Next 16 không xoá được đánh đổi đó — nó chỉ buộc bạn **viết nó ra** trong code (`cacheLife`, `cacheTag`) thay vì để nó ẩn trong hành vi mặc định.

## 7. Best Practices

1. ✅ **Mỗi route có dữ liệu chậm nên có `loading.tsx`.** Rẻ, hiệu quả, không rủi ro.
2. ✅ **Bắt đầu request sớm, `await` muộn.** Dùng `Promise.all` hoặc stream qua Suspense.
3. ✅ **Suspense theo khu vực có ý nghĩa**, không theo từng component.
4. ✅ **Khi cache: tag ngay từ đầu.** Mọi `'use cache'` dữ liệu có thể thay đổi đều phải có `cacheTag` và một action gọi `updateTag` tương ứng.
5. ✅ **Không bao giờ đọc cookie/header trong `'use cache'`** — đọc ngoài, truyền vào.
6. ✅ **Kiểm tra phiên bản khi đọc tài liệu về cache.** Docs chính xác cho repo này nằm ngay trong `node_modules/next/dist/docs/`.

---

**Trước:** [07 — Server Actions](./07-nextjs-server-actions-and-mutations.md) · **Tiếp theo:** [09 — Hook & Routing của Next.js](./09-nextjs-client-hooks-and-routing.md)
