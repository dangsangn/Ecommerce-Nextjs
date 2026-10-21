# 07 — Server Actions & Mutation trong Next.js

> File 03 dạy phía **client** của một form (`useActionState`, `useFormStatus`). File này dạy phía **server**: hàm được gọi thế nào, làm sao để UI thấy dữ liệu mới, và những cái bẫy khiến "submit thành công nhưng hiện lỗi".

---

## 1. Overview — Tổng quan

### Là gì?

**Server Action** (React gọi chung là *Server Function*) là một hàm `async` đánh dấu `'use server'`. Client gọi nó **như gọi một hàm bình thường**, nhưng thực chất Next.js biến lời gọi đó thành một **HTTP POST** tới server.

```ts
// actions/cart.actions.ts
'use server'
export async function addToCartAction(_prev: ActionState, formData: FormData) { /* chạy ở server */ }
```

```tsx
// Client Component
<form action={formAction}>…</form>   // submit → POST → chạy addToCartAction ở server
```

### Tại sao tồn tại?

Trước đây, mỗi thao tác ghi cần **3 mảnh** ở 3 nơi:

```
 Client: fetch('/api/cart', { method: 'POST', body })   ← tự viết
 Server: app/api/cart/route.ts                          ← tự viết, tự parse body
 Client: sau khi xong, tự refetch / cập nhật state      ← tự viết
```

Server Action gộp lại thành **một hàm**, kiểu dữ liệu chảy xuyên suốt (TypeScript thấy được), và tích hợp với cache của Next để **trả về UI mới trong cùng một response**.

---

## 2. Mental Model — Mô hình tư duy

### 🧠 Một Server Action là một **endpoint công khai có giao diện hàm**

Hãy luôn đọc `'use server'` như sau:

```ts
'use server'
export async function deleteProduct(id: string) {}
// ≈ POST /<action-id-ngẫu-nhiên>   body: { id }
//   AI CŨNG GỌI ĐƯỢC nếu biết action-id (có trong JS gửi xuống trình duyệt)
```

Hệ quả bắt buộc:
- **Luôn kiểm tra quyền bên trong action** — không dựa vào việc "nút chỉ hiện cho admin".
- **Luôn validate input** — tham số có thể bị giả mạo, đừng tin TypeScript.

### 🧠 Vòng đời một lần submit

```
 Browser                                    Next.js server
 ───────                                    ──────────────
 submit form  ──POST (action-id, FormData)──►  1. Kiểm tra Origin (chống CSRF)
                                               2. Chạy action: validate → gọi API backend
                                               3. revalidatePath / updateTag / refresh?
                                                  → đánh dấu dữ liệu cũ
                                               4a. return state   ─┐
                                               4b. redirect()     ─┤
              ◄── response: state + RSC payload của UI mới ────────┘
 useActionState nhận state
 Router áp UI mới (không reload trang)
```

Bước 3 là điểm mấu chốt: nếu action có revalidate, **response đã chứa luôn UI mới** — không cần client tự refetch.

---

## 3. How It Works — Các thành phần chính

### 3.1 Hai cách khai báo

```ts
// Cách 1 (repo dùng): file riêng, mọi export là action — dùng được ở cả Server lẫn Client Component
// actions/order.actions.ts
'use server'
export async function cancelOrderAction(...) {}

// Cách 2: inline trong Server Component — tiện cho action chỉ dùng một chỗ
export default async function Page() {
  async function markRead(formData: FormData) {
    'use server'
    // ...
  }
  return <form action={markRead}>…</form>
}
```

✅ Repo gom action theo domain trong [actions/](../../actions/) (`auth`, `cart`, `product`, `order`…) — dễ tìm, dễ audit bảo mật. Giữ cách này.

### 3.2 `redirect()` hoạt động bằng cách **ném lỗi**

Đây là cái bẫy số một. `redirect()`, `notFound()`, `forbidden()`, `unauthorized()` đều **throw** một lỗi đặc biệt mà Next.js bắt ở tầng trên.

```ts
// ❌ SAI: redirect bị catch nuốt mất → người dùng thấy "Could not sign you in" dù đã đăng nhập thành công
try {
  const data = await apiFetch('/auth/login', { body })
  await setSession(data.tokens, data.user._id)
  redirect('/')                     // throw NEXT_REDIRECT…
} catch (e) {
  return { ok: false, message: 'Could not sign you in' } // …bị bắt ở đây 💀
}
```

```ts
// ✅ ĐÚNG — đúng như actions/auth.actions.ts đang làm
try {
  const data = await apiFetch<LoginData>('/auth/login', { body: parsed.data })
  await setSession(data.tokens, data.user._id)
} catch (e) {
  return { ok: false, message: errorMessage(e, 'Could not sign you in') }
}
redirect(redirectTo) // ngoài try
```

Nếu buộc phải để trong `try`, dùng `unstable_rethrow(e)` ở đầu khối `catch` để ném lại lỗi nội bộ của Next.

Một hệ quả khác: vì `redirect()` ném lỗi, kiểu trả về là `never` — code sau nó không chạy. Đó là lý do [cart.actions.ts](../../actions/cart.actions.ts) viết được:

```ts
const clientId = await getClientId()
if (!clientId) redirect(`/login?redirect=/products/${productId}`) // không cần return
```

### 3.3 Làm UI thấy dữ liệu mới: 4 công cụ

Sau khi ghi, bạn phải nói cho Next biết **cái gì đã cũ**. Next 16 có 4 công cụ với ngữ nghĩa khác nhau:

| API | Làm gì | Gọi được ở | Người dùng thấy |
| --- | --- | --- | --- |
| `revalidatePath(path)` | Đánh dấu dữ liệu & UI của một **đường dẫn** là cũ | Server Action, Route Handler | Dữ liệu mới ở lần render tiếp theo của path đó |
| `updateTag(tag)` *(mới Next 16)* | **Hết hạn ngay** dữ liệu gắn tag | **Chỉ** Server Action | Dữ liệu mới **ngay** — request tiếp **chờ** dữ liệu tươi (*read-your-own-writes*) |
| `revalidateTag(tag, 'max')` | Đánh dấu **cũ**, phục vụ bản cũ trong khi làm mới ở nền (*stale-while-revalidate*) | Server Action, Route Handler | Có thể thấy bản cũ một lần nữa |
| `refresh()` *(mới Next 16)* | Làm mới **router phía client** — render lại Server Components cho trang hiện tại, không đụng cache | **Chỉ** Server Action | Trang hiện tại được render lại với dữ liệu không-cache |

> ⚠️ Next 16: `revalidateTag(tag)` **một tham số đã deprecated**. Dùng `revalidateTag(tag, 'max')` hoặc chuyển sang `updateTag(tag)`.

### 🧠 Chọn cái nào?

```
 Người dùng vừa sửa dữ liệu và PHẢI thấy ngay thay đổi của chính mình?
 ├─ Dữ liệu được cache theo tag  ──────────────► updateTag('product-123')
 ├─ Dữ liệu gắn với một/vài trang cụ thể ──────► revalidatePath('/cart')
 └─ Trang không cache gì, chỉ cần render lại ──► refresh()

 Thay đổi đến từ hệ thống khác (webhook CMS, cron), chậm vài giây không sao?
 └─────────────────────────────────────────────► revalidateTag('products', 'max') trong Route Handler
```

### Trong repo hiện tại

Repo chưa bật cache theo tag (file 08) và mọi trang đều đọc cookie → render động mỗi request. Repo dùng `revalidatePath` — đơn giản và đúng cho tình huống này. Ví dụ [cart.actions.ts](../../actions/cart.actions.ts):

```ts
await apiFetch('/cart', { auth: true, body: { productId, quantity } })
revalidatePath('/cart')
return { ok: true, message: 'Added to cart' }
```

### 3.4 `refresh()` (server) vs `router.refresh()` (client)

Repo có chỗ dùng `router.refresh()` ở client sau khi action thành công — [components/auth/reset-otp-form.tsx](../../components/auth/reset-otp-form.tsx):

```tsx
useEffect(() => {
  // The action set the ticket cookie; re-render the server page to get the password form.
  if (state.ok) router.refresh()
  else if (state.message) toast.error(state.message)
}, [state, router])
```

Cách này đúng nhưng tốn **2 round-trip**: (1) gọi action, (2) client nhận `ok` rồi mới xin render lại. Với Next 16, có thể gọi `refresh()` **ngay trong action**:

```ts
'use server'
import { refresh } from 'next/cache'

export async function verifyResetOtpAction(_prev: ActionState, formData: FormData) {
  // ... xác thực OTP, ghi ticket cookie
  refresh()            // response của action mang luôn UI mới
  return { ok: true }
}
```

| | `router.refresh()` (client) | `refresh()` (server, Next 16) |
| --- | --- | --- |
| Round-trip | 2 | 1 |
| Gọi ở | Client Component (event, effect) | Chỉ Server Action |
| Dùng khi | Làm mới không gắn với action (nút "Tải lại", polling) | Ngay sau một mutation |

### 3.5 `cookies()` trong action

Server Action là nơi **ghi** cookie hợp lệ (Server Component chỉ đọc được). Repo đặt toàn bộ logic phiên vào [lib/auth/session.ts](../../lib/auth/session.ts) và gọi từ action:

```ts
await setSession(data.tokens, data.user._id) // bên trong: (await cookies()).set(...)
```

Từ Next 15, `cookies()` là **async** — luôn `await cookies()`.

### 3.6 `after()` — làm việc sau khi đã trả response

```ts
'use server'
import { after } from 'next/server'

export async function createOrderAction(_prev: ActionState, formData: FormData) {
  const order = await apiFetch('/order', { auth: true, body })
  after(async () => {
    await analytics.track('order_created', { id: order.id }) // không làm người dùng chờ
  })
  revalidatePath('/orders')
  redirect(`/orders/${order.id}`)
}
```

Dùng cho: log, analytics, gửi webhook phụ — những việc **không ảnh hưởng tới response**. Không dùng cho việc mà người dùng cần kết quả.

### 3.7 Giới hạn kích thước body

Mặc định body gửi tới Server Action **tối đa 1 MB** (chống DoS). Upload ảnh qua action — như `prepareImagesAction` trong [product.actions.ts](../../actions/product.actions.ts) — sẽ lỗi nếu tổng file vượt mức này. Nâng giới hạn nếu cần:

```ts
// next.config.ts
experimental: {
  serverActions: { bodySizeLimit: '10mb' },
}
```

> ⚠️ [next.config.ts](../../next.config.ts) của repo **chưa đặt** `bodySizeLimit`. Nếu seller báo "upload nhiều ảnh thì lỗi", kiểm tra đây đầu tiên. Với file lớn thật sự, cân nhắc upload thẳng lên storage (presigned URL) thay vì đi qua action.

---

## 4. When to Use — Khi nào dùng Server Action

- ✅ **Mọi mutation khởi phát từ UI của chính app**: thêm giỏ, đặt hàng, đăng nhập, sửa sản phẩm.
- ✅ **Form cần chạy được khi JS chưa tải** (progressive enhancement).
- ✅ **Thao tác cần secret** (gọi backend với `x-api-key`) mà không muốn lộ ra client.

## 5. When NOT to Use — Khi nào dùng thứ khác

| Tình huống | Dùng thay vào đó | Vì sao |
| --- | --- | --- |
| **Đọc** dữ liệu để render | Server Component `await` | Action là POST, chạy **tuần tự**, không cache — tệ cho đọc |
| Hệ thống ngoài gọi vào (webhook thanh toán, CMS) | **Route Handler** (`app/api/.../route.ts`) | Cần URL ổn định, method/HTTP status tuỳ chỉnh |
| Mobile app / bên thứ ba cần API | Route Handler hoặc backend riêng | Action ID thay đổi theo build — không phải API công khai ổn định |
| Upload file lớn | Presigned URL lên storage | Giới hạn body, tốn bộ nhớ server Next |
| Gọi liên tục khi gõ (autocomplete) | Route Handler + fetch có debounce, hoặc đọc qua `searchParams` | Action chạy tuần tự theo hàng đợi → gõ nhanh sẽ bị xếp hàng |

## 6. Trade-offs

| Benefits | Costs |
| --- | --- |
| Một hàm thay cho route + fetch + refetch | **Mỗi action là endpoint công khai** — dễ quên kiểm tra quyền vì "trông như hàm" |
| Type-safe end-to-end | Input là `FormData` (string) — phải validate/ép kiểu |
| Revalidate trả UI mới trong cùng response | Action chạy **tuần tự** — không hợp cho đọc song song |
| Progressive enhancement | `redirect()` ném lỗi → bẫy `try/catch` |
| Bảo vệ CSRF tích hợp (kiểm tra Origin) | Giới hạn body 1 MB mặc định |

**Tại sao những chi phí này tồn tại?** Vì sự tiện lợi "gọi như hàm" là **lớp trừu tượng trên HTTP**. Nó giấu đi URL và fetch — nhưng không giấu được bản chất: dữ liệu đi qua mạng, và bất kỳ ai cũng có thể gửi request.

## 7. Best Practices

1. ✅ **Mỗi action: xác thực → kiểm quyền → validate → thực thi → revalidate → trả kết quả/redirect.** Theo đúng thứ tự.
2. ✅ **`redirect()` luôn đặt ngoài `try/catch`.** Repo làm đúng điều này — giữ nguyên khi thêm action mới.
3. ✅ **Validate bằng Zod ở server** ([lib/validations/](../../lib/validations/)) — kể cả khi form đã có `required`, `min`.
4. ✅ **Không tin giá trị redirect từ client.** Ví dụ `loginAction` đọc `redirect` từ `formData` — hãy chắc chắn nó là đường dẫn nội bộ (bắt đầu bằng `/` và không phải `//`) trước khi `redirect()`, nếu không sẽ thành *open redirect*.
5. ✅ **Ưu tiên `updateTag` (khi có cache) / `refresh()` trong action** thay vì `router.refresh()` ở client sau action.
6. ✅ **Việc phụ dùng `after()`** để không kéo dài thời gian phản hồi.
7. ✅ **Không export hàm tiện ích từ file `'use server'`** — mọi export đều thành endpoint. Hàm phụ trợ để ở `lib/` với `import 'server-only'`.

---

**Trước:** [06 — Server & Client Components](./06-server-and-client-components.md) · **Tiếp theo:** [08 — Caching & Rendering](./08-nextjs-caching-and-rendering.md)
