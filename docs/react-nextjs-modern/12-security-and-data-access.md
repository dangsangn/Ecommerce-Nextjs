# 12 — Bảo mật & Truy cập dữ liệu: `cache()`, Data Access Layer, Env, Taint, Server Action an toàn

> Server Components và Server Actions xoá đi ranh giới "frontend gọi API backend" mà ta quen. Điều đó tiện — nhưng cũng làm **dễ lộ dữ liệu** hơn bao giờ hết, vì code server và client nằm cạnh nhau trong cùng một file, cùng một thư mục.
> File này trả lời: *dữ liệu nào đang đi xuống trình duyệt, ai được gọi hàm nào, và làm sao không lấy cùng một dữ liệu hai lần.*

---

## 1. Overview — Ba mối đe doạ

| Mối đe doạ | Ví dụ | Phòng tránh |
| --- | --- | --- |
| **Rò dữ liệu xuống client** | Truyền cả object `user` (có `password_hash`, `email`) làm prop cho Client Component | DTO, taint, `server-only` |
| **Gọi hành động không được phép** | Ai đó gọi `deleteProductAction` với id sản phẩm của shop khác | Kiểm quyền **trong** action / DAL |
| **Lộ secret** | `API_KEY` lọt vào bundle client | Env không có `NEXT_PUBLIC_`, `server-only` |

Và một vấn đề hiệu năng đi cùng: **cùng một dữ liệu bị lấy nhiều lần** trong một request (layout, page, `generateMetadata` mỗi nơi gọi một lần). Giải pháp của nó — `cache()` — cũng chính là nền móng của Data Access Layer, nên ta bắt đầu từ đó.

---

## 2. `cache()` của React — memo trong phạm vi một request

### Là gì?

```ts
import { cache } from 'react'

export const getCart = cache(async () => {
  return apiFetch<Cart>('/cart', { auth: true })
})
```

Trong **cùng một request render**, mọi lần gọi `getCart()` (với cùng tham số) trả về **cùng một Promise** — API chỉ bị gọi một lần. Request sau thì bắt đầu lại từ đầu.

### Tại sao tồn tại?

Server Components khuyến khích **lấy dữ liệu ngay tại nơi dùng**, thay vì lấy ở trên cùng rồi truyền props xuống nhiều tầng. Nhưng nếu header, page và `generateMetadata` đều cần giỏ hàng/người dùng, không có memo thì mỗi nơi gọi API một lần.

### Ví dụ thật trong repo

```
 Request GET /cart
 ├─ (store)/layout.tsx → StoreHeader → apiFetch('/cart')   ← gọi lần 1 (để lấy số badge)
 └─ (store)/cart/page.tsx          → apiFetch('/cart')     ← gọi lần 2 (để hiện danh sách)
```

[components/store/store-header.tsx](../../components/store/store-header.tsx) và [app/(store)/cart/page.tsx](<../../app/(store)/cart/page.tsx>) đều tự gọi `apiFetch('/cart', { auth: true })`. Mỗi lần vào trang giỏ hàng, backend nhận **2 request giống hệt nhau**. Sửa:

```ts
// lib/cart/get-cart.ts
import 'server-only'
import { cache } from 'react'
import { apiFetch } from '@/lib/api/server-client'
import type { Cart } from '@/types/cart'

export const getCart = cache(async (): Promise<Cart> => {
  return apiFetch<Cart>('/cart', { auth: true })
})
```

Header và page cùng gọi `getCart()` → một request duy nhất.

> ⚠️ **Đừng trông vào memo ngầm của `fetch`.** Next có cơ chế memo cho `fetch` GET, nhưng nó phụ thuộc vào URL, header, option khớp chính xác — và `apiFetch` gắn thêm header IP mỗi lần. Dùng `cache()` tường minh thì người đọc code biết chắc chắn có memo, và nó hoạt động với mọi nguồn (fetch, SDK, DB).

### `cache()` vs `'use cache'` — hai thứ khác hẳn nhau

| | `cache()` của React | `'use cache'` của Next (file 08) |
| --- | --- | --- |
| Phạm vi | **Một request** | **Nhiều request, nhiều người dùng** |
| Sống bao lâu | Hết request là mất | Theo `cacheLife` (phút, giờ, ngày…) |
| Đọc được cookie bên trong | ✅ An toàn — chỉ có một người dùng | ❌ Nguy hiểm — rò dữ liệu giữa người dùng |
| Mục đích | Chống gọi trùng | Giảm tải, tăng tốc |
| Cần cấu hình | Không | `cacheComponents: true` |

🧠 **Mẹo nhớ:** `cache()` là **trí nhớ ngắn hạn** của một lần render. `'use cache'` là **kho lưu trữ dài hạn** dùng chung.

### ⚠️ Cạm bẫy

- **Tham số so sánh theo tham chiếu.** `getProduct({ id: '1' })` hai lần là hai object khác nhau → không trúng memo. Dùng tham số nguyên thuỷ (`getProduct('1')`).
- **Tạo `cache()` bên trong component** → mỗi lần render một hàm mới, không memo gì. Luôn khai báo ở cấp module.
- **Chỉ có tác dụng trong Server Components.** Gọi trong Server Action thì mỗi action là một phạm vi riêng.

---

## 3. Data Access Layer (DAL) — một cửa duy nhất tới dữ liệu

### Là gì?

Một lớp module **chỉ chạy ở server** (`lib/dal/` hoặc tương tự), là **nơi duy nhất**:
- đọc cookie/phiên và quyết định người dùng là ai,
- gọi backend với secret,
- kiểm quyền,
- trả về **DTO** — object tối thiểu, an toàn để render.

Component và action **không** gọi `apiFetch` hay `cookies()` trực tiếp; chúng gọi hàm của DAL.

### 🧠 Mô hình tư duy: quầy giao dịch ngân hàng

> Bạn không được vào thẳng kho tiền. Bạn đến quầy, quầy kiểm tra giấy tờ, rồi đưa cho bạn **đúng số tiền bạn được rút** — không phải cả két.
> DAL là quầy: kiểm tra (phiên, quyền) → lấy dữ liệu → trả **DTO** (đúng phần được xem).

```
 page.tsx / layout.tsx / action        DAL (server-only)                 Backend
 ─────────────────────────             ─────────────────                 ───────
 const user = await getCurrentUser() ─► đọc cookie, cache() ──────────►  /user/me
                                        kiểm tra quyền
                                    ◄── trả DTO { id, name, isShop }
```

### Repo đang ở đâu?

Repo đã có **phần lớn** một DAL:
- [lib/api/server-client.ts](../../lib/api/server-client.ts) — `apiFetch`, có `server-only`, là nơi duy nhất đọc `API_KEY`.
- [lib/auth/session.ts](../../lib/auth/session.ts) — `getAccessPayload`, `getClientId`, `isShop`, có `server-only`.

Còn thiếu: (1) `cache()` cho các hàm đọc phiên/dữ liệu; (2) hàm **"yêu cầu quyền"** dùng chung; (3) việc gọi `apiFetch` vẫn rải rác trong page/component thay vì đi qua hàm DAL theo domain.

### Ví dụ: DAL cho phiên và quyền

```ts
// lib/dal/session.ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getAccessPayload } from '@/lib/auth/session'

export const getCurrentUser = cache(async () => {
  const payload = await getAccessPayload()
  if (!payload) return null
  // DTO: chỉ những gì UI cần, không trả nguyên JWT payload
  return { id: payload.userId, email: payload.email, isShop: payload.roles?.includes('shop') ?? false }
})

export async function requireUser(redirectTo = '/') {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`)
  return user
}

export async function requireShop() {
  const user = await requireUser('/seller')
  if (!user.isShop) redirect('/seller/account')
  return user
}
```

```ts
// actions/product.actions.ts
export async function deleteProductAction(_prev: ActionState, formData: FormData) {
  await requireShop()          // 1 dòng, không thể quên kiểm tra
  // ... backend vẫn kiểm tra product có thuộc shop này không
}
```

> Các field `userId`, `email`, `roles` khớp với `JwtPayload` trong [types/api.ts](../../types/api.ts). DTO cố tình **bỏ** `exp`, `iat`, `type` — UI không cần chúng.

### DTO — đừng đưa nguyên object xuống client

**Mọi prop truyền vào Client Component đều nằm trong HTML gửi về** (RSC payload nhúng trong `<script>`). Ai cũng xem được bằng *View Source*, kể cả field mà component không hiển thị.

```tsx
// ❌ Client Component chỉ hiện tên, nhưng cả object (có email, roles, số điện thoại…) bị gửi xuống
<UserMenu user={fullUserFromBackend} />

// ✅ Chỉ gửi đúng thứ cần
<UserMenu name={user.name} avatar={user.avatar} />
```

Repo đã làm điều tương tự đúng cách ở [store-header.tsx](../../components/store/store-header.tsx): đọc payload ở server, chỉ dùng `isShop` và `cartCount` để render.

### Trade-offs

| Benefits | Costs |
| --- | --- |
| Một nơi để audit bảo mật | Thêm một lớp — tốn công cho app nhỏ |
| Không thể "quên" kiểm quyền nếu mọi đường đi đều qua DAL | Phải kỷ luật: ai đó gọi `apiFetch` trực tiếp là phá vỡ lớp này |
| DTO giảm kích thước HTML | Viết/duy trì kiểu DTO riêng |
| `cache()` chống gọi trùng miễn phí | |

---

## 4. Biến môi trường

### Hai loại, một quy tắc

| Biến | Có trong bundle client? | Đọc lúc nào |
| --- | --- | --- |
| `API_KEY`, `BACKEND_URL` (không tiền tố) | ❌ Không — client đọc ra `undefined` | Runtime, ở server |
| `NEXT_PUBLIC_*` | ✅ **Có — chép thẳng vào JS lúc build** | **Lúc build** |

Repo: mọi biến (`API_KEY`, `BACKEND_URL`, `TRUST_PROXY`) **không** có tiền tố và chỉ được đọc trong code server (`proxy.ts`, `lib/api/server-client.ts`, `actions/auth.actions.ts`). ✅ Đúng.

### ⚠️ Cạm bẫy

- **`NEXT_PUBLIC_` = công khai.** Đừng bao giờ đặt secret với tiền tố này "để client dùng được".
- **`NEXT_PUBLIC_` bị đóng băng lúc build.** Build một Docker image rồi chạy cho staging lẫn production → cả hai dùng giá trị lúc build. Giá trị khác nhau theo môi trường → đọc ở server rồi truyền xuống làm prop.
- **Hướng dẫn chính thức của Next:** chỉ DAL nên đọc `process.env`. Repo đang đọc `API_KEY` ở 3 nơi (proxy, `server-client`, `logoutAction`) — gom về một module config `server-only` sẽ gọn hơn.

---

## 5. Taint API — lưới an toàn cuối cùng (thử nghiệm)

```ts
// next.config.ts
experimental: { taint: true }
```

```ts
import { experimental_taintObjectReference, experimental_taintUniqueValue } from 'react'

export async function getUserRecord(id: string) {
  const user = await db.user.find(id)
  experimental_taintObjectReference('Không được truyền nguyên user record xuống client', user)
  experimental_taintUniqueValue('Không được để lộ token', user, user.resetToken)
  return user
}
```

Nếu object/giá trị bị đánh dấu đi qua ranh giới server→client, React **ném lỗi** thay vì âm thầm gửi đi.

- ✅ Hữu ích khi team lớn, nhiều người viết Server Component.
- ⚠️ Là **thử nghiệm** và bật cờ này sẽ chuyển React sang kênh experimental.
- ⚠️ Không thay thế DTO: taint chặn **đúng object đó** — chỉ cần `{ ...user }` là thành object mới, không còn bị chặn.

---

## 6. Server Action an toàn — checklist

Nhắc lại từ file 07: **mỗi action là một endpoint công khai.**

| # | Kiểm tra | Vì sao |
| --- | --- | --- |
| 1 | **Xác thực** trong action (`requireUser()`) | Proxy chỉ chạy cho route khớp `matcher`; action có thể được gọi từ bất kỳ trang nào |
| 2 | **Phân quyền theo tài nguyên** (sản phẩm có thuộc shop này?) | Ẩn nút ở UI không ngăn được ai gửi request |
| 3 | **Validate input bằng Zod** | `FormData` là chuỗi do client gửi |
| 4 | **Không trả lỗi nội bộ** | Giá trị `return` **không** bị Next che — nó xuống client nguyên văn |
| 5 | **Không tin URL do client gửi** khi `redirect()` | Open redirect |
| 6 | **Không export hàm phụ** từ file `'use server'` | Mỗi export là một endpoint |

### Về điểm 4 — lỗi nào bị che, lỗi nào không?

```
 Lỗi NÉM ra từ Server Component / Server Action (production)
   → Next thay message bằng thông báo chung + `digest` (mã để tra log server)   ✅ an toàn

 Giá trị RETURN, hoặc string bạn tự render (như `{error}`)
   → xuống client NGUYÊN VĂN                                                  ⚠️ bạn tự chịu trách nhiệm
```

Repo xử lý tốt ở action: [lib/api/error-message.ts](../../lib/api/error-message.ts) chỉ dùng message khi là `ApiError` (lỗi backend có chủ đích), ngược lại dùng fallback. Nhưng một số **page** lại render `e.message` của **mọi** lỗi — ví dụ [seller/products/[id]/edit/page.tsx](<../../app/(seller)/seller/products/[id]/edit/page.tsx>):

```ts
} catch (e) {
  error = e instanceof Error ? e.message : 'Could not load the product'
}
```

Nếu lỗi là `fetch failed` / `ECONNREFUSED 10.0.3.7:3055` / `BACKEND_URL is not configured`, nó hiện lên màn hình người dùng. Dùng chung `errorMessage(e, fallback)` ở page để nhất quán.

### Bảo vệ có sẵn của Next (biết để không làm thừa)

- **CSRF:** Server Action chỉ nhận POST, và Next so sánh `Origin` với `Host`. Đằng sau reverse proxy khác domain → cấu hình `serverActions.allowedOrigins`.
- **Closure được mã hoá:** biến mà action inline "bắt" từ Server Component được mã hoá khi gửi xuống client. Nhưng **đừng dựa vào đó** để giấu secret — đừng để secret lọt vào closure.
- **Action không dùng sẽ bị loại** khỏi bundle, và ID action không đoán được — nhưng ID **không phải** cơ chế bảo mật (nó nằm trong JS gửi xuống).

---

## 7. `proxy.ts` không phải ranh giới bảo mật

Năm 2025 có lỗ hổng (CVE-2025-29927) cho phép **bỏ qua hoàn toàn middleware** bằng một header nội bộ. App nào chỉ kiểm tra đăng nhập ở middleware bị lộ toàn bộ trang "được bảo vệ"; app nào kiểm tra lại ở page/action/DAL thì không bị ảnh hưởng.

Bài học được Next đưa thành khuyến nghị chính thức: **proxy để chặn sớm cho UX và làm mới token; kiểm quyền thật nằm sát dữ liệu (DAL).**

Repo: [proxy.ts](../../proxy.ts) chặn `/seller`, `/cart`, `/checkout`, `/orders`. Backend Node vẫn xác thực mọi request có `auth: true` → đó là lớp phòng thủ thứ hai. Thêm `requireUser()`/`requireShop()` ở page và action sẽ là lớp thứ ba, đồng thời cho UX tốt hơn (redirect đúng chỗ thay vì hiện lỗi 401 từ backend).

---

## 8. `forbidden()` & `unauthorized()` (thử nghiệm)

```ts
// next.config.ts
experimental: { authInterrupts: true }
```

```tsx
import { forbidden, unauthorized } from 'next/navigation'

export default async function EditProductPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) unauthorized()                 // → app/unauthorized.tsx, HTTP 401
  const product = await getProduct((await params).id)
  if (product.shopId !== user.id) forbidden() // → app/forbidden.tsx, HTTP 403
  // ...
}
```

So với `redirect('/login')`: giữ nguyên URL, trả **đúng mã HTTP** (quan trọng cho SEO và monitoring), và có UI riêng. Vẫn là thử nghiệm → cân nhắc trước khi dùng cho production.

---

## 9. Best Practices

1. ✅ **Mọi hàm đọc dữ liệu dùng nhiều nơi → bọc `cache()`.** Bắt đầu với `getCart`, `getCurrentUser`, `getProduct`.
2. ✅ **Một DAL `server-only` là cửa duy nhất tới backend.** Page, component, action gọi DAL, không gọi `apiFetch` trực tiếp.
3. ✅ **Prop xuống Client Component = DTO tối thiểu.** Giả định mọi thứ bạn truyền đều bị đọc.
4. ✅ **`requireUser()` / `requireShop()` ở đầu mọi action và page riêng tư** — kể cả khi proxy đã chặn.
5. ✅ **Không render `e.message` của lỗi không xác định.** Dùng `errorMessage(e, fallback)` ở mọi nơi.
6. ✅ **Secret không bao giờ có tiền tố `NEXT_PUBLIC_`.** Giá trị theo môi trường → đọc ở server.
7. ✅ **Proxy là UX, DAL là bảo mật.**

---

**Trước:** [11 — Routing nâng cao](./11-nextjs-advanced-routing.md) · **Tiếp theo:** [13 — Hiệu năng & Kiểm thử](./13-performance-and-testing.md)
