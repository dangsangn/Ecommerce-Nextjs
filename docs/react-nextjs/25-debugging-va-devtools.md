# 25. Debugging & DevTools — kỹ năng ít được dạy nhất

> **Mục tiêu:** chuyển từ "thêm `console.log` rồi đoán" sang **chẩn đoán có phương pháp**.
> Chương này là tập hợp kỹ thuật thực chiến: đọc Profiler, soi fiber, xem RSC payload,
> và một bảng **triệu chứng → nguyên nhân** dùng được ngay.

---

## 1. Overview

### Vì sao debugging đáng một chương riêng

Trong 24 chương trước, mọi vấn đề đều được **chỉ ra sẵn**. Thực tế không như vậy: bạn nhận một bug
report kiểu *"trang giỏ hàng thỉnh thoảng hiện sai số lượng"* và phải tự tìm.

Kỹ năng ở đây không phải biết nhiều API, mà là **biết hỏi câu hỏi nào trước**.

### Nguyên tắc: xác định TẦNG trước khi tìm nguyên nhân

Nhớ lại kiến trúc từ file `08` và `13`. Một bug có thể ở **năm** tầng, và mỗi tầng có công cụ khác nhau:

```
1. Backend Express          → curl / Postman / log backend
2. Next.js server (RSC)     → console.log ra TERMINAL, không phải browser
3. Ranh giới serialization  → xem RSC payload trong Network
4. Client hydration          → React DevTools + console warning
5. Client runtime (state)    → React DevTools Components/Profiler
```

**Câu hỏi đầu tiên luôn là: "bug này ở tầng nào?"** Trả lời sai câu này là lý do người ta debug 3 giờ
cho một bug 5 phút.

**Cách xác định nhanh:**

| Kiểm tra | Nếu đúng → tầng |
| --- | --- |
| `curl` backend trả đúng dữ liệu? | Không → tầng 1 |
| View Source (Ctrl+U) đã có dữ liệu đúng trong HTML? | Không → tầng 2 |
| Có warning hydration trong console? | Có → tầng 4 |
| Bug chỉ xuất hiện **sau khi tương tác**? | Có → tầng 5 |
| Bug xuất hiện **ngay khi load**, HTML đúng nhưng UI sai? | → tầng 4 |

---

## 2. `console.log` — nhưng ở đâu?

Đây là nhầm lẫn đầu tiên của mọi người mới dùng App Router.

```tsx
// app/(store)/orders/page.tsx — SERVER COMPONENT
export default async function OrdersPage() {
  const result = await apiFetch<OrdersResult>('/order', { auth: true })
  console.log('orders:', result.data.length)      // ← in ra TERMINAL, không phải browser console
```

```tsx
// components/store/cart-line.tsx — CLIENT COMPONENT
'use client'
export function CartLine({ product }: { product: CartProduct }) {
  console.log('render CartLine', product.productId)   // ← in ra BROWSER console
```

⚠️ **Nhưng Client Component cũng chạy trên server (SSR).** Nên `console.log` trong Client Component
xuất hiện ở **cả hai** nơi — một lần khi SSR (terminal), một lần khi hydrate (browser).

Nếu bạn thấy log trong terminal cho một component có `'use client'` — đó là SSR, không phải bug.

**Kỹ thuật: log có nhãn tầng.**

```tsx
// lib/debug.ts
const IS_SERVER = typeof window === 'undefined'

/** Log kèm nhãn môi trường — biết ngay log này từ đâu. */
export function dlog(scope: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'production') return
  console.log(`[${IS_SERVER ? 'SRV' : 'CLI'}] ${scope}`, ...args)
}
```

```tsx
dlog('CartLine', { productId, quantity })
// [SRV] CartLine { productId: 'abc', quantity: 2 }     ← SSR
// [CLI] CartLine { productId: 'abc', quantity: 2 }     ← hydration
```

Nhìn cặp log này bạn biết ngay: nếu hai dòng **khác nhau** → hydration mismatch (file `13`).

---

## 3. React DevTools — dùng đúng cách

### Tab Components: ba tính năng ít ai dùng

**(1) Xem hook mà không cần tên.**

Chọn một component → panel bên phải hiện "hooks":

```
hooks
├─ 1 State: {ok: false}          ← useActionState #1 (qtyState)
├─ 2 State: {ok: false}          ← useActionState #2 (rmState)
├─ 3 Effect
└─ 4 Effect
```

Nhớ file `15`: hook không có tên, chỉ có **thứ tự**. DevTools hiện đúng thứ tự đó. Nếu bạn thấy số
lượng hook **đổi giữa các render** → đã vi phạm Rules of Hooks.

**(2) "Highlight updates when components render"** (bật trong Settings ⚙️).

Mỗi component re-render sẽ nhấp một viền màu. Đây là cách **nhanh nhất** tìm re-render không cần thiết:

- Gõ vào ô search → chỉ ô input nhấp? ✅ tốt
- Gõ vào ô search → **cả trang** nhấp? ⚠️ có state ở quá cao

📄 Thử với repo: mở `/products/abc`, bấm "Reply" trên một comment. Bạn sẽ thấy **toàn bộ**
`CommentSection` nhấp — đúng như phân tích ở file `04` (state `replyOpen` ở cấp section).

**(3) Xem component là Server hay Client.**

Server Component hiện với tên và **không có** hooks section. Nếu bạn tưởng một component là server mà
DevTools hiện hooks → nó đã bị kéo vào client bundle (nhớ file `08`: `'use client'` lan xuống).

### Tab Profiler: đọc đúng ba biểu đồ

```
1. Bật "Record why each component rendered" trong Settings  ← LÀM ĐẦU TIÊN
2. Bấm ⏺ → tương tác → bấm ⏹
```

**Flamegraph** — chiều rộng = thời gian, chiều dọc = cây component:

```
├────────────── CommentSection 12.4ms ──────────────┤
  ├─ CommentItem 0.8ms ─┤├─ CommentItem 0.8ms ─┤ ...
```

Đọc: component nào **rộng nhất** ở tầng nào. Component xám = không render lần này (bailout, file `15`).

**Ranked** — sắp xếp theo thời gian, bỏ cấu trúc cây. Dùng để tìm "ai đắt nhất" nhanh nhất.

**"Why did this render?"** — click một component, panel hiện:

| Lý do | Nghĩa | Hành động |
| --- | --- | --- |
| *Hooks changed* | State/context của chính nó đổi | Bình thường |
| *Props changed (x, y)* | Prop cụ thể đổi | Kiểm tra prop đó có cần đổi không |
| *Parent rendered* | Cha render, con render theo | Nếu props không đổi → cân nhắc `memo`/đưa state xuống |
| *Context changed* | Context value đổi | Chia nhỏ Context (file `05`) |

⚠️ **Ngưỡng để lo:** một commit > **16ms** (drop frame ở 60fps). Dưới đó, đừng tối ưu (file `04`).

### React 19.2 Performance Tracks

React 19.2 thêm track riêng vào **Chrome DevTools → Performance**:

```
1. Chrome DevTools → Performance → ⏺
2. Tương tác → ⏹
3. Tìm track "⚛ React" trong timeline
```

Bạn thấy được **lane** (file `15`) và scheduler ngay trên cùng timeline với network, paint, và
JavaScript. Đây là công cụ tốt nhất để trả lời: *"vì sao click này mất 300ms mới phản hồi?"* —
bạn thấy được nó chờ network, chờ render, hay chờ một transition bị hạ ưu tiên.

---

## 4. Soi Fiber bằng tay — khi DevTools không đủ

Từ file `15`, giờ dùng thực tế:

```js
// 1. Elements tab → chọn một element → nó thành $0
// 2. Console:
const fiberKey = Object.keys($0).find(k => k.startsWith('__reactFiber$'))
const fiber = $0[fiberKey]
```

**Bốn công thức hữu ích:**

```js
// (a) Đi lên tìm component gần nhất có tên (bỏ qua các div)
function ownerOf(f) {
  let cur = f
  while (cur && typeof cur.type !== 'function') cur = cur.return
  return cur
}
ownerOf(fiber).type.name          // "CartLine"

// (b) Liệt kê toàn bộ hook của một component
function hooks(f) {
  const out = []
  let h = f.memoizedState, i = 0
  while (h) { out.push({ index: ++i, state: h.memoizedState }); h = h.next }
  return out
}
console.table(hooks(ownerOf(fiber)))

// (c) So sánh props giữa hai cây (tìm prop nào đổi)
const c = ownerOf(fiber)
console.log('cũ:', c.alternate?.memoizedProps)
console.log('mới:', c.memoizedProps)

// (d) Xem lane đang chờ trên fiber
console.log('lanes:', c.lanes.toString(2), 'childLanes:', c.childLanes.toString(2))
```

**Khi nào cần cái này?** Khi DevTools nói *"Parent rendered"* mà bạn không biết prop nào đổi. Công thức
**(c)** trả lời trực tiếp bằng cách so `memoizedProps` của `current` và `alternate` (nhớ double
buffering ở file `15`).

---

## 5. ⭐ Debug RSC — xem payload thật

Đây là kỹ năng đặc thù App Router mà rất ít người biết.

### Xem RSC payload của lần tải đầu

```
Ctrl+U (View Source) → cuộn xuống cuối → tìm self.__next_f.push
```

Bạn sẽ thấy chuỗi giống thế này:

```html
<script>self.__next_f.push([1,"3:[\"$\",\"div\",null,{\"className\":\"space-y-6\",\"children\":..."])</script>
```

**Ba thứ kiểm tra được ngay từ đây:**

| Kiểm tra | Kết luận |
| --- | --- |
| Dữ liệu có trong payload? | Không → bug ở tầng 2 (server fetch) |
| Có secret nào trong payload? | Có → **rò rỉ nghiêm trọng** (file `24`, taint API) |
| Payload dài bất thường? | Bạn đang gửi quá nhiều dữ liệu xuống client |

⚠️ **Kiểm tra #2 quan trọng nhất.** Hãy thử ngay với repo: mở `/seller`, View Source, `Ctrl+F` tìm
`"roles"` hoặc `"exp"`. Nếu thấy → `JwtPayload` đang bị serialize xuống client.

📄 Với repo hiện tại thì **không** thấy, vì `store-header.tsx` và `seller/page.tsx` chỉ dùng
`payload.email` / `payload.roles` **trong** Server Component:

```tsx
const payload = await getAccessPayload()
const isShop = Boolean(payload?.roles?.includes('shop'))
```

Kết quả (`isShop` là boolean, `payload.email` là string) mới đi xuống. Đúng.

### Xem RSC payload của soft navigation

```
Network tab → filter "Fetch/XHR" → bấm một <Link>
→ tìm request có query ?_rsc=xxxx
→ tab Response
```

Bạn thấy **chính xác** những gì server gửi cho lần điều hướng đó. Nhớ file `13`: soft navigation
**chỉ** gửi payload của phần đổi, không gửi lại layout.

**Cách dùng để debug:**

| Triệu chứng | Kiểm tra `?_rsc=` |
| --- | --- |
| Navigate mà UI không đổi | Payload có dữ liệu mới không? Nếu không → cache (file `10`) |
| Navigate chậm | Payload lớn bao nhiêu? Request mất bao lâu? |
| `revalidatePath` không có tác dụng | Payload còn dữ liệu cũ → sai path revalidate |

📄 **Thử ngay bug đã biết** (file `10`): mở `/orders/abc123`, bấm "Cancel order", xem Network.
Bạn sẽ thấy request Server Action trả về, nhưng **không có** payload mới cho `/orders/abc123` —
vì `cancelOrderAction` chỉ `revalidatePath('/orders')`.

### Xem Server Action request

```
Network tab → bấm submit một form → tìm request POST tới URL của trang hiện tại
```

**Ba thứ đáng xem:**

```
Request Headers:
  Next-Action: 7f3a9c2e8b1d...          ← ID của action (file 11)
Payload:
  ------WebKitFormBoundary...
  Content-Disposition: form-data; name="orderId"
  abc123
Response:
  0:{"a":"$@1","f":"","b":"..."}         ← state mới + RSC payload
```

**`Next-Action` header là bằng chứng cụ thể** cho điều đã nói ở file `11`: action là một endpoint
công khai với ID. Copy ID đó, bạn gọi lại được action bằng `curl` — đó chính là mô hình tấn công IDOR
ở file `24`.

---

## 6. ⭐ Bảng triệu chứng → nguyên nhân

Đây là phần dùng nhiều nhất của chương. Mỗi dòng là một bug thật đã thấy trong dự án React/Next.

### Nhóm A — UI không cập nhật

| Triệu chứng | Nguyên nhân thường gặp | Kiểm tra | Chương |
| --- | --- | --- | --- |
| `setState` rồi UI không đổi | Mutate object/array thay vì tạo mới | `console.log(prev === next)` — nếu `true` → mutate | `01`, `15` |
| State đúng nhưng UI cũ | Đọc từ closure cũ (stale) | Dùng dạng updater `setX(p => ...)` | `02` |
| Server Action xong, UI không đổi | Thiếu / sai `revalidatePath` | Network → có `?_rsc=` mới không? | `10` |
| Sửa dữ liệu, một trang cập nhật, trang khác không | Revalidate thiếu path | Grep endpoint đó xem hiện ở mấy trang | `10`, `11` |
| Badge/header không đổi sau mutation | Dữ liệu nằm trong **layout** | Cần `revalidatePath(p, 'layout')` | `09`, `10` |
| Input không nhận giá trị mới từ prop | `defaultValue` chỉ đọc một lần | Thêm `key` hoặc chuyển controlled | `02` |
| Đổi tab/prop mà state cũ dính lại | `key` dùng index, hoặc thiếu `key` | DevTools → xem component có remount không | `15` |

### Nhóm B — Render sai / quá nhiều

| Triệu chứng | Nguyên nhân | Kiểm tra | Chương |
| --- | --- | --- | --- |
| Effect chạy vô hạn | Effect `setState` một giá trị nằm trong deps của chính nó | Xem deps có object/function tạo mới mỗi render | `03` |
| Effect chạy 2 lần ở dev | StrictMode — **đúng theo thiết kế** | Kiểm tra effect có idempotent không | `01`, `15` |
| Component render mỗi lần gõ chữ | State ở quá cao | DevTools "Highlight updates" | `02`, `04` |
| `memo` không có tác dụng | Prop object/function tạo mới ở cha | Profiler → "Props changed (config)" | `04` |
| Danh sách nhấp nháy / mất focus khi sort | `key` là index | Đổi sang ID ổn định | `15` |
| Chỉ một item đổi mà cả list render | Bình thường nếu list nhỏ; nếu lớn → state xuống thấp | Profiler xem tổng thời gian | `04` |

### Nhóm C — Server / Client boundary

| Triệu chứng | Nguyên nhân | Chương |
| --- | --- | --- |
| `useState is not a function` / `Cannot use hooks` | Thiếu `'use client'` | `08` |
| `Functions cannot be passed directly to Client Components` | Truyền function/component qua prop | `08` |
| `window is not defined` | Dùng browser API trong render (không phải effect) | `08`, `13` |
| `You're importing a component that needs "server-only"` | Module server bị kéo vào client tree | `08` |
| Secret là `undefined` ở client | Thiếu `NEXT_PUBLIC_` — **và đó là điều đúng** | `08` |
| Component tưởng là server nhưng có hooks trong DevTools | Bị import bởi một client component | `08` |
| `cookies()` gây lỗi "outside request scope" | Gọi trong module scope thay vì trong function | `12` |

### Nhóm D — Hydration

| Triệu chứng | Nguyên nhân | Chương |
| --- | --- | --- |
| "Text content did not match" | `new Date()`, `Math.random()`, `toLocaleDateString()` trong render | `13` |
| "Expected server HTML to contain..." | HTML không hợp lệ (`<div>` trong `<p>`) | `13` |
| Chỉ lỗi trên máy một người dùng | Browser extension (Grammarly, dịch tự động) | `13` |
| Layout nhảy sau khi load | Ảnh thiếu `width`/`height`, hoặc font chưa load | `13`, `22` |
| Dark mode nhấp nháy | `next-themes` thiếu `suppressHydrationWarning` trên `<html>` | `05`, `13` |

### Nhóm E — "Chạy ở dev, lỗi ở production"

Đây là nhóm khó nhất. Checklist theo thứ tự:

| # | Kiểm tra | Vì sao |
| --- | --- | --- |
| 1 | Env var có trên môi trường production? | Thiếu `BACKEND_URL`/`API_KEY` → lỗi ở `baseUrl()` |
| 2 | Env var được đọc lúc **build** hay **runtime**? | `NEXT_PUBLIC_*` bị **inline lúc build** — đổi sau build không có tác dụng |
| 3 | Có phụ thuộc vào `NODE_ENV !== 'production'`? | 📄 `session.ts`: `secure = NODE_ENV === 'production'` — cookie khác nhau giữa hai môi trường |
| 4 | Route bị prerender mà bạn tưởng là dynamic? | `pnpm build` → xem `○` vs `ƒ` |
| 5 | Cache đang giữ dữ liệu cũ? | Ở dev cache lỏng hơn nhiều |
| 6 | Message lỗi bị ẩn? | Production ẩn lỗi server, chỉ còn `digest` |
| 7 | Có `console.log` nào tưởng vô hại mà tốn I/O? | 📄 `product.actions.ts` log cả File object |

**Kỹ thuật quan trọng nhất cho nhóm này: chạy production build ở local.**

```bash
pnpm build && pnpm start
# Rồi reproduce bug ở localhost:3000
```

**Đây là bước mà 90% người bỏ qua**, và nó tái hiện được phần lớn bug "chỉ có ở production" — vì
`pnpm start` dùng đúng cùng cấu hình build, minify, và cache như production.

---

## 7. Debug Server Component và Server Action

### Node inspector cho server code

```bash
NODE_OPTIONS='--inspect' pnpm dev
# Mở chrome://inspect → "Open dedicated DevTools for Node"
```

Giờ bạn `debugger` được **trong Server Component**:

```tsx
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  debugger                                    // ← dừng ở đây trong Node DevTools
  const order = await apiFetch<Order>(`/order/${id}`, { auth: true })
```

**Đây là cách duy nhất debug đúng nghĩa cho RSC.** `console.log` chỉ cho bạn giá trị; debugger cho bạn
call stack, scope, và khả năng bước từng dòng.

### Đo waterfall — nhắc lại từ file `22`, mở rộng

```tsx
// lib/api/server-client.ts — thêm tạm
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const t0 = performance.now()
  const label = `${opts.method ?? (opts.body !== undefined || opts.multipart ? 'POST' : 'GET')} ${path}`
  try {
    // ...phần hiện tại...
    return unwrap<T>(res)
  } catch (e) {
    console.error(`[api] ✖ ${label} — ${Math.round(performance.now() - t0)}ms`, e)
    throw e
  } finally {
    const ms = Math.round(performance.now() - t0)
    // Cảnh báo nếu chậm — dễ nhìn hơn một danh sách log phẳng
    console.log(`[api] ${ms > 300 ? '🐢' : '✔'} ${label.padEnd(55)} ${ms}ms`)
  }
}
```

Output khi mở `/products/abc`:

```
[api] ✔ GET /cart                                            142ms
[api] ✔ GET /product/abc                                      156ms
[api] ✔ GET /comment?productId=abc                            148ms
```

**Đọc kết quả:** ba log **xuất hiện lần lượt** (không cùng lúc) → tuần tự. Nếu song song, chúng sẽ
xuất hiện gần như đồng thời với thời gian gần bằng nhau. Đây là cách phát hiện waterfall rẻ nhất.

### Trace xuyên tầng bằng request ID

Khi bug nằm ở backend nhưng bạn chỉ thấy triệu chứng ở frontend, request ID nối hai bên lại:

```tsx
// lib/api/server-client.ts
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  // ...
  const requestId = crypto.randomUUID()
  const headers = buildHeaders({ apiKey: process.env.API_KEY!, json, session })
  headers['x-request-id'] = requestId          // ⭐ backend log cùng ID này

  try {
    const res = await fetch(`${baseUrl()}${path}`, { method, headers, /* ... */ })
    return await unwrap<T>(res)
  } catch (e) {
    console.error(`[api] ✖ ${path} requestId=${requestId}`, e)
    throw e
  }
}
```

Giờ khi người dùng báo lỗi, bạn có `requestId` để grep trong log backend. Không có nó, bạn phải đoán
theo timestamp — và với nhiều request đồng thời, đoán sai là chuyện thường.

---

## 8. Source map ở production

Khi có lỗi ở production, stack trace mặc định là code đã minify:

```
Error: Cannot read properties of null
  at f (main-a1b2c3.js:1:48291)
```

Vô dụng. Bật source map:

```tsx
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  productionBrowserSourceMaps: true,
}
```

⚠️ **Trade-off thật:**

| Lợi ích | Cái giá |
| --- | --- |
| Stack trace đọc được | **Ai cũng đọc được source code của bạn** |
| Debug production nhanh hơn nhiều | Deployment lớn hơn (file `.map`) |

**Cách làm đúng:** sinh source map, **upload lên Sentry/monitoring**, rồi **không deploy** file `.map`
lên public. Sentry có CLI cho việc này:

```bash
# Trong CI, sau khi build
sentry-cli sourcemaps upload --release "$GIT_SHA" .next/static
# Rồi xoá .map trước khi deploy
find .next -name "*.map" -delete
```

Với `error.digest` (file `16`), bạn có đủ để nối: người dùng báo digest → tìm trong Sentry → thấy stack
trace đã de-minify.

---

## 9. Bisect — khi không biết bug từ đâu

Khi bug "mới xuất hiện" mà bạn không biết commit nào gây ra:

```bash
git bisect start
git bisect bad                    # commit hiện tại có bug
git bisect good 1eb96b5           # commit này biết là tốt
# Git checkout ở giữa → bạn test → trả lời:
git bisect good    # hoặc: git bisect bad
# Lặp lại ~log2(n) lần
git bisect reset
```

Với 100 commit, bisect tìm ra thủ phạm trong **7 bước**. Tự đọc từng commit mất cả buổi.

**Tự động hoá nếu bug kiểm tra được bằng lệnh:**

```bash
git bisect start HEAD 1eb96b5
git bisect run pnpm test:run
```

Git tự chạy test ở mỗi bước và tìm ra commit đầu tiên làm test đỏ. Đây là lý do **test nhanh** quan
trọng (file `14`: suite của repo chạy trong vài trăm ms) — bisect chạy nó ~7 lần.

---

## 10. Kỹ thuật thu hẹp vấn đề

Khi hoàn toàn bế tắc, ba kỹ thuật này luôn hiệu quả:

### (a) Xoá dần cho tới khi bug biến mất

```tsx
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await apiFetch<Product>(`/product/${id}`)

  return <div>OK: {product.product_name}</div>     // ← chỉ giữ MỘT dòng
  // Mọi thứ khác comment out
}
```

Bug còn? → ở tầng fetch. Bug mất? → thêm lại từng khối cho tới khi nó xuất hiện.

Nghe thô sơ, nhưng nó **luôn** cho câu trả lời và thường nhanh hơn đọc code.

### (b) Tạo bản tái hiện tối thiểu

Tách bug ra một trang riêng, không có gì khác:

```tsx
// app/debug/page.tsx — XOÁ SAU KHI XONG
import { apiFetch } from '@/lib/api/server-client'

export default async function DebugPage() {
  const raw = await apiFetch<unknown>('/order/abc123', { auth: true })
  return <pre className="overflow-auto p-4 text-xs">{JSON.stringify(raw, null, 2)}</pre>
}
```

Trang này trả lời câu hỏi *"backend thực sự trả về gì?"* — thường là câu hỏi quan trọng nhất, và
thường là chỗ bug nằm (nhớ file `21`: `apiFetch<Order>` chỉ là **lời hứa**, không phải bảo đảm).

### (c) Nhị phân hoá theo tầng

Với bug "số lượng giỏ hàng sai", đặt một điểm kiểm tra ở **giữa** đường đi dữ liệu:

```
Backend → apiFetch → Server Component → prop → Client Component → DOM
                          ↑
                    log ở đây trước
```

Đúng ở đây → bug ở nửa sau (client). Sai → bug ở nửa trước (server/backend).
Mỗi lần kiểm tra loại bỏ một nửa khả năng.

---

## 11. Bộ công cụ nên cài

| Công cụ | Dùng để | Ghi chú |
| --- | --- | --- |
| **React DevTools** | Components, Profiler | Bắt buộc |
| **Chrome Performance** | Timeline + React tracks (19.2+) | Có sẵn |
| **Lighthouse** | Web Vitals lab | Có sẵn |
| **`@next/bundle-analyzer`** | Cái gì nặng trong bundle | file `22` |
| **axe DevTools** | Quét a11y tự động | file `23` — bắt ~30% |
| **Node inspector** | Debug Server Component | `NODE_OPTIONS='--inspect'` |
| **`curl` / Bruno / Postman** | Tách backend ra khỏi phương trình | Bước 1 của mọi bug dữ liệu |
| **`git bisect`** | Tìm commit gây bug | Có sẵn |

⚠️ **`why-did-you-render`** (một package phổ biến) — **không** khuyến khích cho repo này. Profiler với
"Record why each component rendered" cho cùng thông tin mà không thêm dependency và không patch React.

---

## 12. Best Practices

1. **Xác định TẦNG trước khi tìm nguyên nhân.** `curl` backend → View Source → console warning →
   DevTools. Theo thứ tự đó.

2. **Bật "Record why each component rendered"** ngay khi mở Profiler. Không có nó, flamegraph chỉ cho
   bạn *cái gì chậm*, không cho *tại sao*.

3. **`console.log` trong Server Component ra terminal.** Dùng nhãn `[SRV]`/`[CLI]` để không nhầm.

4. **Xem RSC payload (View Source) để kiểm tra rò rỉ secret.** Đây là kiểm tra bảo mật rẻ nhất bạn có.

5. **Reproduce ở `pnpm build && pnpm start` trước khi kết luận "chỉ lỗi ở production".**

6. **Thêm `x-request-id` vào `apiFetch`** để trace xuyên frontend/backend.

7. **`git bisect run pnpm test:run`** khi bug mới xuất hiện. Nhanh hơn đọc diff.

8. **Xoá dần cho tới khi bug biến mất.** Kỹ thuật thô sơ nhất và đáng tin nhất.

9. **Source map: sinh ra, upload lên monitoring, đừng deploy công khai.**

10. **Trang `/debug` tạm để xem raw response.** Câu hỏi "backend trả về gì" thường là câu quan trọng nhất.

11. **Đừng đo hiệu năng ở `pnpm dev`.** Nhắc lại lần thứ ba trong bộ tài liệu vì nó quan trọng đến vậy.

---

## Tự kiểm tra

1. Năm tầng của một bug trong App Router? Công cụ cho từng tầng?
2. Vì sao `console.log` trong Client Component xuất hiện ở **cả** terminal và browser?
3. "Highlight updates when components render" giúp bạn tìm loại vấn đề gì?
4. Trong Profiler, "Parent rendered" nghĩa là gì? Hành động tiếp theo?
5. Làm sao xem RSC payload của lần tải đầu? Của soft navigation?
6. Kiểm tra bảo mật nào bạn làm được chỉ bằng View Source?
7. Header `Next-Action` chứng minh điều gì về Server Actions?
8. Làm sao debug (đặt breakpoint) trong một Server Component?
9. Vì sao `x-request-id` quan trọng khi bug nằm ở backend?
10. `git bisect run` yêu cầu điều kiện gì để hiệu quả?

➡️ Tiếp theo: `26-forms-nang-cao.md`
