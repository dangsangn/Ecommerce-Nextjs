# 14. Kiến trúc, Testing & Checklist tổng hợp

> **Mục tiêu:** rút ra các nguyên tắc kiến trúc từ repo này, hiểu vì sao `lib/` test được dễ dàng
> mà không cần mock, và có một checklist dùng được cho mọi PR React/Next.js.

---

## 1. Kiến trúc tầng của repo

### Bản đồ phụ thuộc

```
┌─────────────────────────────────────────────────────────────────┐
│  app/  — Route & Page                                           │
│  Nhiệm vụ: đọc params → gọi apiFetch → truyền props xuống       │
│  Phụ thuộc: components/, lib/, actions/, types/                  │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│  components/  — UI                                              │
│  Nhiệm vụ: hiển thị + tương tác. KHÔNG fetch dữ liệu.           │
│  Phụ thuộc: lib/, actions/, types/                               │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│  actions/  — Server Actions (mutation)                          │
│  Nhiệm vụ: validate → gọi API → revalidate → trả ActionState    │
│  Phụ thuộc: lib/, types/                                         │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│  lib/  — Logic nghiệp vụ & hạ tầng                              │
│  Nhiệm vụ: hàm pure, HTTP client, session, validation schema     │
│  Phụ thuộc: types/  (và CHỈ types/)                              │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│  types/  — Kiểu dữ liệu chung                                   │
│  Phụ thuộc: KHÔNG PHỤ THUỘC GÌ                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Phụ thuộc chỉ đi một chiều: xuống dưới.** `lib/` không bao giờ import từ `components/`.
`types/` không import gì cả.

**Vì sao chiều phụ thuộc quan trọng đến vậy?** Vì nó quyết định cái gì test được:

- `types/` — không cần test (chỉ là kiểu)
- `lib/` — **test được không cần bất cứ setup gì** (không phụ thuộc React, DOM, Next.js)
- `actions/` — cần mock `apiFetch`, `cookies`, `revalidatePath`
- `components/` — cần DOM giả (jsdom/happy-dom) + React Testing Library
- `app/` — cần cả server runtime của Next.js

**Càng ở dưới càng dễ test.** Đó là lý do repo này đặt **toàn bộ** logic có thể sai vào `lib/`.

### Bảng phân tầng theo ràng buộc runtime

Nhắc lại từ file `08`, giờ nhìn cùng với testability:

| Tầng | File | Ràng buộc | Test được? |
| --- | --- | --- | --- |
| **Pure** | `lib/products/price.ts`, `lib/cart/summary.ts`, `lib/comments/group.ts`, `lib/checkout/build-shop-orders.ts`, `lib/orders/display.ts`, `lib/products/catalog-query.ts`, `lib/auth/gate.ts`, `lib/auth/tokens.ts`, `lib/api/http.ts`, `lib/validations/*` | Không có | ✅ **Trực tiếp, không mock** |
| **Server-only** | `lib/api/server-client.ts`, `lib/auth/session.ts` | `import 'server-only'`, `cookies()` | ⚠️ Cần mock `next/headers` |
| **Server Action** | `actions/*.ts` | `'use server'` | ⚠️ Cần mock `apiFetch` + `next/cache` |
| **Server Component** | `app/**/page.tsx`, 7 component danh sách trong `components/` | async, đọc cookie | ⚠️ Cần Next.js runtime |
| **Client Component** | `components/*` có `'use client'` | Hook, DOM | ⚠️ Cần jsdom + RTL |

**Repo test tầng đầu tiên — và chỉ tầng đầu tiên.** 12 file test, tất cả trong `lib/`, tất cả không
có một dòng `vi.mock()`.

---

## 2. ⭐ Vì sao `lib/` test được không cần mock

Đây là bài học kiến trúc quan trọng nhất của cả bộ tài liệu.

### Ba tính chất làm một hàm dễ test

**(1) Input tường minh, không có trạng thái ngầm**

📄 `lib/auth/gate.ts`:

```tsx
export function shouldGateShop(pathname: string, roles: string[] | undefined): boolean
```

Không tự đọc cookie, không tự đọc `req`. Mọi thứ nó cần đều là tham số.

📄 `lib/auth/tokens.ts`:

```tsx
export function isExpiringSoon(payload: JwtPayload | null, nowMs: number, skewSeconds = 60): boolean
```

`nowMs` là **tham số**, không phải `Date.now()` bên trong. Đây là chi tiết nhỏ nhưng quyết định — nó
biến một hàm cần `vi.useFakeTimers()` thành một hàm test bằng phép tính:

```tsx
// exp=1000s => 1_000_000ms; now=970_000ms => 30s left < 60s
expect(isExpiringSoon(p, 970_000)).toBe(true)
```

**(2) Không có side-effect**

Mọi hàm trong `lib/` (trừ hai file server-only) chỉ **tính toán và trả về**. Không log, không ghi file,
không gọi mạng, không mutate tham số.

**(3) Không phụ thuộc framework**

📄 `lib/api/http.ts` — `buildHeaders` và `unwrap` được tách khỏi `apiFetch` **cố ý**:

```tsx
// lib/api/http.ts — PURE, test được
export function buildHeaders(input: { apiKey: string; json?: boolean; session?: SessionHeaders }): Record<string, string>
export async function unwrap<T>(res: Response): Promise<T>

// lib/api/server-client.ts — có side-effect (cookies, fetch), KHÔNG test được dễ
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T>
```

Đây là một quyết định thiết kế xuất sắc: **phần logic (build header, parse response, phân loại lỗi)
được tách khỏi phần I/O (đọc cookie, gọi mạng)**.

Kết quả — 📄 `lib/api/__tests__/http.test.ts` test được logic phức tạp nhất mà chỉ cần một object giả
đơn giản:

```tsx
function fakeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('unwrap', () => {
  it('returns data on a 2xx response', async () => {
    const data = await unwrap<{ x: number }>(fakeRes(200, { message: 'OK', statusCode: 200, data: { x: 1 } }))
    expect(data).toEqual({ x: 1 })
  })
  it('returns the raw body when there is no data field', async () => {
    const data = await unwrap<{ y: number }>(fakeRes(200, { y: 2 }))
    expect(data).toEqual({ y: 2 })
  })
  it('throws ApiError with the backend message on error', async () => {
    await expect(unwrap(fakeRes(400, { message: 'Wrong password' }))).rejects.toMatchObject({
      status: 400,
      message: 'Wrong password',
    })
  })
  it('throws ApiError with a default message when the body cannot be parsed', async () => {
    const res = { ok: false, status: 500, json: async () => { throw new Error('bad') } } as unknown as Response
    await expect(unwrap(res)).rejects.toBeInstanceOf(ApiError)
  })
})
```

**`fakeRes` là 7 dòng.** Không `msw`, không `nock`, không `vi.mock('node-fetch')`. Vì `unwrap` chỉ cần
một object có `ok`, `status`, và `json()` — đúng bề mặt nó dùng.

> **Nguyên tắc:** nếu bạn cần một thư viện mock để test logic của mình, hãy tự hỏi: *"có thể tách phần
> logic ra khỏi phần I/O không?"* Câu trả lời thường là có, và kết quả là code tốt hơn — không chỉ
> test dễ hơn.

### Cấu hình test tối giản

📄 `vitest.config.ts` — 14 dòng:

```tsx
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',        // ← không cần jsdom!
    globals: true,
    include: ['**/*.test.ts'],   // ← .ts, không .tsx
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
```

**`environment: 'node'`** — không cài jsdom, không setup DOM. Test chạy trong Node thuần.

**`include: ['**/*.test.ts']`** — chỉ `.ts`, không `.tsx`. Đây là một quyết định rõ ràng: chúng ta test
logic, không test component.

Hệ quả: `pnpm test:run` chạy trong **vài trăm millisecond**. Test nhanh nghĩa là test được chạy —
một suite mất 2 phút sẽ bị bỏ qua.

### Ba pattern test đáng học

**(1) Factory function cho test data**

📄 `lib/comments/__tests__/group.test.ts`:

```tsx
const c = (over: Partial<Comment>): Comment => ({
  id: 'x', productId: 'p', userId: 'u', content: 'hi', parentId: null, replyToUserId: null, ...over,
})

// Dùng: chỉ khai báo field QUAN TRỌNG cho test này
const { topLevel, repliesByParent } = groupComments([
  c({ id: 'a', parentId: null }),
  c({ id: 'b', parentId: 'a', replyToUserId: 'u' }),
  c({ id: 'd', parentId: null }),
])
```

Test đọc như đặc tả: *"a là top-level, b là reply của a, d là top-level"*. Các field không liên quan
(`content`, `thumb`, `productId`) bị ẩn đi.

📄 Cùng pattern ở `build-shop-orders.test.ts`:

```tsx
const p = (over: Partial<CartProduct>): CartProduct => ({
  productId: 'p', shopId: 's1', name: 'n', thumb: '', price: 10, quantity: 1, ...over,
})
```

**(2) Test cả đường xấu, không chỉ đường tốt**

📄 `lib/products/__tests__/price.test.ts`:

```tsx
describe('toPriceString', () => {
  it('formats a plain number', () => {
    expect(toPriceString(9.5)).toBe('9.50')
  })
  it('formats a Decimal128 JSON object', () => {
    expect(toPriceString({ $numberDecimal: '9.99' })).toBe('9.99')
  })
  it('formats a numeric string', () => {
    expect(toPriceString('12')).toBe('12.00')
  })
  it('falls back to 0.00 for undefined/garbage', () => {
    expect(toPriceString(undefined as unknown as number)).toBe('0.00')
    expect(toPriceString({} as never)).toBe('0.00')
  })
})
```

Test cuối là quan trọng nhất. Nó ghi lại một **hợp đồng**: *"dữ liệu rác không làm crash trang, nó
hiển thị 0.00."*

Đó chính là điều `toPriceString` được thiết kế cho — 📄 `lib/products/price.ts`:

```tsx
// Backend serializes product_price from Mongo Decimal128 as a number, a string,
// or { $numberDecimal: "9.99" }. Normalize any of them to a fixed-2 display string.
export function toPriceString(value: Decimal): string {
  let n: number
  if (typeof value === 'number') n = value
  else if (typeof value === 'string') n = Number(value)
  else if (value && typeof value === 'object' && '$numberDecimal' in value)
    n = Number(value.$numberDecimal)
  else n = NaN
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}
```

Comment giải thích **vì sao** hàm này phức tạp: backend trả cùng một field ở **ba** định dạng khác nhau.
Không có comment đó, người sau sẽ "đơn giản hoá" thành `value.toFixed(2)` và làm vỡ hai trong ba trường hợp.

**(3) Test schema như test luật nghiệp vụ**

📄 `lib/validations/__tests__/product.test.ts`:

```tsx
const base = { product_name: 'Tee', product_price: '9.99', product_quantity: '5' }

describe('productDetailsSchema', () => {
  it('coerces numeric strings and accepts valid clothing', () => {
    const r = productDetailsSchema.safeParse({
      ...base, product_type: 'CLOTHING', brand: 'Acme', color: 'Red', size: 'M',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.product_price).toBe(9.99)     // ← kiểm tra COERCION, không chỉ validation
      expect(r.data.product_quantity).toBe(5)
    }
  })
  it('requires clothing brand/color/size', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'CLOTHING', brand: 'Acme' }).success).toBe(false)
  })
  it('accepts valid electronics (manufacturer required, model optional)', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'ELECTRONICS', manufacturer: 'Sony' }).success).toBe(true)
  })
  it('rejects a non-creatable type', () => {
    expect(productDetailsSchema.safeParse({ ...base, product_type: 'SHOES' }).success).toBe(false)
  })
})
```

Hai điểm đáng học:

- **Kiểm tra `r.data.product_price` là `9.99` (number), không phải `'9.99'` (string).** Input là chuỗi
  từ form; test khẳng định `z.coerce.number()` đã hoạt động. Nhiều người chỉ test `success === true` và
  bỏ mất phần coercion.
- **Tên test là câu tả luật nghiệp vụ.** `'requires clothing brand/color/size'` đọc như một dòng
  requirement. Khi test này đỏ, bạn biết ngay luật nào bị vi phạm.

---

## 3. ⚠️ Khoảng trống: không có test cho component và action

### Điều gì chưa được bảo vệ

| Tầng | Có test? | Rủi ro cụ thể nếu sửa mà không biết |
| --- | --- | --- |
| `lib/` (pure) | ✅ 12 file | — |
| `actions/` | ❌ | Đổi `revalidatePath` → dữ liệu cũ; đổi thứ tự try/catch → redirect không chạy |
| `components/` | ❌ | Bỏ `disabled={pending}` → double-submit; bỏ hidden input → action thiếu dữ liệu |
| `app/` (page) | ❌ | Đổi `await` → waterfall; bỏ `try/catch` → trang trắng |
| `proxy.ts` | ❌ (nhưng `gate.ts` có) | Đảo thứ tự refresh/gate → vòng lặp redirect |

### Đánh giá công bằng: đây có phải vấn đề?

**Không hoàn toàn.** Cách repo tổ chức làm cho việc "không test tầng trên" bớt rủi ro:

- Component **rất mỏng** (`SubmitButton` 12 dòng, `CancelOrderButton` 21 dòng) — ít chỗ để sai
- Action theo một khuôn **rất nhất quán** (validate → apiFetch → revalidate → return) — dễ review bằng mắt
- **Toàn bộ logic có thể sai** đã ở `lib/` và đã có test

Đây là một sự phân bổ nỗ lực hợp lý: test ở nơi có mật độ logic cao nhất.

**Nhưng có ba chỗ nên thêm test**, theo thứ tự ưu tiên:

### (a) Test cho `proxy.ts` — rủi ro cao nhất

Đây là code có nhiều nhánh nhất, và bug ở đây gây vòng lặp redirect hoặc đăng xuất ngẫu nhiên —
những thứ khó chẩn đoán nhất.

Vấn đề: `proxy.ts` gọi `fetch` và dùng `NextRequest`/`NextResponse`. Cách xử lý: **tách logic quyết
định ra một hàm pure**, giữ `proxy.ts` chỉ điều phối:

```tsx
// lib/auth/proxy-decision.ts — PURE, test được
import { decodeJwt, isExpiringSoon } from '@/lib/auth/tokens'
import { shouldGateShop } from '@/lib/auth/gate'
import type { JwtPayload } from '@/types/api'

export type ProxyDecision =
  | { kind: 'login' }                                     // redirect về /login, xoá cookie
  | { kind: 'refresh' }                                    // cần gọi refresh trước khi quyết định
  | { kind: 'gate'; to: string }                           // redirect tới trang khác
  | { kind: 'pass' }                                       // cho đi tiếp

export function decideProxy(input: {
  pathname: string
  accessToken?: string
  refreshToken?: string
  clientId?: string
  nowMs: number                                            // ← tham số, không phải Date.now()
}): ProxyDecision {
  if (!input.clientId) return { kind: 'login' }

  const payload: JwtPayload | null = input.accessToken ? decodeJwt(input.accessToken) : null

  if (input.refreshToken && isExpiringSoon(payload, input.nowMs)) {
    return { kind: 'refresh' }
  }
  if (!payload) return { kind: 'login' }
  if (shouldGateShop(input.pathname, payload.roles)) {
    return { kind: 'gate', to: '/seller/account' }
  }
  return { kind: 'pass' }
}
```

`proxy.ts` trở thành lớp điều phối mỏng:

```tsx
export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const clientId = req.cookies.get(COOKIE.CLIENT)?.value
  const refreshToken = req.cookies.get(COOKIE.REFRESH)?.value
  let accessToken = req.cookies.get(COOKIE.ACCESS)?.value
  const res = NextResponse.next()

  let decision = decideProxy({
    pathname: req.nextUrl.pathname,
    accessToken, refreshToken, clientId, nowMs: Date.now(),
  })

  if (decision.kind === 'refresh') {
    const tokens = await refreshTokens(clientId!, refreshToken!)
    if (!tokens) return redirectToLogin(req)
    writeCookies(res, tokens, clientId!)
    accessToken = tokens.accessToken
    // Quyết định lại với token mới — bây giờ đã có roles cập nhật
    decision = decideProxy({
      pathname: req.nextUrl.pathname,
      accessToken, refreshToken: undefined, clientId, nowMs: Date.now(),
    })
  }

  if (decision.kind === 'login') return redirectToLogin(req)
  if (decision.kind === 'gate') return NextResponse.redirect(new URL(decision.to, req.url))
  return res
}
```

Và test được toàn bộ ma trận quyết định mà không cần một mock nào:

```tsx
// lib/auth/__tests__/proxy-decision.test.ts
import { describe, it, expect } from 'vitest'
import { decideProxy } from '@/lib/auth/proxy-decision'

// Helper tạo JWT giả (mượn từ tokens.test.ts)
function fakeJwt(payload: object): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`
}

const shopToken = fakeJwt({ userId: 'u1', email: 'a@b.c', roles: ['user', 'shop'], type: 'access', exp: 2000, iat: 0 })
const userToken = fakeJwt({ userId: 'u2', email: 'd@e.f', roles: ['user'],         type: 'access', exp: 2000, iat: 0 })
const NOW = 1_000_000    // exp=2000s => 2_000_000ms, còn 1000s > skew 60s

describe('decideProxy', () => {
  it('đẩy về login khi không có clientId', () => {
    expect(decideProxy({ pathname: '/seller', nowMs: NOW })).toEqual({ kind: 'login' })
  })

  it('yêu cầu refresh khi access sắp hết hạn và có refresh token', () => {
    expect(decideProxy({
      pathname: '/seller', clientId: 'u1', accessToken: shopToken,
      refreshToken: 'r', nowMs: 1_990_000,        // còn 10s < skew 60s
    })).toEqual({ kind: 'refresh' })
  })

  it('KHÔNG refresh khi token còn nhiều thời gian', () => {
    expect(decideProxy({
      pathname: '/seller', clientId: 'u1', accessToken: shopToken, refreshToken: 'r', nowMs: NOW,
    })).toEqual({ kind: 'pass' })
  })

  it('gate non-shop khỏi /seller', () => {
    expect(decideProxy({
      pathname: '/seller/products', clientId: 'u2', accessToken: userToken, nowMs: NOW,
    })).toEqual({ kind: 'gate', to: '/seller/account' })
  })

  it('KHÔNG gate /seller/account — nâng cấp phải vào được', () => {
    expect(decideProxy({
      pathname: '/seller/account', clientId: 'u2', accessToken: userToken, nowMs: NOW,
    })).toEqual({ kind: 'pass' })
  })

  it('cho shop đi tiếp', () => {
    expect(decideProxy({
      pathname: '/seller/products', clientId: 'u1', accessToken: shopToken, nowMs: NOW,
    })).toEqual({ kind: 'pass' })
  })

  it('đẩy về login khi có clientId nhưng access token rác và không có refresh', () => {
    expect(decideProxy({
      pathname: '/cart', clientId: 'u1', accessToken: 'garbage', nowMs: NOW,
    })).toEqual({ kind: 'login' })
  })
})
```

**Lợi ích không chỉ là test.** Việc tách `decideProxy` làm luồng quyết định trở nên **đọc được**:
bốn kết cục, một hàm, không có `await` xen giữa. Bug "gate chạy trước refresh" trở nên không thể xảy ra
vì thứ tự được mã hoá trong hàm pure.

> **Đây là mẫu chung để test bất cứ thứ gì "khó test":** tách phần *quyết định* (pure) khỏi phần
> *thực thi* (I/O). Test phần quyết định. Phần thực thi mỏng đến mức review bằng mắt là đủ.

### (b) Test cho `safeRedirect` (nếu bạn thêm nó — file `09`)

Đây là code bảo mật. Code bảo mật **phải** có test:

```tsx
describe('safeRedirect', () => {
  it('cho phép đường dẫn nội bộ', () => {
    expect(safeRedirect('/seller/products')).toBe('/seller/products')
  })
  it('chặn URL tuyệt đối', () => {
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('http://evil.example')).toBe('/')
  })
  it('chặn protocol-relative', () => {
    expect(safeRedirect('//evil.example')).toBe('/')
  })
  it('chặn backslash trick', () => {
    expect(safeRedirect('/\\evil.example')).toBe('/')
  })
  it('chặn javascript:', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })
  it('chặn giá trị không phải string', () => {
    expect(safeRedirect(null)).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(123)).toBe('/')
  })
})
```

### (c) Test cho một Server Action tiêu biểu

Cần mock, nhưng vẫn đáng cho các action phức tạp như `createDiscountAction` (có `pruneEmpty`, chuyển
đổi ngày, tách product IDs):

```tsx
// actions/__tests__/discount.actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api/server-client', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getClientId: vi.fn(async () => 'shop-1') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

import { apiFetch } from '@/lib/api/server-client'
import { createDiscountAction } from '@/actions/discount.actions'
import { initialActionState } from '@/actions/state'

function fd(obj: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.append(k, v)
  return f
}

const valid = {
  discount_name: 'Sale', discount_description: 'Big sale', discount_code: 'SALE10',
  discount_type: 'percentage', discount_value: '10',
  discount_start_date: '2026-08-01', discount_end_date: '2026-08-31',
  discount_applies_to: 'all',
}

describe('createDiscountAction', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('từ chối percentage > 100', async () => {
    const r = await createDiscountAction(initialActionState, fd({ ...valid, discount_value: '150' }))
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/Percentage/)
    expect(apiFetch).not.toHaveBeenCalled()      // ← không gọi API khi validate fail
  })

  it('từ chối end date trước start date', async () => {
    const r = await createDiscountAction(
      initialActionState,
      fd({ ...valid, discount_start_date: '2026-08-31', discount_end_date: '2026-08-01' }),
    )
    expect(r.ok).toBe(false)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('bỏ field optional để trống thay vì gửi chuỗi rỗng', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)
    await createDiscountAction(initialActionState, fd({ ...valid, discount_max_uses: '' }))
      .catch(() => {})   // redirect() throw NEXT_REDIRECT
    const body = vi.mocked(apiFetch).mock.calls[0][1]!.body as Record<string, unknown>
    expect(body).not.toHaveProperty('discount_max_uses')      // pruneEmpty đã hoạt động
    expect(body.discount_start_date).toBe(new Date('2026-08-01').toISOString())
  })

  it('tách product IDs khi applies_to = specific_products', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)
    await createDiscountAction(initialActionState, fd({
      ...valid,
      discount_applies_to: 'specific_products',
      discount_product_ids: ' a , b ,, c ',
    })).catch(() => {})
    const body = vi.mocked(apiFetch).mock.calls[0][1]!.body as Record<string, unknown>
    expect(body.discount_product_ids).toEqual(['a', 'b', 'c'])   // trim + bỏ rỗng
  })
})
```

Chú ý `.catch(() => {})` — vì `redirect()` throw `NEXT_REDIRECT`. Đây là chi tiết bạn phải xử lý khi
test bất kỳ action nào có redirect.

⚖️ **Trade-off của test này:** nó cần 4 lời gọi `vi.mock`. Đó là dấu hiệu action có nhiều phụ thuộc.
Nếu bạn muốn test dễ hơn, có thể tách phần build-body ra một hàm pure ở `lib/` — nhưng với một action
thì mock là chấp nhận được.

---

## 4. Tổng hợp phát hiện — danh sách ưu tiên

Đây là toàn bộ vấn đề tìm thấy qua 13 chương, xếp theo **tác động ÷ công sức**.

### 🔴 Ưu tiên 1 — Bảo mật & lỗi chức năng

| # | Vấn đề | File | Chương | Công sức |
| --- | --- | --- | --- | --- |
| 1 | **Open redirect** — `redirect` từ URL đi thẳng vào `redirect()` | `login/page.tsx` + `auth.actions.ts` | `09` | 30 phút |
| 2 | **Cancel order không refresh trang chi tiết** | `order.actions.ts` | `10` | 1 dòng |
| 3 | **Không validate file upload** (kích thước, MIME, số lượng) | `product.actions.ts`, `user.actions.ts` | `11` | 1 giờ |
| 4 | **Badge giỏ hàng không cập nhật** sau add/remove | `cart.actions.ts` | `09`, `10` | 1 dòng hoặc dùng tag |
| 5 | **`console.log('🚀 ~ files:', files)`** log dữ liệu người dùng | `product.actions.ts` | `11` | 1 dòng |
| 6 | **`SearchBox` mất giá trị** sau khi tìm kiếm | `store-header.tsx`, `search-box.tsx` | `02` | 30 phút |

### 🟠 Ưu tiên 2 — UX & Hiệu năng

| # | Vấn đề | File | Chương | Công sức |
| --- | --- | --- | --- | --- |
| 7 | **`<img>` thay vì `next/image`** (9 chỗ) → LCP, CLS | 9 file | `13` | 3 giờ |
| 8 | **Không có `loading.tsx`** → navigate không có phản hồi | `app/**` | `06`, `09` | 2 giờ |
| 9 | **Không có `error.tsx`** → lỗi ngoài `try` cho trang trắng | `app/**` | `06`, `09` | 1 giờ |
| 10 | **Không dùng `notFound()`** → soft 404, SEO xấu | `products/[id]`, `orders/[id]` | `09` | 1 giờ |
| 11 | **Waterfall product + comments** (300ms → 150ms) | `products/[id]/page.tsx` | `06`, `10` | 30 phút |
| 12 | **Giỏ hàng không optimistic** → chờ 460ms mỗi lần bấm +/− | `cart-line.tsx` | `07` | 3 giờ |
| 13 | **Metadata sai cho storefront** ("Seller dashboard") | `app/layout.tsx` | `09` | 1 giờ |
| 14 | **Không cache dữ liệu công khai** dù `tags` đã sẵn sàng | `lib/api/server-client.ts` + call site | `10` | 2 giờ |
| 15 | **Chỉ hiện lỗi validate đầu tiên** | `actions/state.ts` + 20 action | `11` | 4 giờ |

### 🟡 Ưu tiên 3 — Chất lượng code

| # | Vấn đề | File | Chương | Công sức |
| --- | --- | --- | --- | --- |
| 16 | **17 chỗ trùng lặp toast effect** → trích `useActionToast` | `components/**` | `03` | 1 giờ |
| 17 | **`ImageUploader` đẩy state lên cha bằng effect** | `image-uploader.tsx` | `03` | 1 giờ |
| 18 | **`ThemeProvider` bị thiếu** → dark mode không hoạt động | `app/layout.tsx` | `05` | 15 phút |
| 19 | **Hardcode `id` thay vì `useId`** | `components/**` form | `05` | 2 giờ |
| 20 | **`CommentSection` client toàn bộ** (164 dòng cho 1 state) | `comment-section.tsx` | `08`, `13` | 3 giờ (có trade-off) |
| 21 | **Chưa có test cho `proxy.ts`** → tách `decideProxy` | `proxy.ts` | `14` | 2 giờ |
| 22 | **Matcher thiếu `/products`** → Add to cart có thể 401 | `proxy.ts` | `12` | 15 phút |
| 23 | **Race condition khi refresh token** | `proxy.ts` | `12` | Cần bàn với backend |
| 24 | **Luật attribute lặp ở Zod và JSX** | `validations/product.ts` + `attribute-fields.tsx` | `11` | 2 giờ |

### Lộ trình đề xuất

**Sprint 1 (nửa ngày):** #1, #2, #4, #5, #18, #22 — toàn bộ đều là sửa vài dòng, tác động cao.

**Sprint 2 (2 ngày):** #8, #9, #10, #11, #13 — UX foundation. Sau sprint này app cảm giác "hoàn thiện".

**Sprint 3 (3 ngày):** #7, #14 — hiệu năng. Đo Lighthouse trước/sau.

**Sprint 4 (3 ngày):** #12, #15, #16 — độ mượt và chất lượng code.

### 🔵 Phát hiện từ Phần D (nâng cao)

Các chương `15`–`24` tìm ra thêm những vấn đề sau. Chúng được xếp riêng vì phần lớn cần hiểu nền tảng
ở Phần A–C trước khi sửa.

| # | Vấn đề | File | Chương | Công sức |
| --- | --- | --- | --- | --- |
| 25 | **Path traversal** — 10/11 `apiFetch` nội suy ID thô vào path | mọi page + action | `24` | 3 giờ |
| 26 | **`lang="en"`** cho nội dung tiếng Việt — screen reader đọc sai giọng | `app/layout.tsx` | `23` | 1 phút |
| 27 | **Drawer mobile không có focus trap / Escape / `role="dialog"`** | `seller-mobile-nav.tsx` | `23` | 2 giờ |
| 28 | **`pointer-events-none` không chặn bàn phím** — Tab vào link disabled | `product-grid.tsx`, `product-list.tsx` | `23` | 1 giờ |
| 29 | **Không rate limit** `resendOtp` / `login` / `signup` | `auth.actions.ts` | `24` | 2 giờ |
| 30 | **Không có CSP**, và proxy matcher không phủ storefront | `proxy.ts` | `24` | 4 giờ |
| 31 | **Pagination trùng lặp 2 chỗ** + thiếu `<nav aria-label>` | `product-grid.tsx`, `product-list.tsx` | `17` | 2 giờ |
| 32 | **Tab thiếu `aria-current`** — trạng thái active chỉ có màu | `product-list.tsx` | `23` | 10 phút |
| 33 | **Thiếu skip link** — Tab qua 8 element mỗi trang | `app/layout.tsx` | `23` | 15 phút |
| 34 | **ID không có branded type** — `commentId`/`productId` đổi chỗ vẫn compile | `types/*` | `21` | 4 giờ |
| 35 | **`statusVariant(status: string)`** — typo không bị bắt | `lib/orders/display.ts` | `21` | 15 phút |
| 36 | **`method: string`** trong checkout — `'BITCOIN'` compile được | `checkout-wizard.tsx` | `21` | 30 phút |
| 37 | **Font thiếu `latin-ext`** — chữ có dấu fallback sang font hệ thống | `app/layout.tsx` | `22` | 5 phút |
| 38 | **`errorMessage` chôn lỗi không mong đợi** — không log gì | `lib/api/error-message.ts` | `16` | 5 phút |
| 39 | **`catch { comments = [] }`** — người dùng nghĩ chưa có comment, thực ra API lỗi | `products/[id]/page.tsx` | `16` | 30 phút |
| 40 | **`CardTitle` render `<div>`** — không xuất hiện trong danh sách heading | `card.tsx` + call site | `23` | 1 giờ |
| 41 | **Chưa có test cho `proxy.ts`** — tách `decideProxy` | `proxy.ts` | `14` | 2 giờ |
| 42 | **`checkout-wizard` chưa là FSM** — trạng thái vô nghĩa biểu diễn được | `checkout-wizard.tsx` | `18` | 4 giờ |
| 43 | **Thiếu `prefers-reduced-motion`** | `globals.css` | `23` | 15 phút |
| 44 | **Chưa validate response API bằng Zod** — `apiFetch<Order>` là lời hứa, không phải bảo đảm | `lib/api/*` | `21` | 4 giờ |

### 🟣 Phát hiện từ Phần E (thực chiến)

| # | Vấn đề | File | Chương | Công sức |
| --- | --- | --- | --- | --- |
| 49 | **Giá tiền format như USD** (`toFixed(2)`) — VND hiện `250000.00` | `lib/products/price.ts` (dùng ở 9 file) | `27` | 2 giờ |
| 50 | **`API_KEY!` không validate** — thiếu env var gây lỗi 401 bí ẩn | `lib/api/server-client.ts` | `28` | 1 giờ |
| 51 | **Không có `output: 'standalone'`** — image Docker lớn 5-10× | `next.config.ts` | `28` | 2 giờ |
| 52 | **Không có health/readiness endpoint** | `app/api/` | `28` | 1 giờ |
| 53 | **Upload ảnh không có progress** — chờ 30s không phản hồi | `image-uploader.tsx` | `26` | 4 giờ |
| 54 | **Không có E2E cho luồng mua hàng** | `e2e/` | `29` | 8 giờ |
| 55 | **Log không structured** — không query được | `lib/observability/` | `28` | 2 giờ |
| 56 | **`formatDate` trùng 3 chỗ** (2 bản copy của `lib/orders/display.ts`) | `comment-section.tsx`, `discount-list.tsx` | `27` | 30 phút |
| 57 | **`types/` là bản sao thủ công của DTO backend**, không được kiểm tra | `types/*` | `30` | 4 giờ (Zod) |
| 58 | **Form không có autosave** — đóng tab là mất hết | `create-product-form.tsx` | `26` | 3 giờ |
| 59 | **Wizard checkout mất state khi F5** | `checkout-wizard.tsx` | `26` | 2 giờ |
| 60 | **`setSession` không ghi rõ chỉ gọi được từ Action** | `lib/auth/session.ts` | `30` | 5 phút |
| 61 | **`RefreshData` là dead code** | `types/api.ts` | `30` | 5 phút |
| 62 | **Không có sản phẩm nhiều biến thể** (size/màu) | `create-product-form.tsx` | `26` | 6 giờ (tính năng) |

⚠️ **#49 phải xác nhận đơn vị tiền với backend TRƯỚC KHI sửa** (file `27`, mục 1). Nếu backend lưu USD
thì code hiện tại **đúng** và không cần đổi gì.

### Cần xác nhận với backend team (không sửa được một mình)

| # | Câu hỏi | Vì sao quan trọng | Chương |
| --- | --- | --- | --- |
| 45 | Backend có kiểm tra **ownership** cho mọi mutation? | Đây là lớp bảo mật DUY NHẤT chống IDOR hiện tại | `24` |
| 46 | Refresh token có **rotation**? Có grace window? | Quyết định mức nghiêm trọng của race condition khi refresh | `12` |
| 47 | Rate limit có ở tầng backend/WAF chưa? | Rate limit ở BFF gần vô dụng trên serverless | `24` |
| 48 | API `PATCH /cart/quantity` là **delta** hay **absolute**? | Quyết định `useOptimistic` có an toàn không | `07` |
| 49 | `product_price` lưu bằng **VND hay USD**? Đồng hay nghìn đồng? | Quyết định cách format tiền — hiện đang format như USD | `27` |
| 50 | Backend có **OpenAPI/Swagger** không? | Quyết định cách chia sẻ type (codegen vs Zod tay) | `30` |

**#45, #48 và #49 là ba câu quan trọng nhất.** Nếu #45 là "không đầy đủ" → repo có lỗ hổng IDOR thật.
Nếu #48 là "delta" → phải cẩn thận với optimistic UI và tuyệt đối không retry.

### Lộ trình mở rộng (sau 4 sprint ở trên)

**Sprint 5 (nửa ngày) — quick wins từ Phần D:** #26, #33, #37, #38, #32, #35, #43.
Bảy việc, tổng ~1 giờ code, tác động rõ rệt.

**Sprint 6 (2 ngày) — security:** #25, #29, #45–#48 (hỏi backend trước).

**Sprint 7 (2 ngày) — a11y:** #27, #28, #40.

**Sprint 8 (3 ngày) — type safety:** #34, #36, #44.

**Sprint 9 (2 ngày) — kiến trúc:** #41, #42, #31.

**Sprint 10 (nửa ngày) — quick wins Phần E:** #56, #60, #61, và #49 *sau khi* xác nhận đơn vị tiền.

**Sprint 11 (2 ngày) — production readiness:** #50, #51, #52, #55.

**Sprint 12 (2 ngày) — lưới an toàn:** #54 (E2E luồng mua hàng), #57 (Zod ở ranh giới).

**Sprint 13 (2 ngày) — UX form:** #53, #58, #59.

---

## 5. ✅ Checklist review PR

Dùng cho mọi PR React/Next.js. Mỗi dòng liên kết tới chương giải thích.

### React cơ bản

- [ ] Render là hàm pure? Không side-effect, không mutate props/state? → `01`
- [ ] Dùng updater function khi giá trị mới phụ thuộc giá trị cũ? → `02`
- [ ] Có state nào **tính ra được** từ props/state khác? (nên xoá) → `02`
- [ ] State đặt ở component thấp nhất còn thấy mọi consumer? → `02`
- [ ] Reset state khi prop đổi bằng `key`, không bằng `useEffect`? → `02`
- [ ] Kiểu state hẹp nhất có thể? (`string | null` thay vì `Record<string, boolean>`) → `02`

### useEffect

- [ ] Mỗi `useEffect` đồng bộ với một **hệ thống bên ngoài** cụ thể? → `03`
- [ ] Có cleanup, và cleanup khôi phục giá trị **trước đó**? → `03`
- [ ] Dependency array đầy đủ? Không xoá dep để "chạy ít hơn"? → `03`
- [ ] Không có `useEffect` nào chỉ để `setState` từ state khác? → `03`
- [ ] Không có `useEffect` nào fetch data (dùng Server Component)? → `03`
- [ ] Không có `useEffect` nào đẩy dữ liệu lên cha? → `03`

### Hiệu năng

- [ ] Đã profile **trước khi** thêm memo hoá? → `04`
- [ ] Hằng số ở tầng module, không trong component? → `04`
- [ ] Nếu có `memo`, **mọi** prop non-primitive đều được memo hoá? → `04`
- [ ] Đã thử "đưa state xuống thấp" trước khi `memo`? → `04`

### Server / Client

- [ ] Mặc định là Server Component, chỉ `'use client'` khi buộc phải? → `08`
- [ ] `'use client'` ở lá, không ở page/layout? → `08`
- [ ] Module chạm secret / `next/headers` có `import 'server-only'`? → `08`
- [ ] `lib/` giữ pure, không import `next/headers`? → `08`
- [ ] Dữ liệu chứa function/component đi qua `import`, không qua prop? → `08`

### Routing & Data

- [ ] Mọi giá trị từ `searchParams` được validate/whitelist/encode? → `09`
- [ ] Redirect target được kiểm tra là đường dẫn nội bộ? → `09`
- [ ] `redirect()`/`notFound()` gọi **ngoài** `try/catch`? → `09`
- [ ] Route có fetch → có `loading.tsx`? → `06`, `09`
- [ ] Vùng route → có `error.tsx`? → `06`, `09`
- [ ] "Không tìm thấy" dùng `notFound()`, không render inline? → `09`
- [ ] Các fetch độc lập chạy song song (`Promise.allSettled`)? → `06`, `10`
- [ ] Dữ liệu công khai được cache + tag? Dữ liệu per-user thì không? → `10`

### Server Actions

- [ ] Validate **mọi** input bằng Zod `safeParse`? → `11`
- [ ] Kiểm tra quyền trong action, không chỉ dựa vào proxy? → `11`, `12`
- [ ] File upload có validate MIME, kích thước, số lượng? → `11`
- [ ] `revalidatePath`/`revalidateTag` phủ **mọi** trang hiển thị dữ liệu này? → `10`, `11`
- [ ] Dữ liệu hiện trong **layout** → dùng `revalidatePath(path, 'layout')`? → `09`, `10`
- [ ] Form dùng hidden input (không `.bind()`) để giữ progressive enhancement? → `11`
- [ ] Nút submit có `disabled={pending}` để chống double-submit? → `11`

### Hydration & Hiệu năng render

- [ ] Không có `new Date()`, `Math.random()`, `window.*` trong render? → `13`
- [ ] Format ngày dùng `toISOString()` hoặc `Intl` chốt `timeZone`? → `13`
- [ ] HTML hợp lệ (không `<div>` trong `<p>`)? → `13`
- [ ] Ảnh dùng `next/image` với `sizes` khớp layout thật? → `13`
- [ ] Ảnh LCP có `priority`? Chỉ 1–2 ảnh? → `13`
- [ ] `alt=""` cho ảnh trang trí, `alt` thật cho ảnh nội dung? → `13`

### Nâng cao (Phần D)

- [ ] `key` gắn với danh tính dữ liệu, không phải index? → `15`
- [ ] Không đổi `type` của element có điều kiện ở cùng vị trí (mất state/focus)? → `15`
- [ ] Event handler làm việc thật được bọc `guard` (error boundary không bắt được)? → `16`
- [ ] Phân biệt "rỗng" với "lỗi" trong UI? → `16`
- [ ] Lỗi không mong đợi được **log** trước khi biến thành message thân thiện? → `16`
- [ ] Component tái sử dụng dùng compound / `render` prop thay vì thêm prop? → `17`
- [ ] Hằng số ở tầng module, dùng `satisfies` để giữ literal type? → `17`, `21`
- [ ] Hook trả về hàm có identity ổn định (`useCallback` + updater form)? → `18`
- [ ] ≥3 state phụ thuộc nhau → cân nhắc FSM với discriminated union? → `18`
- [ ] Mỗi slot parallel route có `default.tsx`? → `19`
- [ ] Route handler: authn + validate + `Cache-Control: private` cho dữ liệu riêng tư? → `20`
- [ ] Mọi kiểm tra có thể thất bại nằm **trước** khi mở stream? → `20`
- [ ] ID dùng branded type, validate ở điểm vào? → `21`, `24`
- [ ] `assertNever` ở nhánh default của switch trên union? → `21`
- [ ] `Record<Union, T>` cho map, để không quên case mới? → `21`
- [ ] Đã chạy `pnpm build` và đọc bảng size? → `22`
- [ ] Không tạo barrel file (`index.ts` re-export)? → `22`
- [ ] Modal/drawer có đủ 5: `role="dialog"`, `aria-modal`, focus trap, Escape, trả focus? → `23`
- [ ] Trạng thái active có `aria-current`, không chỉ có màu? → `23`
- [ ] Thay đổi động có live region (`aria-live`)? → `23`
- [ ] `aria-hidden="true"` cho icon trang trí? → `23`
- [ ] Không nội suy giá trị chưa validate vào URL / SQL / path? → `24`
- [ ] Mutation nhận ID từ client → có lớp authz ở BFF hoặc xác nhận backend kiểm tra? → `24`
- [ ] Không log PII (tên file, email, token)? → `24`

### Testing

- [ ] Logic mới đặt trong `lib/` dưới dạng hàm pure? → `14`
- [ ] Có test cho đường xấu (input rác, giá trị biên), không chỉ happy path? → `14`
- [ ] Thời gian/ngẫu nhiên truyền vào làm **tham số**, không gọi bên trong? → `12`, `14`
- [ ] Code bảo mật (`safeRedirect`, gate, validate) **bắt buộc** có test? → `14`
- [ ] Nếu phải mock nhiều → cân nhắc tách logic khỏi I/O? → `14`

---

## 6. Mười nguyên tắc rút ra từ repo này

Nếu bạn chỉ mang theo một trang từ toàn bộ bộ tài liệu, hãy là trang này.

**1. Đẩy công việc xuống tầng thấp nhất có thể xử lý nó.**
Filter/sort/paginate → database. Fetch/format → server. Chỉ tương tác → client.
Đây là lý do repo không cần `useTransition`, không cần `useMemo`, và không có `useEffect` fetch nào.

**2. Hàm pure với input tường minh là đơn vị code tốt nhất.**
Test được không cần mock, dùng được ở mọi runtime, đọc là hiểu. Đây là điều `lib/` làm đúng, và là lý
do `shouldGateShop` và `isExpiringSoon` nhận `roles`/`nowMs` làm tham số.

**3. Tách quyết định khỏi thực thi.**
`buildHeaders`/`unwrap` (pure) tách khỏi `apiFetch` (I/O). Đề xuất `decideProxy` tách khỏi `proxy.ts`.
Đây là mẫu chung để làm mọi thứ "khó test" trở nên test được.

**4. Chọn kiểu dữ liệu không biểu diễn được trạng thái sai.**
`string | null` cho một form reply mở. `z.discriminatedUnion` cho attribute theo loại sản phẩm.
Để compiler bắt lỗi thay vì runtime.

**5. URL là store toàn cục miễn phí.**
Tab, page, filter, search query. Được persistence, sharing, back button, và cho phép server fetch —
tất cả không viết một dòng state management nào.

**6. Coi mọi input từ client là thù địch.**
`searchParams`, `FormData`, file upload, redirect target. Server Action là endpoint công khai.
`accept="image/*"` không phải validation.

**7. Comment giải thích *vì sao*, không phải *cái gì*.**
Repo này có nhiều comment chất lượng cao: *"redirect() throws NEXT_REDIRECT"*,
*"Kept free of server-only so proxy.ts can import it"*, *"backend never sends a response"*.
Đây là thông tin không đọc được từ code, và là loại comment duy nhất đáng viết.

**8. Đo trước khi tối ưu.**
Không memo trước khi profile. Không cache trước khi biết endpoint nào chậm.
Không đo ở `pnpm dev`.

**9. Một mutation phải trả lời được: "dữ liệu này hiện ở những trang nào?"**
Bug `cancelOrderAction` và bug badge giỏ hàng đều từ việc không trả lời câu này.
Từ 3 trang trở lên → dùng `revalidateTag`.

**10. Nói rõ tầng nào chịu trách nhiệm gì.**
Proxy = UX/route gating. Backend = bảo mật thật. Zod = hình dạng dữ liệu. TypeScript = compile time.
Hiểu sai ranh giới này dẫn tới việc bỏ kiểm tra ở chỗ quan trọng.

---

## 7. Bước tiếp theo

### Chạy thử

```bash
pnpm test:run       # 12 file test, chạy trong vài trăm ms
pnpm typecheck      # tsc --noEmit, strict: true
pnpm lint
pnpm build && pnpm start   # rồi đo Lighthouse
```

### Bài tập thực hành, theo thứ tự khó dần

1. **Sửa #2 và #5** (mỗi cái 1 dòng). Làm quen với vòng lặp sửa-test.
2. **Trích `useActionToast`** (#16). Xoá 17 chỗ trùng lặp, chạy `pnpm typecheck`.
3. **Viết `safeRedirect` + test** (#1). Đây là bài tập kết hợp bảo mật và testing.
4. **Thêm `loading.tsx` cho `/orders`** (#8). Cảm nhận sự khác biệt UX ngay.
5. **Chuyển `product-card.tsx` sang `next/image`** (#7). Đo Lighthouse trước và sau.
6. **Thêm `useOptimistic` cho giỏ hàng** (#12). Bài tập khó nhất, và đáng nhất — chú ý cái bẫy
   `oldQuantity` ở file `07`.
7. **Tách `decideProxy` + viết test** (#21). Bài tập về kiến trúc: biến code khó test thành dễ test.

### Khi cần tra cứu

| Câu hỏi | File |
| --- | --- |
| Vì sao render phải pure? | `01` |
| State này nên ở đâu? | `02` |
| Có cần `useEffect` không? | `03` |
| Có cần memo không? | `04` |
| `ref` / Context dùng thế nào? | `05` |
| Đặt `<Suspense>` ở đâu? | `06` |
| Optimistic hay chờ thật? | `07` |
| Server hay Client Component? | `08` |
| Route/layout tổ chức thế nào? | `09` |
| Cache hay không cache? | `10` |
| Server Action viết thế nào cho an toàn? | `11` |
| Auth/session/proxy hoạt động ra sao? | `12` |
| Hydration mismatch từ đâu? | `13` |
| Test cái gì và test thế nào? | `14` |
| Fiber/hook/lane hoạt động ra sao? | `15` |
| Lỗi này ai bắt? Retry thế nào? | `16` |
| Thiết kế API component thế nào? | `17` |
| Hook này nên trả về gì? Có cần FSM? | `18` |
| Làm modal share-able / dashboard nhiều vùng? | `19` |
| Cần `route.ts` không? Realtime thế nào? | `20` |
| Dùng type để chặn bug này được không? | `21` |
| Cái gì đang làm bundle to / trang chậm? | `22` |
| Dùng bàn phím / screen reader có được không? | `23` |
| Chỗ này có lỗ hổng không? | `24` |
| Bug này ở tầng nào? Debug thế nào? | `25` |
| Form phức tạp (array, upload, autosave)? | `26` |
| Format tiền/ngày cho người Việt? | `27` |
| Deploy, env var, Docker, logging? | `28` |
| Nên test cái này ở tầng nào? | `29` |
| API này tồn tại không? Gotcha gì? | `30` |

---

## Tự kiểm tra cuối

1. Vì sao `lib/` test được mà không cần một dòng `vi.mock()` nào?
2. `isExpiringSoon(payload, nowMs)` — vì sao `nowMs` là tham số?
3. Vì sao `buildHeaders`/`unwrap` được tách khỏi `apiFetch`?
4. Kể ba pattern test đáng học từ repo này.
5. Bạn sẽ làm `proxy.ts` test được bằng cách nào?
6. Ba việc bạn sẽ làm đầu tiên nếu được nửa ngày để cải thiện repo này?
7. Mười nguyên tắc ở mục 6 — cái nào bạn thấy áp dụng được ngay vào công việc hiện tại?

➡️ Tiếp theo: `15-react-internals-fiber-hooks-lanes.md` — bắt đầu Phần D (nâng cao)
