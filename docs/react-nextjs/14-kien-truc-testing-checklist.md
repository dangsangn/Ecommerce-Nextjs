# 14. Kiến trúc, Testing & Checklist tổng hợp

> **Mục tiêu:** rút ra các nguyên tắc kiến trúc từ repo này, hiểu vì sao `lib/` test được dễ dàng
> mà không cần mock, và có một checklist dùng được cho mọi PR React/Next.js.

---

## 1. Kiến trúc tầng của repo

```
app/         Route & Page      đọc params → apiFetch → truyền props        → components, actions, lib, types
components/  UI                hiển thị + tương tác, KHÔNG fetch           → actions, lib, types
actions/     Server Actions    validate → gọi API → revalidate → state     → lib, types
lib/         Logic & hạ tầng   hàm pure, HTTP client, session, schema      → types (và CHỈ types)
types/       Kiểu dùng chung   không phụ thuộc gì
```

**Phụ thuộc chỉ đi xuống.** `lib/` không import `components/`; `types/` không import gì. Chiều phụ thuộc
quyết định cái gì test được — **càng ở dưới càng dễ test**:

| Tầng | Ví dụ | Ràng buộc | Test thế nào |
| --- | --- | --- | --- |
| **Pure** | `lib/products/price.ts`, `lib/products/sku.ts`, `lib/cart/summary.ts`, `lib/comments/group.ts`, `lib/checkout/build-shop-orders.ts`, `lib/auth/gate.ts`, `lib/auth/tokens.ts`, `lib/api/http.ts`, `lib/api/client-ip.ts`, `lib/validations/*` | Không | ✅ Trực tiếp, không mock |
| **Server-only** | `lib/api/server-client.ts`, `lib/auth/session.ts` | `server-only`, `cookies()`/`headers()` | ⚠️ Mock `next/headers` |
| **Server Action** | `actions/*.ts` | `'use server'` | ⚠️ Mock `apiFetch` + `next/cache` + `next/navigation` |
| **Server Component** | `app/**/page.tsx` | async, đọc cookie | ⚠️ E2E (Playwright) |
| **Client Component** | `'use client'` | Hook, DOM | ⚠️ jsdom + React Testing Library |

**Repo test tầng đầu — và chỉ tầng đầu:** 15 file `*.test.ts`, tất cả trong `lib/`, không một
`vi.mock()`.

---

## 2. ⭐ Vì sao `lib/` test được không cần mock

### Ba tính chất làm một hàm dễ test

**(1) Input tường minh, không trạng thái ngầm.** `shouldGateShop(pathname, roles)` không tự đọc cookie;
`isExpiringSoon(payload, nowMs)` nhận thời gian làm tham số — biến một hàm cần `vi.useFakeTimers()`
thành một phép tính:

```tsx
// exp=1000s => 1_000_000ms; now=970_000ms => 30s left < 60s
expect(isExpiringSoon(p, 970_000)).toBe(true)
```

**(2) Không side-effect.** Hàm trong `lib/` (trừ hai file server-only) chỉ tính toán và trả về.

**(3) Tách logic khỏi I/O.** 📄 `lib/api/http.ts` tách `buildHeaders`/`unwrap` (pure) khỏi `apiFetch`
(📄 `lib/api/server-client.ts` — đọc cookie, gọi mạng):

```tsx
// lib/api/http.ts — PURE
export function buildHeaders(input: { apiKey: string; json?: boolean; session?: SessionHeaders; clientIp?: string }): Record<string, string>
export async function unwrap<T>(res: Response): Promise<T>
```

📄 `lib/api/__tests__/http.test.ts` test phần khó nhất (parse response, phân loại lỗi) chỉ với một object
giả đúng bề mặt `unwrap` dùng:

```tsx
function fakeRes(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

it('throws ApiError with the backend message on error', async () => {
  await expect(unwrap(fakeRes(400, { message: 'Wrong password' }))).rejects.toMatchObject({
    status: 400,
    message: 'Wrong password',
  })
})
```

Không `msw`, không `nock`, không `vi.mock`.

> **Nguyên tắc:** cần thư viện mock để test logic → hỏi "tách được logic khỏi I/O không?". Câu trả lời
> thường là có, và code tốt hơn chứ không chỉ test dễ hơn.

### Cấu hình test tối giản

📄 `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    environment: 'node',          // không jsdom
    globals: true,
    include: ['**/*.test.ts'],    // .ts, không .tsx — test logic, không test component
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
})
```

`pnpm test:run` chạy trong vài trăm ms. Test nhanh thì được chạy; suite 2 phút sẽ bị bỏ qua.
(Lưu ý repo: chạy test bằng Node 22 — với Node 20.9, Vitest 4 lỗi trước khi chạy test nào.)

### Ba pattern test đáng học

**(1) Factory cho test data** — 📄 `lib/comments/__tests__/group.test.ts`:

```tsx
const c = (over: Partial<Comment>): Comment => ({
  id: 'x', productId: 'p', userId: 'u', content: 'hi', parentId: null, replyToUserId: null, ...over,
})

const { topLevel, repliesByParent } = groupComments([
  c({ id: 'a', parentId: null }),
  c({ id: 'b', parentId: 'a', replyToUserId: 'u' }),
  c({ id: 'd', parentId: null }),
])
expect(topLevel.map((t) => t.id)).toEqual(['a', 'd'])
```

Test đọc như đặc tả; field không liên quan bị ẩn. Cùng pattern: `p()` trong `build-shop-orders.test.ts`.

**(2) Test đường xấu** — 📄 `lib/products/__tests__/price.test.ts`:

```tsx
it('falls back to 0.00 for undefined/garbage', () => {
  expect(toPriceString(undefined as unknown as number)).toBe('0.00')
  expect(toPriceString({} as never)).toBe('0.00')
})
```

Ghi lại hợp đồng "dữ liệu rác không làm crash trang". Nó bảo vệ 📄 `lib/products/price.ts`, nơi comment
giải thích vì sao hàm phức tạp: backend trả `product_price` (Mongo Decimal128) ở **ba** dạng — number,
string, `{ $numberDecimal }`. Không có comment đó, người sau sẽ "đơn giản hoá" thành `value.toFixed(2)`.

**(3) Test schema như test luật nghiệp vụ** — 📄 `lib/validations/__tests__/product.test.ts`:

```tsx
it('requires a clothing brand', () => {
  expect(productDetailsSchema.safeParse({ ...base, product_type: 'CLOTHING' }).success).toBe(false)
})
it('no longer requires color and size — they are variation axes now', () => {
  expect(productDetailsSchema.safeParse({ ...base, product_type: 'CLOTHING', brand: 'Acme' }).success).toBe(true)
})
```

Tên test là câu requirement — và test thứ hai ghi lại cả một **quyết định thay đổi** (color/size chuyển
sang SKU). Với schema có `z.coerce`, nhớ khẳng định cả **output** (`expect(r.data.x).toBe(9.99)`), không
chỉ `success`.

---

## 3. ⚠️ Khoảng trống: action, component, proxy chưa có test

| Tầng | Rủi ro nếu sửa mà không biết |
| --- | --- |
| `actions/` | Quên làm mới trang đang xem; bọc `redirect()` trong `try` → không redirect |
| `components/` | Bỏ `disabled={pending}` → double-submit; bỏ hidden input → action thiếu dữ liệu |
| `app/` | Thêm `await` tuần tự → waterfall |
| `proxy.ts` (`gate.ts` có test) | Đảo thứ tự refresh/gate → vòng lặp redirect |

Rủi ro được giảm nhờ component **mỏng** và action theo một khuôn nhất quán — logic dày đặc nhất đã ở
`lib/` và đã có test. Phân bổ hợp lý. Nhưng ba chỗ nên thêm test, theo thứ tự ưu tiên:

### (a) `proxy.ts` — tách *quyết định* khỏi *thực thi*

Proxy nhiều nhánh nhất, bug ở đây gây vòng lặp redirect hoặc đăng xuất ngẫu nhiên. Tách phần quyết định
ra hàm pure:

```tsx
// lib/auth/proxy-decision.ts
export type ProxyDecision =
  | { kind: 'login' }
  | { kind: 'refresh' }
  | { kind: 'gate'; to: string }
  | { kind: 'pass' }

export function decideProxy(input: {
  pathname: string
  accessToken?: string
  refreshToken?: string
  clientId?: string
  nowMs: number
}): ProxyDecision {
  if (!input.clientId) return { kind: 'login' }
  const payload = input.accessToken ? decodeJwt(input.accessToken) : null
  if (input.refreshToken && isExpiringSoon(payload, input.nowMs)) return { kind: 'refresh' }
  if (!payload) return { kind: 'login' }
  if (shouldGateShop(input.pathname, payload.roles)) return { kind: 'gate', to: '/seller/account' }
  return { kind: 'pass' }
}
```

`proxy.ts` chỉ còn điều phối: gọi `decideProxy` → nếu `'refresh'` thì refresh, ghi cookie, gọi lại
`decideProxy` với token mới (`refreshToken: undefined`) → map kết quả sang `redirect`/`next()`.

```tsx
// lib/auth/__tests__/proxy-decision.test.ts — fakeJwt mượn từ tokens.test.ts
const shopToken = fakeJwt({ userId: 'u1', roles: ['user', 'shop'], type: 'access', exp: 2000, iat: 0 })
const userToken = fakeJwt({ userId: 'u2', roles: ['user'], type: 'access', exp: 2000, iat: 0 })
const NOW = 1_000_000   // còn 1000s > skew 60s

it('yêu cầu refresh khi access sắp hết hạn', () => {
  expect(decideProxy({ pathname: '/seller', clientId: 'u1', accessToken: shopToken, refreshToken: 'r', nowMs: 1_990_000 }))
    .toEqual({ kind: 'refresh' })
})
it('gate non-shop khỏi /seller nhưng KHÔNG gate /seller/account', () => {
  expect(decideProxy({ pathname: '/seller/products', clientId: 'u2', accessToken: userToken, nowMs: NOW }))
    .toEqual({ kind: 'gate', to: '/seller/account' })
  expect(decideProxy({ pathname: '/seller/account', clientId: 'u2', accessToken: userToken, nowMs: NOW }))
    .toEqual({ kind: 'pass' })
})
it('login khi access token rác và không có refresh', () => {
  expect(decideProxy({ pathname: '/cart', clientId: 'u1', accessToken: 'garbage', nowMs: NOW }))
    .toEqual({ kind: 'login' })
})
```

Lợi ích không chỉ là test: thứ tự "refresh trước, gate sau" được **mã hoá** trong một hàm pure không có
`await` xen giữa.

Next 16 còn có tiện ích (experimental, từ 15.1) trong `next/experimental/testing/server` để test cả
matcher lẫn chính hàm proxy:

```ts
import { NextRequest } from 'next/server'
import { unstable_doesProxyMatch, getRedirectUrl } from 'next/experimental/testing/server'
import proxy, { config } from '@/proxy'

// Khoá matcher bằng test — ai xoá '/cart/:path*' sẽ làm test đỏ
expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: '/cart' })).toBe(true)
expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: '/products/abc' })).toBe(false)

// Chạy cả hàm proxy: không có cookie → redirect về /login
const res = await proxy(new NextRequest('http://localhost/seller'))
expect(getRedirectUrl(res)).toMatch(/\/login/)
```

### (b) `safeRedirect` — code bảo mật bắt buộc có test

```tsx
describe('safeRedirect', () => {
  it('cho phép đường dẫn nội bộ', () => expect(safeRedirect('/seller/products')).toBe('/seller/products'))
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'chặn %s', (to) => expect(safeRedirect(to)).toBe('/'),
  )
  it('chặn giá trị không phải string', () => expect(safeRedirect(null)).toBe('/'))
})
```

`it.each` gom các ca tấn công vào một bảng — thêm ca mới là thêm một dòng.

### (c) Một Server Action tiêu biểu

Cần mock, nhưng đáng cho action nhiều logic như `createDiscountAction` (`pruneEmpty`, đổi ngày sang ISO,
tách product IDs):

```tsx
// actions/__tests__/discount.actions.test.ts
vi.mock('@/lib/api/server-client', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getClientId: vi.fn(async () => 'shop-1') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

const fd = (obj: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.append(k, v)
  return f
}
const valid = {
  discount_name: 'Sale', discount_description: 'Big sale', discount_code: 'SALE10',
  discount_type: 'percentage', discount_value: '10',
  discount_start_date: '2026-08-01', discount_end_date: '2026-08-31', discount_applies_to: 'all',
}

it('từ chối percentage > 100 và KHÔNG gọi API', async () => {
  const r = await createDiscountAction(initialActionState, fd({ ...valid, discount_value: '150' }))
  expect(r.message).toMatch(/Percentage/)
  expect(apiFetch).not.toHaveBeenCalled()
})

it('bỏ field optional để trống, tách product IDs', async () => {
  vi.mocked(apiFetch).mockResolvedValue({} as never)
  await expect(createDiscountAction(initialActionState, fd({
    ...valid, discount_max_uses: '', discount_applies_to: 'specific_products', discount_product_ids: ' a , b ,, c ',
  }))).rejects.toThrow('NEXT_REDIRECT')                       // thành công → redirect() throw
  const body = vi.mocked(apiFetch).mock.calls[0][1]!.body as Record<string, unknown>
  expect(body).not.toHaveProperty('discount_max_uses')        // pruneEmpty hoạt động
  expect(body.discount_product_ids).toEqual(['a', 'b', 'c'])
})
```

4 lời gọi `vi.mock` là dấu hiệu action có nhiều phụ thuộc. Muốn dễ hơn: tách phần build-body ra hàm pure
trong `lib/`.

---

## 4. Ưu tiên cải thiện repo

Các phát hiện chính từ chương 01–13 (đã đối chiếu với code hiện tại), xếp theo **tác động ÷ công sức**.
Phát hiện từ Phần D (15–24) nằm trong chính các chương đó.

| # | Vấn đề | File | Chương |
| --- | --- | --- | --- |
| 1 | 🔴 **Open redirect** — `loginAction` đưa `redirect` từ FormData thẳng vào `redirect()` | `actions/auth.actions.ts` | 09, 12 |
| 2 | 🔴 **Upload ảnh không validate** type/size; không đặt `serverActions.bodySizeLimit` (mặc định 1MB) | `actions/product.actions.ts`, `next.config.ts` | 11 |
| 3 | 🔴 **Hủy đơn ở trang chi tiết không làm mới trang** | `actions/order.actions.ts` | 11 |
| 4 | 🔴 **Matcher thiếu `/products`** → Add to cart có thể 401 (sửa cần nhánh cho khách vãng lai) | `proxy.ts` | 12 |
| 5 | 🟠 **Không có `loading.tsx`** → route dynamic không được prefetch, bấm link không phản hồi | `app/**` | 06, 13 |
| 6 | 🟠 **Không có `error.tsx` / `notFound()`** → sản phẩm không tồn tại trả 200 | `app/**`, `products/[id]` | 09, 13 |
| 7 | 🟠 **`<img>` thay vì `next/image`** (10 file) → LCP, CLS | `components/**` | 13 |
| 8 | 🟠 **Chỉ hiện lỗi validate đầu tiên** | `actions/*` | 11 |
| 9 | 🟠 **`CommentSection` client toàn bộ** | `comment-section.tsx` | 08, 13 |
| 10 | 🟡 **Toast effect lặp ở hầu hết form** → trích `useActionToast` | `components/**` | 03 |
| 11 | 🟡 **Chưa có test cho quyết định của proxy** → `decideProxy` | `proxy.ts` | 14 |
| 12 | ❓ **Refresh token có rotation không?** Quyết định mức nghiêm trọng của race khi refresh | backend | 12 |

**Lộ trình:** nửa ngày cho #1–#4 (vài dòng mỗi cái, tác động cao) → 2 ngày cho #5–#6 (nền UX) → #7 đo
Lighthouse trước/sau → #8–#11.

---

## 5. ✅ Checklist review PR

### React

- [ ] Render pure — không side-effect, không mutate props/state? → `01`
- [ ] Không có state **tính ra được** từ props/state khác? Reset state bằng `key`, không bằng effect? → `02`
- [ ] Mỗi `useEffect` đồng bộ với một hệ thống bên ngoài cụ thể, có cleanup, deps đầy đủ? → `03`
- [ ] Không effect nào fetch data, chuyển state → state, hay đẩy dữ liệu lên cha? → `03`
- [ ] Profile **trước khi** memo hoá (hoặc để React Compiler lo)? → `04`

### Server / Client

- [ ] Mặc định Server Component; `'use client'` ở lá? → `08`
- [ ] Module chạm secret / `next/headers` có `import 'server-only'`? → `08`
- [ ] Props từ Server xuống Client serialize được? → `08`, `13`

### Routing & Data

- [ ] `searchParams` được validate/whitelist; redirect target là đường dẫn nội bộ? → `09`
- [ ] `redirect()`/`notFound()` **ngoài** `try/catch` và trước khi stream nếu cần status thật? → `09`, `13`
- [ ] Route dynamic có `loading.tsx`; vùng route có `error.tsx`? → `06`, `13`
- [ ] Fetch độc lập chạy song song? → `06`, `10`
- [ ] Dữ liệu công khai được cache + tag; dữ liệu per-user thì không? → `10`

### Server Actions

- [ ] Validate **mọi** input bằng Zod `safeParse`; kiểm tra quyền **trong** action, không dựa vào proxy? → `11`, `12`
- [ ] Upload: validate MIME/size/số lượng, `bodySizeLimit` đủ? → `11`
- [ ] Trang **đang xem** được làm mới (`revalidatePath`/`refresh()`); dữ liệu có cache dùng `updateTag`? → `11`
- [ ] Không dùng `revalidateTag(tag)` một tham số (deprecated)? → `10`, `11`
- [ ] Form sửa không mất dữ liệu khi React 19 tự reset sau action? → `11`
- [ ] Nút submit `disabled={pending}`; giữ progressive enhancement (hidden input / `bind`)? → `11`

### Proxy & Auth

- [ ] Logic proxy nằm trong hàm pure có test; `matcher` phủ mọi trang có action cần token? → `12`
- [ ] Không đặt `runtime` trong `proxy.ts`? → `12`

### Hydration & Hiệu năng

- [ ] Không `new Date()`/`Math.random()`/`window.*` trong render; ngày dùng `toISOString()` hoặc `Intl` chốt `timeZone`? → `13`
- [ ] HTML hợp lệ (không `<div>` trong `<p>`)? → `13`
- [ ] `next/image` với `sizes` khớp layout; ảnh LCP dùng `fetchPriority="high"`/`preload` (không `priority`)? → `13`
- [ ] `alt=""` cho ảnh trang trí, `alt` thật cho ảnh nội dung? → `13`, `23`

### Nâng cao (Phần D)

- [ ] `key` gắn với danh tính dữ liệu; không đổi `type` element ở cùng vị trí (mất state/focus)? → `15`
- [ ] Lỗi trong event handler/async được bắt riêng (error boundary không bắt)? Phân biệt "rỗng" với "lỗi"? Lỗi bất ngờ được **log**? → `16`
- [ ] Component tái sử dụng dùng compound / slot thay vì thêm boolean prop? → `17`
- [ ] Hook trả về hàm identity ổn định; ≥3 state phụ thuộc nhau → FSM? → `18`
- [ ] Mỗi slot parallel route có `default.tsx`? → `19`
- [ ] Route handler: authn + validate + `Cache-Control: private` cho dữ liệu riêng tư? → `20`
- [ ] Union được xử lý hết (`assertNever`, `Record<Union, T>`)? → `21`
- [ ] Đã đọc output `pnpm build`; không tạo barrel file? → `22`
- [ ] Modal/drawer: `role="dialog"`, focus trap, Escape, trả focus; active state có `aria-current`? → `23`
- [ ] Không nội suy ID chưa validate vào path/URL; không log PII? → `24`

### Testing

- [ ] Logic mới đặt trong `lib/` dạng hàm pure; thời gian/ngẫu nhiên là **tham số**? → `14`
- [ ] Có test đường xấu, không chỉ happy path? Code bảo mật bắt buộc có test? → `14`
- [ ] Phải mock nhiều → cân nhắc tách logic khỏi I/O? → `14`

---

## 6. Mười nguyên tắc rút ra từ repo này

1. **Đẩy việc xuống tầng thấp nhất xử lý được.** Filter/sort/paginate → database; fetch/format → server;
   chỉ tương tác → client.
2. **Hàm pure với input tường minh là đơn vị code tốt nhất** — test không mock, chạy mọi runtime.
3. **Tách quyết định khỏi thực thi** — `buildHeaders`/`unwrap` vs `apiFetch`; `decideProxy` vs `proxy.ts`.
4. **Chọn kiểu không biểu diễn được trạng thái sai** — `string | null` cho form reply đang mở,
   `z.discriminatedUnion` cho attribute theo loại.
5. **URL là store toàn cục miễn phí** — tab, page, filter, search: có persistence, share, back button.
6. **Coi mọi input từ client là thù địch** — `searchParams`, `FormData`, file, redirect target. Server
   Action là endpoint công khai.
7. **Comment giải thích *vì sao*** — "Runs AFTER refresh so a just-upgraded user is judged by fresh roles".
8. **Đo trước khi tối ưu** — không memo trước khi profile, không đo ở `pnpm dev`.
9. **Mỗi mutation phải trả lời: "trang nào hiển thị dữ liệu này, và trang nào đang mở?"** — bug hủy đơn
   và badge giỏ hàng đều từ câu hỏi này.
10. **Nói rõ tầng nào chịu trách nhiệm gì** — proxy = UX/route gating; backend = bảo mật; Zod = hình dạng
    dữ liệu runtime; TypeScript = compile time.

---

## 7. Bài tập thực hành

```bash
pnpm test:run && pnpm typecheck && pnpm lint
pnpm build && pnpm start      # rồi đo Lighthouse
```

1. **Sửa #3** (một dòng `revalidatePath` hoặc `refresh()`) — làm quen vòng lặp sửa-kiểm tra.
2. **Viết `safeRedirect` + test** (#1) — bảo mật kết hợp testing.
3. **Thêm `loading.tsx` cho `/orders`** (#5) — cảm nhận khác biệt khi bấm link.
4. **Chuyển `product-card.tsx` sang `next/image`** (#7) — đo Lighthouse trước/sau.
5. **Tách `decideProxy` + test** (#11) — biến code khó test thành dễ test.
6. **`useOptimistic` cho giỏ hàng** — khó nhất; chú ý bẫy `oldQuantity` ở chương 07.

---

## Tự kiểm tra

1. Vì sao `lib/` test được mà không cần một dòng `vi.mock()`?
2. Vì sao `buildHeaders`/`unwrap` được tách khỏi `apiFetch`?
3. Kể ba pattern test đáng học từ repo.
4. Bạn làm `proxy.ts` test được bằng cách nào? Next 16 có công cụ gì hỗ trợ?
5. Khi test một action có `redirect()`, vì sao phải mong đợi nó throw?
6. Bốn việc bạn làm đầu tiên nếu có nửa ngày cải thiện repo?

➡️ Tiếp theo: `15-react-internals-fiber-hooks-lanes.md` — bắt đầu Phần D (nâng cao)
