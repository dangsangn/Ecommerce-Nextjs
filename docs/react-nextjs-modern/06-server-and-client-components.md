# 06 — Server Components & Client Components

> Mọi thứ trong file 07, 08, 09 đều xây trên khái niệm ở đây. Nếu bạn từng thắc mắc *"sao chỗ này dùng được `useState` còn chỗ kia thì không?"* hoặc *"sao không truyền function xuống được?"*, câu trả lời nằm ở file này.

---

## 1. Overview — Tổng quan

### Là gì?

**React Server Components (RSC)** là component **chỉ chạy trên server**. Output của chúng (một mô tả UI dạng đặc biệt gọi là *RSC payload*) được gửi xuống trình duyệt — **nhưng code JavaScript của chúng thì không**.

**Client Components** là component "truyền thống": render HTML trên server lần đầu (SSR), rồi **gửi JS xuống** để hydrate và chạy tương tác ở trình duyệt.

> ⚠️ Hiểu lầm phổ biến nhất: *"Client Component chỉ chạy ở client."* **Sai.** Client Component **cũng được render trên server** để ra HTML ban đầu. "Client" nghĩa là *"code của nó có được gửi xuống trình duyệt và chạy ở đó"*.

Trong Next.js App Router: **mọi component mặc định là Server Component**. Bạn chủ động "mở cổng" sang client bằng `'use client'`.

### Tại sao tồn tại?

Trước RSC, một trang React SSR vẫn phải gửi **toàn bộ** JS của mọi component xuống trình duyệt, kể cả những phần không bao giờ tương tác (footer, mô tả sản phẩm, bảng thông số). Và lấy dữ liệu nghĩa là: server render → client tải JS → client gọi API → render lại. Nhiều vòng, nhiều byte.

RSC đặt câu hỏi: *phần lớn UI chỉ là "dữ liệu → HTML", tại sao phải gửi code của nó?*

| | Server Component | Client Component |
| --- | --- | --- |
| Chạy ở | Chỉ server | Server (SSR) **và** trình duyệt |
| JS gửi xuống trình duyệt | **Không** | Có |
| `async/await` trực tiếp | ✅ | ❌ (dùng `use()` — file 04) |
| Đọc DB, secret, cookie, file | ✅ | ❌ |
| `useState`, `useEffect`, event handler | ❌ | ✅ |
| Context, browser API (`window`, `localStorage`) | ❌ | ✅ |

---

## 2. Mental Model — Mô hình tư duy

### 🧠 Một trang là "biển server với những hòn đảo client"

Lấy luôn header của repo — [components/store/store-header.tsx](../../components/store/store-header.tsx):

```
 StoreHeader  (Server — async, đọc cookie, gọi API giỏ hàng)
 ├─ <Link> logo                       (server)
 ├─ <SearchBox />  ◄── 'use client'   🏝 đảo: cần state khi gõ
 ├─ Giỏ hàng (cartCount)               (server — số lấy từ API, không cần JS)
 └─ <form action={logoutAction}>      (server — form + Server Action, không cần JS)
```

`StoreHeader` gọi `getAccessPayload()` và `apiFetch('/cart')` **trực tiếp**, không cần API route, không cần `useEffect`. Chỉ mỗi ô tìm kiếm cần tương tác → chỉ nó là Client Component → chỉ JS của nó được gửi xuống.

### 🧠 `'use client'` là **cánh cổng**, không phải nhãn

```tsx
'use client'                 // ← đánh dấu: file này VÀ MỌI THỨ NÓ IMPORT là code client
import { useState } from 'react'
import { formatPrice } from '@/lib/products/price' // ← cũng bị kéo vào bundle client
```

Một khi qua cổng, mọi thứ được import từ đó đều thành code client. Vì vậy:
- **Đặt `'use client'` càng sâu (càng gần lá) càng tốt.**
- Bạn **không cần** `'use client'` ở mọi file client — chỉ ở **điểm vào** từ phía server.

### 🧠 Hướng import chỉ đi một chiều — nhưng `children` thì đi xuyên qua

```
Server Component ──import──► Client Component    ✅
Client Component ──import──► Server Component    ❌ (nó sẽ bị biến thành client)
Client Component ◄──children/props── Server Component   ✅ (truyền qua JSX)
```

```tsx
// ✅ Pattern "lỗ hổng" (donut): Client Component bọc, nội dung server nằm bên trong
// app/(store)/products/[id]/page.tsx  (Server)
<Collapsible /* 'use client' — có state mở/đóng */>
  <ProductSpecs product={spu} /> {/* Server Component — vẫn render ở server */}
</Collapsible>
```

`Collapsible` chỉ nhận `children` đã được render sẵn ở server — nó không cần biết bên trong là gì.

---

## 3. How It Works — Điều gì xảy ra khi tải một trang

```
 Request /products/123
        │
        ▼
 ┌─────────────────────────── SERVER ────────────────────────────┐
 │ 1. Chạy Server Components (await params, apiFetch, cookies)   │
 │ 2. Gặp Client Component → không chạy logic, để "chỗ trống"    │
 │    kèm props đã serialize + tham chiếu tới file JS của nó     │
 │ 3. Sinh RSC payload                                            │
 │ 4. SSR: render cả Client Components ra HTML (lần đầu)         │
 └───────────────────────────────────────────────────────────────┘
        │ HTML (hiện ngay) + RSC payload + JS của các Client Component
        ▼
 ┌─────────────────────────── BROWSER ───────────────────────────┐
 │ 5. Hiện HTML                                                    │
 │ 6. Tải JS của Client Components → hydrate → tương tác được     │
 │ 7. Điều hướng sau đó: chỉ tải RSC payload mới, không tải HTML  │
 └───────────────────────────────────────────────────────────────┘
```

### Cái gì truyền được qua ranh giới server → client?

Props từ Server Component sang Client Component phải **serialize được**:

| ✅ Truyền được | ❌ Không truyền được |
| --- | --- |
| string, number, boolean, null, undefined | Function thường (`onClick={() => …}`) |
| Plain object, array | Class instance (`new Product()`), trừ Date/Map/Set… |
| `Date`, `Map`, `Set`, `BigInt`, typed array | Symbol tự tạo |
| JSX (Server Component đã render) | |
| **Promise** (để client `use()` — file 04) | |
| **Server Action** (`'use server'` function — file 07) | |

> Đây là lý do repo có hàm `normalizeProductDetail` ở server: dữ liệu từ API được chuẩn hoá thành plain object trước khi đưa vào `ProductPurchase` (Client Component).

---

## 4. Các directive và guard

| Directive / package | Ý nghĩa | Ví dụ trong repo |
| --- | --- | --- |
| `'use client'` | File này là điểm vào client | [add-to-cart.tsx](../../components/store/add-to-cart.tsx) |
| `'use server'` | Các export là **Server Function**, client gọi được qua mạng (file 07) | [actions/cart.actions.ts](../../actions/cart.actions.ts) |
| `import 'server-only'` | Build **lỗi** nếu file này bị import vào client | [lib/api/server-client.ts](../../lib/api/server-client.ts), [lib/auth/session.ts](../../lib/auth/session.ts) |
| `'use cache'` | Cache kết quả component/hàm (Next 16 — file 08) | chưa dùng |

### ⚠️ `'use server'` ≠ "chạy ở server"

Lỗi hiểu kinh điển:

```ts
// ❌ SAI: dùng 'use server' để "đánh dấu file chỉ chạy ở server"
'use server'
export async function getSecretConfig() { return process.env.API_KEY } // giờ là endpoint công khai! 💀
```

`'use server'` biến **mọi export** thành **một endpoint mà trình duyệt gọi được**. Server Component **không cần** directive nào (mặc định đã là server). Muốn đảm bảo module chỉ ở server → `import 'server-only'` — đúng như repo đang làm với `apiFetch` (vì nó đọc `API_KEY`).

---

## 5. When to Use — Chọn loại nào?

### Mặc định: Server Component, khi

- Lấy dữ liệu (API, DB) — ví dụ mọi `page.tsx` trong [app/](../../app/).
- Dùng secret (`process.env.API_KEY`) hoặc cookie httpOnly.
- Render nội dung tĩnh/ít tương tác: mô tả, bảng giá, timeline đơn hàng ([order-status-timeline.tsx](../../components/store/order-status-timeline.tsx)).
- Dùng thư viện nặng chỉ để render (markdown, syntax highlight) — thư viện ở lại server, 0 KB gửi xuống.

### Client Component, khi

- Cần **state** hoặc **effect**: chọn biến thể ([product-purchase.tsx](../../components/store/product-purchase.tsx)), ô tìm kiếm.
- Cần **event handler**: `onClick`, `onChange`.
- Cần **hook trạng thái form**: `useActionState`, `useFormStatus`, `useOptimistic`.
- Cần **browser API**: `localStorage`, `IntersectionObserver`, WebAuthn (passkey).
- Cần **Context** (theme provider, toast provider).

## 6. When NOT to Use — Các sai lầm thường gặp

- ❌ **`'use client'` ở `layout.tsx` hoặc `page.tsx` "cho tiện"** → toàn bộ cây con thành client, mất hết lợi ích. Tách phần tương tác ra component lá.
- ❌ **Fetch trong `useEffect` của Client Component** khi dữ liệu có thể lấy ở Server Component cha → thêm round-trip, thêm loading state, lộ endpoint.
- ❌ **Truyền cả object khổng lồ xuống Client Component** chỉ để dùng 2 field → mọi thứ bị serialize vào HTML. Truyền đúng thứ cần.
- ❌ **Kỳ vọng Server Component "tự cập nhật"** — nó chỉ render lại khi có request mới, `router.refresh()`, hoặc Server Action gọi `revalidatePath`/`refresh` (file 07).

## 7. Trade-offs

| Benefits | Costs |
| --- | --- |
| Ít JS gửi xuống → tải nhanh hơn, nhất là trên điện thoại yếu | Phải tư duy về **ranh giới** — một khái niệm hoàn toàn mới |
| Lấy dữ liệu sát nơi dùng, không cần API route trung gian | Props phải serialize được → không truyền callback |
| Secret ở lại server một cách tự nhiên | Không có state/effect → phần tương tác phải tách riêng |
| Không còn waterfall client (tải JS → fetch → render) | Mỗi tương tác thay đổi dữ liệu server cần round-trip (giảm nhờ `useOptimistic`) |
| Thư viện chỉ để render không tốn bundle | Debug trải trên 2 môi trường (log server ở terminal, log client ở DevTools) |

**Tại sao những đánh đổi này tồn tại?** Vì ranh giới server/client là **ranh giới mạng thật**. Mọi giới hạn (serialize, không truyền function) chỉ là hệ quả của việc dữ liệu phải đi qua dây mạng. RSC không giấu điều đó — nó làm cho nó hiện rõ trong code.

## 8. Best Practices

1. ✅ **Server mặc định, client khi cần** — và đẩy `'use client'` xuống lá.
2. ✅ **`import 'server-only'` cho mọi module đụng secret/cookie.** Repo đã làm cho `lib/api/server-client.ts`, `lib/auth/session.ts` — giữ thói quen này cho module mới.
3. ✅ **Dùng `children` để lồng nội dung server vào vỏ client** (modal, collapsible, tabs).
4. ✅ **Chuẩn hoá dữ liệu ở server** trước khi đưa xuống client (như `normalizeProductDetail`).
5. ✅ **Không dùng `'use server'` để "đánh dấu server"** — nó tạo endpoint công khai.
6. ✅ **Không cần `'use client'` trên mọi file client** — chỉ ở file được Server Component import trực tiếp.

---

**Trước:** [05 — React 19.2](./05-react19-2-activity-effect-event.md) · **Tiếp theo:** [07 — Server Actions & Mutations](./07-nextjs-server-actions-and-mutations.md)
