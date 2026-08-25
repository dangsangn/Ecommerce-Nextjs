# 29. Testing E2E & Tích hợp

> **Mục tiêu:** biết **test cái gì ở tầng nào**. File `14` đã lo unit test cho `lib/`.
> Chương này lo phần còn lại: Server Action, component, và luồng E2E — cùng lý do tại sao
> repo này nên có **rất ít** E2E test nhưng phải là những cái **đúng**.

---

## 1. Overview

### Testing Trophy cho App Router

Kim tự tháp test cổ điển (nhiều unit, ít E2E) **không khớp** với App Router. Lý do: phần lớn code của
bạn không phải hàm pure — nó là Server Component gọi API, Server Action mutate dữ liệu, và ranh giới
server/client. Những thứ đó **unit test không chạm được**.

Mô hình phù hợp hơn là **Testing Trophy**:

```
        ╱─────────╲
       ╱    E2E    ╲          ← Ít, nhưng phủ các luồng KIẾM TIỀN
      ╱─────────────╲
     ╱  Integration  ╲        ← ⭐ NHIỀU NHẤT: Server Action + component
    ╱─────────────────╲
   ╱       Unit        ╲      ← Hàm pure trong lib/ (repo đã có)
  ╱─────────────────────╲
 ╱      Static (TS)      ╲    ← ⭐ RỘNG NHẤT: TypeScript + Zod + branded types
╱─────────────────────────╱
```

**Tầng "Static" rộng nhất là điểm khác biệt quan trọng.** Mọi kỹ thuật ở file `21` (branded types,
discriminated union, `assertNever`) là **test** — chúng chạy ở mọi lần build, phủ mọi dòng code, và
không cần ai viết test case.

📄 Nghĩa là: sửa `statusVariant(status: string)` thành `statusVariant(status: OrderStatus)` có giá trị
test **cao hơn** viết 5 test case cho nó.

### Repo hiện đang ở đâu

| Tầng | Repo có | Đánh giá |
| --- | --- | --- |
| Static (TS) | `strict: true` | ✅ Nền tốt, nhưng còn `string` cho ID và status (file `21`) |
| Unit | 12 file, toàn bộ `lib/` | ✅ Tốt |
| Integration | **0** | ⚠️ Khoảng trống chính |
| E2E | **0** | ⚠️ Không có lưới an toàn cho luồng mua hàng |

---

## 2. Test cái gì ở tầng nào — khung quyết định

| Loại code | Tầng | Công cụ | Ví dụ trong repo |
| --- | --- | --- | --- |
| Hàm pure | Unit | Vitest | `toPriceString`, `groupComments`, `shouldGateShop` |
| Zod schema | Unit | Vitest | `productDetailsSchema`, `createDiscountSchema` |
| Reducer / FSM | Unit | Vitest | `wizardReducer` (file `18`) |
| Server Action | Integration | Vitest + mock `apiFetch` | `createDiscountAction`, `cancelOrderAction` |
| Client Component có logic | Integration | Vitest + RTL | `CheckoutWizard`, `CommentSection` |
| Server Component | **E2E** | Playwright | Không unit test được — nó là `async` + đọc cookie |
| Luồng nhiều trang | E2E | Playwright | signup → verify → login; browse → cart → checkout |
| `proxy.ts` | Unit (sau khi tách) | Vitest | `decideProxy` (file `14`) |

**Quy tắc:** đi từ dưới lên. Chỉ leo lên tầng cao hơn khi tầng dưới **không thể** phủ được.

### Vì sao Server Component không unit test được

```tsx
export default async function OrdersPage() {
  let orders: Order[] = []
  try {
    const result = await apiFetch<OrdersResult>('/order', { auth: true })
    orders = result.data ?? []
  } catch (e) { /* ... */ }
  return <div>{orders.map((o) => <OrderCard key={o._id} order={o} />)}</div>
}
```

Để test nó bạn phải mock: `apiFetch` → `cookies()` từ `next/headers` → và render một `async` component
(RTL chưa hỗ trợ tốt). Sau khi mock hết, bạn còn test gì? Chỉ còn logic `?? []` — mà nó tầm thường.

**Giá trị thật của trang này nằm ở việc nó có hiển thị đúng khi tích hợp thật hay không.** Đó là E2E.

> **Nguyên tắc:** nếu để test một thứ bạn phải mock nhiều hơn số dòng code nó có — đừng unit test nó.
> Hoặc tách logic ra `lib/` (file `14`), hoặc phủ bằng E2E.

---

## 3. Integration test cho Server Action

Đây là khoảng trống lớn nhất, và cũng là tầng có tỷ lệ giá trị/công sức cao nhất.

### Setup

```bash
pnpm add -D @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event
```

```tsx
// vitest.config.ts — thêm project thứ hai, GIỮ project node hiện tại
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const alias = { '@': fileURLToPath(new URL('./', import.meta.url)) }

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        // ⭐ Project cũ giữ NGUYÊN — test lib/ vẫn chạy trong node, cực nhanh
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          include: ['lib/**/*.test.ts', 'actions/**/*.test.ts'],
        },
      },
      {
        // Project mới cho component test
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'component',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup.ts'],
          include: ['components/**/*.test.tsx', 'app/**/*.test.tsx'],
        },
      },
    ],
  },
})
```

**Vì sao tách project:** test `lib/` chạy trong `node` mất vài trăm ms. Nếu bạn đưa tất cả vào `jsdom`,
mọi test chậm đi vì phải dựng DOM giả. Tách ra giữ được tốc độ của tầng dưới — và tốc độ là điều kiện
để `git bisect run` hoạt động (file `25`).

```tsx
// test/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// sonner render vào portal — mock để không phải dựng Toaster trong mọi test
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
```

### Test một Server Action — `cancelOrderAction`

Đây là action có bug đã biết (file `10`), nên test này **sẽ đỏ trước khi sửa** — đúng cách làm TDD
với một bug đã phát hiện:

```tsx
// actions/__tests__/order.actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api/server-client', () => ({ apiFetch: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    // redirect() THROW trong thực tế (file 09) — mock phải mô phỏng điều đó,
    // nếu không test sẽ không phát hiện được bug "redirect trong try/catch"
    const e = new Error('NEXT_REDIRECT')
    ;(e as Error & { digest: string }).digest = `NEXT_REDIRECT;push;${path}`
    throw e
  }),
}))

import { apiFetch } from '@/lib/api/server-client'
import { revalidatePath } from 'next/cache'
import { cancelOrderAction, placeOrderAction } from '@/actions/order.actions'
import { initialActionState } from '@/actions/state'
import { ApiError } from '@/lib/api/http'

function fd(obj: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(obj)) f.append(k, v)
  return f
}

describe('cancelOrderAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('từ chối khi thiếu orderId', async () => {
    const r = await cancelOrderAction(initialActionState, fd({}))
    expect(r.ok).toBe(false)
    expect(apiFetch).not.toHaveBeenCalled()      // ⭐ không gọi API khi input sai
  })

  it('gọi đúng endpoint với PATCH', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)
    await cancelOrderAction(initialActionState, fd({ orderId: '507f1f77bcf86cd799439011' }))
    expect(apiFetch).toHaveBeenCalledWith(
      '/order/507f1f77bcf86cd799439011/cancel',
      expect.objectContaining({ method: 'PATCH', auth: true }),
    )
  })

  it('trả message của backend khi lỗi', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, 'Order already cancelled'))
    const r = await cancelOrderAction(initialActionState, fd({ orderId: '507f1f77bcf86cd799439011' }))
    expect(r).toEqual({ ok: false, message: 'Order already cancelled' })
  })

  // ⭐ TEST NÀY ĐỎ với code hiện tại — đó là điểm của nó (bug ở file 10)
  it('revalidate CẢ danh sách VÀ trang chi tiết', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)
    const id = '507f1f77bcf86cd799439011'
    await cancelOrderAction(initialActionState, fd({ orderId: id }))
    expect(revalidatePath).toHaveBeenCalledWith('/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/orders/${id}`)   // ← hiện đang THIẾU
  })
})

describe('placeOrderAction', () => {
  beforeEach(() => vi.clearAllMocks())

  const validCart = JSON.stringify([
    { shopId: 's1', shop_discounts: [], item_products: [{ productId: 'p1', quantity: 2, price: 250000 }] },
  ])
  const validAddress = { street: '1 Lê Lợi', city: 'HCM', state: 'HCM', country: 'VN' }

  it('từ chối JSON hỏng', async () => {
    const r = await placeOrderAction(initialActionState, fd({ shop_order_ids: '{{{not json' }))
    expect(r.ok).toBe(false)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('từ chối giỏ hàng rỗng', async () => {
    const r = await placeOrderAction(initialActionState, fd({ shop_order_ids: '[]' }))
    expect(r).toEqual({ ok: false, message: 'Your cart is empty' })
  })

  it('từ chối địa chỉ thiếu field', async () => {
    const r = await placeOrderAction(
      initialActionState,
      fd({ shop_order_ids: validCart, ...validAddress, country: '' }),
    )
    expect(r.ok).toBe(false)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  // ⭐ Test này ghi lại một LỖ HỔNG hiện tại (file 26): nội dung array không được validate
  it('⚠️ HIỆN TẠI chấp nhận quantity âm — cần thêm Zod schema', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)
    const evil = JSON.stringify([
      { shopId: 's1', shop_discounts: [], item_products: [{ productId: 'p1', quantity: -999, price: 0 }] },
    ])
    // Ghi lại hành vi HIỆN TẠI. Khi thêm validation, đổi assertion thành ok: false.
    await expect(
      placeOrderAction(initialActionState, fd({ shop_order_ids: evil, ...validAddress, paymentMethod: 'COD' })),
    ).rejects.toThrow('NEXT_REDIRECT')       // nó redirect = đã gửi lên backend
  })
})
```

**Bốn kỹ thuật đáng học:**

**(1) Mock `redirect` để THROW.** Nếu mock nó thành no-op, bạn không phát hiện được bug
"gọi `redirect` trong `try/catch`" (file `09`). Mock phải mô phỏng hành vi thật.

**(2) `expect(apiFetch).not.toHaveBeenCalled()`** — assertion quan trọng nhất cho validation test.
Nó kiểm tra rằng input sai bị chặn **trước khi** gọi backend, không phải bị backend từ chối.

**(3) `expect.objectContaining`** — assert những gì bạn quan tâm, bỏ qua phần còn lại. Test không giòn
khi thêm option mới vào `apiFetch`.

**(4) Test ghi lại hành vi hiện tại có lỗ hổng**, kèm comment `⚠️ HIỆN TẠI`. Đây là cách tài liệu hoá
một vấn đề đã biết mà chưa sửa — người sau đọc test là thấy, và khi sửa thì test nhắc họ đổi assertion.

---

## 4. Component test — khi nào đáng

⚠️ **Đừng test component chỉ hiển thị.** `OrderCard`, `ProductCard`, `DiscountList` chỉ map dữ liệu ra
JSX — test chúng là test rằng React hoạt động.

**Chỉ test component có LOGIC.** Trong repo có ba ứng viên:

### `CheckoutWizard` — logic điều hướng bước

```tsx
// components/store/__tests__/checkout-wizard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/order.actions', () => ({ placeOrderAction: vi.fn() }))

import { CheckoutWizard } from '@/components/store/checkout-wizard'
import type { CheckoutOrder, OrderProduct, ShopOrderItem } from '@/types/order'

const review: CheckoutOrder = { totalPrice: 500000, totalDiscount: 0, feeShip: 30000, totalCheckout: 530000 }
const lines: OrderProduct[] = [
  { productId: 'p1', price: 250000, quantity: 2, name: 'Áo thun trắng', thumb: '/t.jpg' },
]
const shopOrderIds: ShopOrderItem[] = [
  { shopId: 's1', shop_discounts: [], item_products: [{ productId: 'p1', quantity: 2, price: 250000 }] },
]

function setup() {
  return {
    user: userEvent.setup(),
    ...render(<CheckoutWizard shopOrderIds={shopOrderIds} review={review} lines={lines} />),
  }
}

describe('CheckoutWizard', () => {
  it('bắt đầu ở bước review, hiện sản phẩm và tổng tiền', () => {
    setup()
    expect(screen.getByText('Áo thun trắng')).toBeInTheDocument()
    // Query theo VAI TRÒ, không theo class — test không vỡ khi đổi style
    expect(screen.getByRole('button', { name: /continue|tiếp tục/i })).toBeInTheDocument()
  })

  it('không cho sang bước xác nhận khi địa chỉ chưa đủ', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /continue|tiếp tục/i }))

    // Đang ở bước địa chỉ, chưa điền gì
    const next = screen.getByRole('button', { name: /continue|tiếp tục/i })
    expect(next).toBeDisabled()                      // ⭐ luật nghiệp vụ
  })

  it('cho sang bước xác nhận khi điền đủ 4 field', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /continue|tiếp tục/i }))

    await user.type(screen.getByLabelText(/street|đường/i), '1 Lê Lợi')
    await user.type(screen.getByLabelText(/city|thành phố/i), 'HCM')
    await user.type(screen.getByLabelText(/^state|tỉnh/i), 'HCM')
    await user.type(screen.getByLabelText(/country|quốc gia/i), 'VN')

    const next = screen.getByRole('button', { name: /continue|tiếp tục/i })
    expect(next).toBeEnabled()
    await user.click(next)

    expect(screen.getByText(/1 Lê Lợi/)).toBeInTheDocument()
  })

  it('lùi bước giữ nguyên địa chỉ đã điền', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /continue|tiếp tục/i }))
    await user.type(screen.getByLabelText(/street|đường/i), '1 Lê Lợi')
    await user.click(screen.getByRole('button', { name: /back|quay lại/i }))
    await user.click(screen.getByRole('button', { name: /continue|tiếp tục/i }))

    expect(screen.getByLabelText(/street|đường/i)).toHaveValue('1 Lê Lợi')
  })
})
```

⚖️ **Nhưng nếu bạn refactor `CheckoutWizard` thành FSM (file `18`), phần lớn test này trở nên
KHÔNG CẦN THIẾT** — vì `wizardReducer` test được như hàm pure, nhanh hơn 100 lần, không cần jsdom:

```tsx
// Test FSM: 3 dòng, không setup
expect(run([{ type: 'CONTINUE' }, { type: 'CONTINUE' }]).status).toBe('addressing')
```

**Đây là bài học quan trọng nhất của chương:** *test dễ là dấu hiệu của thiết kế tốt.* Nếu bạn phải
dựng jsdom + userEvent để kiểm tra một luật nghiệp vụ, luật đó đang nằm sai chỗ.

**Ba nguyên tắc query của RTL đáng theo:**

| Ưu tiên | Query | Vì sao |
| --- | --- | --- |
| 1 | `getByRole`, `getByLabelText` | Giống cách người dùng (và screen reader) tìm element — test luôn kiểm tra a11y |
| 2 | `getByText` | Người dùng đọc được |
| 3 | `getByTestId` | **Cuối cùng** — chỉ khi không có cách nào khác |

**Không bao giờ query theo class hay CSS selector.** Đổi Tailwind class không nên làm test đỏ.

⚠️ **Lợi ích phụ:** nếu `getByLabelText(/street/i)` **không tìm thấy**, đó là bug a11y thật —
`<Label htmlFor>` chưa nối đúng với input (file `23`). Test viết theo cách này **bắt luôn** vấn đề a11y.

---

## 5. E2E với Playwright — ít nhưng đúng

### Setup

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

```tsx
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Chạy tuần tự ở CI để tránh xung đột dữ liệu test
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',              // ⭐ trace khi retry — vàng để debug flaky
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // ⭐ PRODUCTION build, không `dev` — dev có StrictMode double-invoke, không minify (file 13, 22)
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
```

### Ba luồng đáng E2E — và chỉ ba

E2E test **chậm** (giây, không phải ms) và **giòn** (phụ thuộc backend, dữ liệu, timing). Nên chỉ phủ
những luồng mà **hỏng = mất tiền hoặc mất người dùng**:

| # | Luồng | Vì sao đáng |
| --- | --- | --- |
| 1 | Signup → verify OTP → login | Không đăng ký được = không có người dùng mới |
| 2 | Browse → add to cart → checkout → order | **Luồng kiếm tiền** |
| 3 | Seller: tạo sản phẩm → publish → thấy ở storefront | Không có sản phẩm = không có gì để bán |

**Không E2E cho:** đổi avatar, xem chi tiết discount, sắp xếp danh sách. Chúng thuộc tầng dưới.

### Luồng mua hàng — E2E quan trọng nhất

```tsx
// e2e/purchase-flow.spec.ts
import { test, expect } from '@playwright/test'

// Tài khoản test được seed sẵn ở backend test DB
const BUYER = {
  email: process.env.E2E_BUYER_EMAIL ?? 'buyer@test.local',
  password: process.env.E2E_BUYER_PASSWORD ?? 'test1234',
}

test.describe('Luồng mua hàng', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(BUYER.email)
    await page.getByLabel(/password|mật khẩu/i).fill(BUYER.password)
    await page.getByRole('button', { name: /sign in|đăng nhập/i }).click()
    // ⭐ Chờ điều hướng thật, KHÔNG dùng waitForTimeout
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('thêm sản phẩm vào giỏ và đặt hàng', async ({ page }) => {
    // --- Bước 1: chọn sản phẩm từ danh mục ---
    await page.goto('/')
    const firstProduct = page.getByRole('link').filter({ has: page.locator('img') }).first()
    await expect(firstProduct).toBeVisible()
    const productName = await firstProduct.getByRole('paragraph').first().textContent()
    await firstProduct.click()

    await expect(page).toHaveURL(/\/products\//)

    // --- Bước 2: thêm vào giỏ ---
    await page.getByLabel(/quantity|số lượng/i).fill('2')
    await page.getByRole('button', { name: /add to cart|thêm vào giỏ/i }).click()

    // ⭐ Chờ TOAST — bằng chứng Server Action đã hoàn tất
    await expect(page.getByText(/added to cart|đã thêm vào giỏ/i)).toBeVisible()

    // --- Bước 3: kiểm tra giỏ hàng ---
    await page.goto('/cart')
    await expect(page.getByText(productName!.trim())).toBeVisible()
    // ⭐ Kiểm tra định dạng tiền VND (file 27) — bug này E2E bắt được
    await expect(page.getByText(/₫/)).toBeVisible()

    // --- Bước 4: checkout wizard ---
    await page.getByRole('link', { name: /proceed to checkout|thanh toán/i }).click()
    await expect(page).toHaveURL(/\/checkout/)

    await page.getByRole('button', { name: /continue|tiếp tục/i }).click()

    await page.getByLabel(/street|đường/i).fill('1 Lê Lợi')
    await page.getByLabel(/city|thành phố/i).fill('Hồ Chí Minh')
    await page.getByLabel(/^state|tỉnh/i).fill('Hồ Chí Minh')
    await page.getByLabel(/country|quốc gia/i).fill('Việt Nam')

    await page.getByRole('button', { name: /continue|tiếp tục/i }).click()
    await expect(page.getByText(/1 Lê Lợi/)).toBeVisible()

    // --- Bước 5: đặt hàng ---
    await page.getByRole('button', { name: /place order|đặt hàng/i }).click()

    // ⭐ Server Action redirect sang /orders
    await expect(page).toHaveURL(/\/orders/)
    await expect(page.getByText(/pending|chờ xác nhận/i).first()).toBeVisible()
  })

  test('giỏ hàng trống thì checkout hiện thông báo', async ({ page }) => {
    await page.goto('/cart')
    // Xoá hết nếu còn
    const clear = page.getByRole('button', { name: /clear cart|xoá giỏ/i })
    if (await clear.isVisible()) await clear.click()

    await page.goto('/checkout')
    await expect(page.getByText(/cart is empty|giỏ hàng.*trống/i)).toBeVisible()
  })
})
```

### Test bằng bàn phím — bắt luôn bug a11y

Nhớ file `23`: repo có vấn đề focus trap và `pointer-events-none`. E2E test được chúng:

```tsx
// e2e/keyboard-navigation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Điều hướng bằng bàn phím', () => {
  test('skip link đưa focus tới nội dung chính', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    // ⭐ Element đầu tiên trong tab order phải là skip link (file 23)
    await expect(page.getByRole('link', { name: /bỏ qua|skip/i })).toBeFocused()
  })

  test('drawer mobile giam focus và đóng bằng Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/seller')     // cần đăng nhập seller — dùng storageState

    await page.getByRole('button', { name: /mở menu|open menu/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // ⭐ Tab nhiều lần — focus PHẢI ở trong dialog
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const focusedInDialog = await dialog.evaluate((el) => el.contains(document.activeElement))
      expect(focusedInDialog).toBe(true)
    }

    // ⭐ Escape đóng drawer
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  })

  test('link phân trang disabled không focus được', async ({ page }) => {
    await page.goto('/')
    const prev = page.getByRole('link', { name: /previous|trước/i })
    if (await prev.count() === 0) test.skip()
    // ⭐ Link disabled phải có tabIndex=-1 (file 23)
    await expect(prev).toHaveAttribute('tabindex', '-1')
  })
})
```

**Ba test này sẽ ĐỎ với code hiện tại** — và đó chính là giá trị của chúng. Chúng biến "vấn đề a11y
trong tài liệu" thành "test đỏ trong CI".

### Tái sử dụng đăng nhập bằng `storageState`

Đăng nhập lại ở mỗi test là chậm và giòn. Playwright cho phép lưu session:

```tsx
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test'
import path from 'node:path'

const buyerFile = path.join(__dirname, '../.auth/buyer.json')
const sellerFile = path.join(__dirname, '../.auth/seller.json')

setup('đăng nhập buyer', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_BUYER_EMAIL!)
  await page.getByLabel(/password|mật khẩu/i).fill(process.env.E2E_BUYER_PASSWORD!)
  await page.getByRole('button', { name: /sign in|đăng nhập/i }).click()
  await expect(page).not.toHaveURL(/\/login/)
  // Lưu cookie (httpOnly cũng lưu được — file 12)
  await page.context().storageState({ path: buyerFile })
})

setup('đăng nhập seller', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(process.env.E2E_SELLER_EMAIL!)
  await page.getByLabel(/password|mật khẩu/i).fill(process.env.E2E_SELLER_PASSWORD!)
  await page.getByRole('button', { name: /sign in|đăng nhập/i }).click()
  await expect(page).toHaveURL(/\/seller/)
  await page.context().storageState({ path: sellerFile })
})
```

```tsx
// playwright.config.ts — thêm project dependency
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'buyer',
    use: { ...devices['Desktop Chrome'], storageState: '.auth/buyer.json' },
    dependencies: ['setup'],
    testMatch: /purchase-flow|keyboard/,
  },
  {
    name: 'seller',
    use: { ...devices['Desktop Chrome'], storageState: '.auth/seller.json' },
    dependencies: ['setup'],
    testMatch: /seller-/,
  },
],
```

⚠️ **Thêm `.auth/` vào `.gitignore`** — nó chứa cookie session thật.

---

## 6. ⭐ Nguyên nhân flaky test và cách sửa

Flaky test (đỏ ngẫu nhiên) tệ hơn không có test — người ta học cách bỏ qua CI đỏ.

| Nguyên nhân | Sai | Đúng |
| --- | --- | --- |
| Chờ bằng thời gian | `await page.waitForTimeout(2000)` | `await expect(locator).toBeVisible()` |
| Query không ổn định | `page.locator('.btn-primary')` | `page.getByRole('button', { name: /đặt hàng/i })` |
| Test phụ thuộc thứ tự | Test A tạo dữ liệu, test B dùng | Mỗi test tự tạo dữ liệu của mình |
| Dữ liệu dùng chung | Cùng một sản phẩm test | Tạo sản phẩm riêng, hoặc reset DB giữa các run |
| Race với revalidate | Assert ngay sau click | Chờ một chỉ báo (toast, URL, text mới) |
| Animation | Click khi đang animate | `prefers-reduced-motion` (file `23`) hoặc chờ `toBeStable` |

**Kỹ thuật chống flaky quan trọng nhất: chờ CHỈ BÁO, không chờ THỜI GIAN.**

```tsx
// ❌ Flaky: 2 giây có thể đủ hoặc không, tuỳ tải máy CI
await page.getByRole('button', { name: /add to cart/i }).click()
await page.waitForTimeout(2000)
await expect(page.getByText('2')).toBeVisible()

// ✅ Ổn định: chờ đúng thứ chứng minh action đã xong
await page.getByRole('button', { name: /add to cart/i }).click()
await expect(page.getByText(/added to cart|đã thêm/i)).toBeVisible()    // toast = bằng chứng
```

📄 **Đặc thù cho repo này:** vì mọi action đều toast (file `03`), bạn **luôn** có một chỉ báo để chờ.
Đây là lợi ích không ngờ của pattern toast-khắp-nơi — nó làm E2E test dễ viết hơn.

⚠️ **Nhưng nếu bạn chuyển sang lỗi inline** (đề xuất ở file `23`), hãy chờ text inline đó thay vì toast.

**Và một chỗ thực sự cần chờ thời gian:** sau `revalidatePath`, RSC payload mới cần một round-trip.
Playwright's auto-wait xử lý được, nhưng nếu vẫn flaky:

```tsx
// Chờ request RSC hoàn tất — cụ thể hơn waitForTimeout
await page.waitForResponse((r) => r.url().includes('_rsc') && r.status() === 200)
```

---

## 7. CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push: { branches: [main] }
  pull_request:

jobs:
  # Job nhanh chạy trước — fail sớm, tiết kiệm CI minutes
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck        # ⭐ tầng "Static" của trophy
      - run: pnpm lint
      - run: pnpm test:run         # unit + integration, vài giây

  # E2E chạy song song, chỉ sau khi static xanh
  e2e:
    needs: static
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test
        env:
          BACKEND_URL: ${{ secrets.E2E_BACKEND_URL }}
          API_KEY: ${{ secrets.E2E_API_KEY }}
          E2E_BUYER_EMAIL: ${{ secrets.E2E_BUYER_EMAIL }}
          E2E_BUYER_PASSWORD: ${{ secrets.E2E_BUYER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "typecheck": "tsc --noEmit"
  }
}
```

**Ba quyết định thiết kế pipeline:**

**(1) `typecheck` chạy đầu tiên.** Nó là tầng rộng nhất của trophy và nhanh nhất — fail ở đây tiết kiệm
5 phút E2E.

**(2) E2E `needs: static`.** Không chạy E2E khi TypeScript còn lỗi.

**(3) Upload report khi fail.** Playwright trace cho bạn timeline, screenshot, DOM snapshot ở mỗi bước —
đây là thứ làm E2E debug được thay vì chỉ "đỏ mà không biết vì sao".

⚠️ **`--ui` mode là công cụ tốt nhất để viết E2E test.** `pnpm test:e2e:ui` mở một UI cho phép chạy
từng bước, xem DOM, và **pick locator** bằng cách click vào element. Dùng nó thay vì đoán selector.

---

## 8. Nên viết bao nhiêu test?

Câu trả lời trung thực: **không có con số đúng.** Nhưng có một khung hữu ích.

### Phủ theo rủi ro, không theo % dòng code

```
Rủi ro = (Xác suất hỏng) × (Thiệt hại khi hỏng)
```

| Code | Xác suất hỏng | Thiệt hại | Test tới đâu |
| --- | --- | --- | --- |
`toPriceString` | Trung bình (nhiều dạng input) | **Cao** (hiện giá sai) | ✅ Unit đầy đủ (repo đã có) |
| `wizardReducer` | Cao (nhiều nhánh) | Cao (không đặt được hàng) | ✅ Unit đầy đủ |
| `cancelOrderAction` | Trung bình | Trung bình | ✅ Integration |
| Luồng checkout | Thấp mỗi phần, **cao khi tích hợp** | **Rất cao** | ✅ E2E |
| `OrderCard` render | Rất thấp | Thấp | ❌ Không test |
| `buttonVariants` | Rất thấp | Thấp (chỉ style) | ❌ Không test |

⚠️ **Coverage % là chỉ số gây nhầm lẫn.** 100% coverage cho `OrderCard` không có giá trị; 0% coverage
cho luồng checkout là rủi ro thật. **Đừng đặt mục tiêu coverage.**

### Mục tiêu thực tế cho repo này

| Tầng | Hiện tại | Mục tiêu | Công sức |
| --- | --- | --- | --- |
| Static (TS) | `strict` nhưng còn `string` cho ID | Branded types (file `21`) | 4 giờ |
| Unit `lib/` | 12 file ✅ | Thêm `decideProxy`, `safeRedirect`, `assertSafePath`, `wizardReducer` | 4 giờ |
| Integration action | 0 | 5 action quan trọng nhất | 6 giờ |
| Component | 0 | 0–1 (nếu FSM hoá thì không cần) | 0–3 giờ |
| E2E | 0 | 3 luồng + 3 keyboard test | 8 giờ |

**Tổng ~22 giờ** để có lưới an toàn thật. Và thứ tự ưu tiên: **Static → E2E luồng mua hàng →
Integration action → Unit còn lại.**

Vì sao E2E trước Integration? Vì E2E luồng mua hàng phủ **tất cả** các tầng cùng lúc — nó là lưới an
toàn rộng nhất cho một lượng công sức. Integration test cụ thể hơn nhưng hẹp hơn.

---

## 9. Trade-offs

| Tầng test | Lợi ích | Cái giá |
| --- | --- | --- |
| **Static (TS)** | Phủ mọi dòng, 0 test case phải viết, chạy mỗi build | Chỉ bắt được lỗi kiểu, không bắt được logic sai |
| **Unit** | Cực nhanh (ms), không mock, chỉ rõ chỗ sai | Chỉ phủ hàm pure; không đảm bảo tích hợp đúng |
| **Integration action** | Phủ validate + logic + revalidate | Cần mock 3-4 module; mock có thể lệch với thực tế |
| **Component (RTL)** | Kiểm tra tương tác thật + a11y | Chậm (jsdom); giòn nếu query theo class |
| **E2E** | Phủ toàn bộ tầng; bắt được bug tích hợp | Chậm (giây); flaky; cần backend + dữ liệu test |

**Nguyên tắc đánh đổi:** mỗi tầng lên cao thì **tin cậy hơn** (giống thực tế hơn) nhưng **chậm hơn và
giòn hơn**. Chọn tầng thấp nhất còn phủ được thứ bạn quan tâm.

---

## 10. Best Practices

1. **Tầng "Static" là tầng test rộng nhất.** Sửa `status: string` → `status: OrderStatus` giá trị hơn
   5 test case.

2. **Nếu phải mock nhiều hơn số dòng code — đừng unit test nó.** Tách logic ra `lib/`, hoặc phủ bằng E2E.

3. **Tách vitest project** để test `lib/` vẫn chạy trong `node` (nhanh), component trong `jsdom`.

4. **Mock `redirect` để THROW.** Mock no-op che mất bug "redirect trong try/catch".

5. **`expect(apiFetch).not.toHaveBeenCalled()`** cho mọi validation test — chứng minh input sai bị chặn
   trước khi gọi backend.

6. **RTL query theo `getByRole`/`getByLabelText`.** Nó bắt luôn bug a11y, và không vỡ khi đổi style.

7. **Chỉ 3 luồng E2E.** Signup, mua hàng, tạo sản phẩm. Không hơn.

8. **E2E chạy `pnpm build && pnpm start`, không `dev`.**

9. **Chờ CHỈ BÁO, không chờ THỜI GIAN.** Toast trong repo này là chỉ báo sẵn có.

10. **`storageState` để tái dùng đăng nhập.** Nhớ `.gitignore` thư mục `.auth/`.

11. **Viết E2E bằng `playwright test --ui`.** Pick locator bằng click thay vì đoán.

12. **Đừng đặt mục tiêu coverage %.** Phủ theo rủi ro = xác suất × thiệt hại.

13. **Test ghi lại lỗ hổng đã biết** kèm comment `⚠️ HIỆN TẠI` — nó là tài liệu sống.

---

## Tự kiểm tra

1. Vì sao Testing Trophy phù hợp App Router hơn Testing Pyramid?
2. Vì sao tầng "Static" là rộng nhất? Cho ví dụ từ repo.
3. Vì sao `OrdersPage` không unit test được? Quy tắc chung là gì?
4. Vì sao mock `redirect` phải throw?
5. `expect(apiFetch).not.toHaveBeenCalled()` chứng minh điều gì?
6. Nếu FSM hoá `CheckoutWizard`, phần lớn component test trở nên thế nào? Bài học?
7. Vì sao query `getByLabelText` bắt luôn bug a11y?
8. Ba luồng nào đáng E2E? Vì sao không nhiều hơn?
9. Sáu nguyên nhân flaky test và cách sửa?
10. Vì sao E2E luồng mua hàng nên ưu tiên trước Integration test?
11. Vì sao coverage % là chỉ số gây nhầm lẫn?

➡️ Tiếp theo: `30-tips-va-gotchas.md`
