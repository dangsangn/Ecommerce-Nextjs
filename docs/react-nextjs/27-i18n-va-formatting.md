# 27. i18n & Formatting — và một bug tiền tệ trong repo

> **Mục tiêu:** format tiền, ngày, số **đúng** cho người dùng Việt Nam; hiểu vì sao tiền không được
> lưu bằng `float`; và biết cách thêm i18n vào một app đã có `proxy.ts`.

---

## 1. ⚠️ Bug: giá tiền đang được format như USD

### Phát hiện

📄 `lib/products/price.ts` — **hàm được dùng ở 9 file**:

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

```bash
$ grep -rn "₫\|VND\|currency\|Intl\." app components lib types | grep -v __tests__
lib/products/price.ts:12:  return (Number.isFinite(n) ? n : 0).toFixed(2)
```

**Không có ký hiệu tiền tệ nào trong toàn bộ repo.** Và `.toFixed(2)` giả định đơn vị có **2 chữ số
thập phân** — đúng với USD/EUR, **sai với VND**.

### Hậu quả cụ thể

Nếu backend lưu giá bằng VND (điều gần như chắc chắn cho một shop Việt Nam):

| Giá thật | Repo hiện hiển thị | Nên hiển thị |
| --- | --- | --- |
| 250.000 ₫ | `250000.00` | `250.000 ₫` |
| 1.500.000 ₫ | `1500000.00` | `1.500.000 ₫` |
| 99.000 ₫ | `99000.00` | `99.000 ₫` |

`250000.00` là con số **không đọc được** — người dùng phải tự đếm chữ số. Và `.00` ở cuối là vô nghĩa
với VND (không có đơn vị nhỏ hơn 1 đồng trong thực tế thanh toán).

📄 Nó xuất hiện ở mọi nơi quan trọng: `product-card.tsx`, `cart-line.tsx`, `checkout-wizard.tsx`,
`order-card.tsx`, `orders/[id]/page.tsx`.

### Sửa bằng `Intl.NumberFormat`

```tsx
// lib/products/price.ts
import type { Decimal } from '@/types/product'

/**
 * Backend serializes product_price from Mongo Decimal128 as a number, a string,
 * or { $numberDecimal: "9.99" }. Chuẩn hoá mọi dạng về number.
 */
export function toPriceNumber(value: Decimal): number {
  let n: number
  if (typeof value === 'number') n = value
  else if (typeof value === 'string') n = Number(value)
  else if (value && typeof value === 'object' && '$numberDecimal' in value)
    n = Number(value.$numberDecimal)
  else n = NaN
  return Number.isFinite(n) ? n : 0
}

/**
 * Formatter được tạo MỘT LẦN ở tầng module.
 *
 * Đây là tối ưu quan trọng: khởi tạo Intl.NumberFormat tốn ~0.1ms
 * (nó phải load locale data). Tạo mới trong mỗi lần render × hàng trăm
 * sản phẩm là chi phí thật. Cùng nguyên tắc với `cva` ở file 04.
 */
const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,     // VND không dùng phần thập phân
})

/** Định dạng giá cho người dùng: 250000 → "250.000 ₫" */
export function toPriceString(value: Decimal): string {
  return VND.format(toPriceNumber(value))
}

/** Chỉ số, không ký hiệu — dùng cho input type="number" và defaultValue */
const PLAIN = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 0,
})

export function toPriceInputValue(value: Decimal): string {
  return PLAIN.format(toPriceNumber(value))
}
```

⚠️ **`toPriceInputValue` là hàm bắt buộc phải tách ra.** 📄 `edit-product-form.tsx` hiện dùng:

```tsx
<Input
  id="product_price"
  name="product_price"
  type="number"
  step="0.01"
  min="0"
  defaultValue={toPriceString(product.product_price)}     // ⚠️ sẽ thành "250.000 ₫"
/>
```

Nếu bạn đổi `toPriceString` sang có ký hiệu tiền tệ mà **không** sửa chỗ này, `<input type="number">`
nhận `"250.000 ₫"` → **không parse được** → input hiện trống → người dùng lưu lại và **giá bị mất**.

**Đây là bug nghiêm trọng hơn cả bug gốc.** Nên phải sửa cùng lúc:

```tsx
<Input
  id="product_price"
  name="product_price"
  type="number"
  step="1"                                              // VND: bước 1 đồng, không 0.01
  min="0"
  defaultValue={toPriceInputValue(product.product_price)}   // ⭐ "250000"
/>
```

> **Bài học chung:** một hàm format dùng cho **hiển thị** và **giá trị input** là hai nhu cầu khác
> nhau. Gộp chúng vào một hàm sớm hay muộn cũng gây bug. Tách ngay từ đầu.

### Cập nhật test

📄 `lib/products/__tests__/price.test.ts` hiện tại sẽ đỏ — và đó là điều đúng:

```tsx
import { describe, it, expect } from 'vitest'
import { toPriceString, toPriceNumber, toPriceInputValue } from '@/lib/products/price'

describe('toPriceNumber', () => {
  it('parse number, string, và Decimal128', () => {
    expect(toPriceNumber(250000)).toBe(250000)
    expect(toPriceNumber('250000')).toBe(250000)
    expect(toPriceNumber({ $numberDecimal: '250000' })).toBe(250000)
  })
  it('trả 0 cho giá trị rác', () => {
    expect(toPriceNumber(undefined as unknown as number)).toBe(0)
    expect(toPriceNumber({} as never)).toBe(0)
  })
})

describe('toPriceString', () => {
  it('định dạng VND với dấu phân cách nghìn', () => {
    // ⚠️ Intl dùng U+00A0 (non-breaking space) trước ₫ — không phải space thường.
    // So sánh bằng regex để test không giòn.
    expect(toPriceString(250000)).toMatch(/^250\.000\s?₫$/)
    expect(toPriceString(1500000)).toMatch(/^1\.500\.000\s?₫$/)
  })
  it('không có phần thập phân', () => {
    expect(toPriceString(99000.7)).not.toContain(',')
  })
  it('trả 0 ₫ cho giá trị rác', () => {
    expect(toPriceString({} as never)).toMatch(/^0\s?₫$/)
  })
})

describe('toPriceInputValue', () => {
  it('trả số thuần, không dấu phân cách, để <input type=number> parse được', () => {
    expect(toPriceInputValue(250000)).toBe('250000')
    expect(toPriceInputValue({ $numberDecimal: '250000' })).toBe('250000')
  })
})
```

⚠️ **Chi tiết `\s?` trong regex quan trọng.** `Intl.NumberFormat('vi-VN')` chèn **U+00A0**
(non-breaking space) trước `₫`, không phải space thường. Test dùng `toBe('250.000 ₫')` với space thường
sẽ **đỏ một cách bí ẩn** — bạn nhìn output thấy giống hệt mà test vẫn fail. Đây là một trong những bug
test khó hiểu nhất, và regex `\s?` tránh được nó.

### ⚠️ Nhưng trước khi sửa: xác nhận đơn vị với backend

**Đây là câu hỏi phải hỏi trước khi viết code:**

| Câu hỏi | Nếu câu trả lời là... | Thì |
| --- | --- | --- |
| `product_price` là VND hay USD? | VND | Dùng code trên |
| | USD | Giữ `toFixed(2)`, thêm `$` |
| Lưu bằng **đồng** hay **nghìn đồng**? | Đồng (250000) | Dùng code trên |
| | Nghìn (250) | Phải nhân 1000 khi format |
| Có hỗ trợ nhiều tiền tệ? | Có | Cần lưu `currency` cùng giá |

📄 Comment trong `price.ts` nói `{ $numberDecimal: "9.99" }` — **gợi ý** đây là USD, hoặc chỉ là ví dụ
placeholder. **Đừng đoán.** Kiểm tra dữ liệu thật:

```tsx
// app/debug/page.tsx — kỹ thuật từ file 25, XOÁ SAU KHI XONG
import { apiFetch } from '@/lib/api/server-client'

export default async function DebugPage() {
  const raw = await apiFetch<unknown>('/product?page=1&limit=3')
  return <pre className="overflow-auto p-4 text-xs">{JSON.stringify(raw, null, 2)}</pre>
}
```

Nhìn giá trị thật: `250000` → VND. `9.99` → USD. Một lệnh, hết đoán.

---

## 2. ⭐ Tiền tệ và số thực — bug kinh điển

### Vấn đề

📄 `components/store/cart-line.tsx`:

```tsx
const lineTotal = toPriceString(toPriceNumber(price) * quantity)
```

📄 `lib/cart/summary.ts`:

```tsx
export function cartSubtotal(products: CartProduct[]): number {
  return products.reduce((sum, p) => sum + toPriceNumber(p.price) * p.quantity, 0)
}
```

Cả hai làm **phép toán số thực trên tiền**. Với VND (số nguyên lớn) thì thường ổn. Nhưng:

```js
0.1 + 0.2                      // 0.30000000000000004
19.99 * 3                      // 59.97000000000001
(19.99 * 3).toFixed(2)         // "59.97"  ← may mắn đúng
0.615 * 100                    // 61.49999999999999
Math.round(0.615 * 100) / 100  // 61.49  ← SAI, phải là 61.50
```

Và với VND cũng có giới hạn:

```js
// Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991
// VND: ~9 triệu tỷ đồng — an toàn cho e-commerce
// Nhưng nếu cộng dồn nhiều giao dịch trong báo cáo, có thể chạm ngưỡng
```

### Giải pháp chuẩn: lưu tiền bằng SỐ NGUYÊN của đơn vị nhỏ nhất

```
USD: lưu cents      → $19.99 = 1999
VND: lưu đồng       → 250.000 ₫ = 250000  (VND không có đơn vị nhỏ hơn)
```

**Với VND, may mắn là bạn đã ở đó** — nếu backend lưu số nguyên đồng. Nhưng phải làm cho điều đó **tường
minh trong kiểu** (file `21`):

```tsx
// types/money.ts
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

/** Số tiền tính bằng ĐƠN VỊ NHỎ NHẤT (VND: đồng). Luôn là số nguyên. */
export type Money = Brand<number, 'Money'>

export const Money = {
  /** Từ đơn vị nhỏ nhất (giá trị backend trả về) */
  fromMinor(n: number): Money {
    if (!Number.isInteger(n)) {
      // Fail nhanh ở dev; ở production làm tròn để không vỡ trang
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(`Money.fromMinor cần số nguyên, nhận ${n}`)
      }
      return Math.round(n) as Money
    }
    return n as Money
  },
  add(a: Money, b: Money): Money {
    return (a + b) as Money
  },
  /** Nhân với số lượng (số nguyên) — an toàn, không mất chính xác */
  times(a: Money, qty: number): Money {
    return Math.round(a * Math.trunc(qty)) as Money
  },
  /**
   * Áp phần trăm giảm giá. Làm tròn MỘT LẦN ở cuối.
   * `Math.round` thay vì `Math.floor` để không thiên vị về phía shop hay khách.
   */
  percentOff(a: Money, percent: number): Money {
    return Math.round(a * (1 - percent / 100)) as Money
  },
  zero: 0 as Money,
}
```

```tsx
// lib/products/price.ts
import { Money } from '@/types/money'
import type { Decimal } from '@/types/product'

export function toMoney(value: Decimal): Money {
  return Money.fromMinor(toPriceNumber(value))
}

export function formatMoney(value: Money): string {
  return VND.format(value)
}
```

```tsx
// lib/cart/summary.ts
import { Money } from '@/types/money'
import { toMoney } from '@/lib/products/price'
import type { CartProduct } from '@/types/cart'

export function cartSubtotal(products: CartProduct[]): Money {
  return products.reduce(
    (sum, p) => Money.add(sum, Money.times(toMoney(p.price), p.quantity)),
    Money.zero,
  )
}
```

**Ba lợi ích:**

1. **`Money.times` làm tròn một lần** thay vì để float tích lũy sai số qua nhiều phép cộng.
2. **Branded type ngăn nhầm lẫn** — không thể vô tình cộng `Money` với một `number` thường (ví dụ số
   lượng hoặc phần trăm).
3. **`fromMinor` throw ở dev** nếu backend trả số thập phân → bạn phát hiện sai lệch đơn vị **ngay**,
   không phải sau khi khách hàng phàn nàn về hoá đơn lệch 1 đồng.

⚖️ **Trade-off thật:** thêm một lớp abstraction cho một thứ "chỉ là số". Với VND (không có đơn vị nhỏ
hơn) lợi ích nhỏ hơn với USD. **Nhưng** `Money.times` với `Math.round` vẫn giá trị, và branded type
ngăn được class bug "cộng giá với số lượng".

**Ngưỡng đáng làm:** nếu app có giảm giá theo phần trăm, chia tiền cho nhiều shop, hoặc tính thuế —
**có**, vì đó là những chỗ sai số tích lũy. Nếu chỉ cộng giá × số lượng với VND nguyên — có thể bỏ qua.

📄 Repo **có** cả hai: `discount_type: 'percentage'` và `buildShopOrders` chia tiền theo shop.
Nên nó thuộc nhóm "đáng làm".

---

## 3. Format ngày — làm đúng lần này

Nhớ file `13`: repo dùng `toISOString().slice(0, 10)` → `"2026-08-15"`. **Hydration-safe nhưng không
thân thiện với người Việt.**

```tsx
// lib/format/date.ts

/**
 * Formatter tạo một lần ở tầng module.
 *
 * ⭐ `timeZone` CỐ ĐỊNH là chi tiết quan trọng nhất: không chốt nó,
 * server (UTC) và client (UTC+7) cho kết quả khác nhau → hydration mismatch (file 13).
 */
const DATE_VN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATETIME_VN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function parse(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 2026-08-15T10:30:00Z → "15/08/2026" */
export function formatDate(s?: string): string {
  const d = parse(s)
  return d ? DATE_VN.format(d) : ''
}

/** 2026-08-15T10:30:00Z → "15/08/2026 17:30" (đã +7) */
export function formatDateTime(s?: string): string {
  const d = parse(s)
  return d ? DATETIME_VN.format(d) : ''
}
```

**Vì sao cách này hydration-safe** (khác `toLocaleDateString()`):

| | `d.toLocaleDateString()` | `DATE_VN.format(d)` |
| --- | --- | --- |
| Locale | Của môi trường → server ≠ client | Chốt `'vi-VN'` |
| Timezone | Của môi trường → UTC vs UTC+7 | Chốt `'Asia/Ho_Chi_Minh'` |
| Kết quả | **Khác nhau** → mismatch | **Giống nhau** ✅ |

📄 Thay `lib/orders/display.ts`:

```tsx
import { formatDate } from '@/lib/format/date'
import type { OrderStatus } from '@/types/order'

// Giữ tên cũ để không phải sửa call site
export const formatOrderDate = formatDate

export const ORDER_PROGRESSION: OrderStatus[] = ['pending', 'confirmed', 'shipping', 'delivered']
```

Và xoá hai bản `formatDate` trùng lặp ở `comment-section.tsx` và `discount-list.tsx` (chúng là bản copy
y hệt — nhớ file `17`: **trùng lặp tri thức** nên abstract).

### Thời gian tương đối — "2 giờ trước"

Với comment và đơn hàng, thời gian tương đối dễ đọc hơn ngày tuyệt đối:

```tsx
// lib/format/relative-time.ts
const RTF = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/**
 * "2 giờ trước", "hôm qua", "3 ngày trước".
 *
 * ⚠️ `nowMs` là THAM SỐ, không phải Date.now() bên trong —
 * để hàm pure, test được, và KHÔNG gây hydration mismatch (file 12, 13).
 */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((then - nowMs) / 1000)
  const abs = Math.abs(diffSec)

  for (const [unit, secondsInUnit] of UNITS) {
    if (abs >= secondsInUnit || unit === 'second') {
      return RTF.format(Math.round(diffSec / secondsInUnit), unit)
    }
  }
  return ''
}
```

⚠️ **Nhưng thời gian tương đối GÂY hydration mismatch nếu render trực tiếp** — vì `nowMs` ở server
(lúc render) khác `nowMs` ở client (lúc hydrate) vài trăm ms tới vài giây.

**Cách đúng — render ISO trước, đổi sang tương đối sau khi mount** (pattern từ file `13`):

```tsx
// components/ui/relative-time.tsx
'use client'
import { useState, useEffect } from 'react'
import { formatRelativeTime } from '@/lib/format/relative-time'
import { formatDateTime } from '@/lib/format/date'

export function RelativeTime({ iso }: { iso: string }) {
  // Render đầu (server VÀ client) dùng giá trị XÁC ĐỊNH → khớp, không mismatch
  const [text, setText] = useState(() => formatDateTime(iso))

  useEffect(() => {
    const update = () => setText(formatRelativeTime(iso, Date.now()))
    update()
    // Cập nhật mỗi phút — "2 phút trước" không nên đứng yên
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [iso])

  // <time dateTime> cho crawler + screen reader; title cho hover
  return <time dateTime={iso} title={formatDateTime(iso)}>{text}</time>
}
```

📄 Áp vào `comment-section.tsx`:

```tsx
<div className="flex items-center gap-2 text-sm">
  <span className="font-medium">{authorLabel(comment)}</span>
  {comment.createdAt ? (
    <span className="text-muted-foreground"><RelativeTime iso={comment.createdAt} /></span>
  ) : null}
  {/* ... */}
</div>
```

---

## 4. Số lượng và số đếm

```tsx
// lib/format/number.ts
const NUM_VN = new Intl.NumberFormat('vi-VN')

/** 1234 → "1.234" */
export function formatNumber(n: number): string {
  return NUM_VN.format(n)
}

const COMPACT_VN = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })

/** 1234 → "1,2 N" — cho badge, số lượt xem */
export function formatCompact(n: number): string {
  return COMPACT_VN.format(n)
}
```

### Pluralization — vì sao tiếng Việt dễ hơn tiếng Anh

```tsx
// ❌ Tiếng Anh cần xử lý số nhiều
`${count} item${count === 1 ? '' : 's'}`

// ✅ Tiếng Việt không biến đổi danh từ theo số
`${count} sản phẩm`
```

Tiếng Việt thuộc nhóm `other` duy nhất trong CLDR — **không có số nhiều ngữ pháp**. Nên nếu app chỉ
tiếng Việt, bạn không cần `Intl.PluralRules`.

**Nhưng nếu hỗ trợ nhiều ngôn ngữ**, đừng nối chuỗi bằng tay:

```tsx
const PLURAL_EN = new Intl.PluralRules('en-US')

const ITEM_LABEL: Record<Intl.LDMLPluralRule, string> = {
  zero: 'items', one: 'item', two: 'items', few: 'items', many: 'items', other: 'items',
}

export function itemLabelEn(count: number): string {
  return `${count} ${ITEM_LABEL[PLURAL_EN.select(count)]}`
}
```

`Record<Intl.LDMLPluralRule, string>` bắt buộc bạn xử lý đủ 6 dạng — nhớ file `21`.

### Sắp xếp tiếng Việt — `Intl.Collator`

```js
// ❌ So sánh chuỗi thường: sai thứ tự với dấu tiếng Việt
['Áo', 'Ao', 'Ăn'].sort()
// → ['Ao', 'Áo', 'Ăn']  — sai, "Ăn" phải trước "Ao"

// ✅ Intl.Collator hiểu quy tắc tiếng Việt
const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })
['Áo', 'Ao', 'Ăn'].sort(collator.compare)
// → ['Ăn', 'Ao', 'Áo']  ✅
```

`numeric: true` cũng sửa luôn vấn đề sắp xếp số trong chuỗi:

```js
['Size 10', 'Size 2'].sort()                    // ['Size 10', 'Size 2']  ← sai
['Size 10', 'Size 2'].sort(collator.compare)    // ['Size 2', 'Size 10']  ✅
```

📄 Hữu ích nếu repo thêm sắp xếp sản phẩm theo tên ở client, hoặc sort biến thể theo size (file `26`).

### List formatting

```tsx
const LIST_VN = new Intl.ListFormat('vi', { style: 'long', type: 'conjunction' })

LIST_VN.format(['Trắng', 'Đen', 'Xanh'])    // "Trắng, Đen và Xanh"
```

📄 Thay cho `addressParts.join(', ')` trong `orders/[id]/page.tsx`:

```tsx
const addressParts = [shipping.street, shipping.city, shipping.state, shipping.country].filter(Boolean)
// Địa chỉ thì `join(', ')` đúng hơn ListFormat — địa chỉ không dùng "và"
<p>{addressParts.join(', ')}</p>
```

⚖️ **Đây là ví dụ tốt về "không phải lúc nào Intl cũng đúng".** `ListFormat` thêm "và" trước phần tử
cuối — đúng cho danh sách liệt kê ("Trắng, Đen và Xanh"), **sai** cho địa chỉ
("123 Lê Lợi, Quận 1 và TP.HCM" nghe kỳ). Repo đang làm đúng, đừng đổi.

---

## 5. i18n thật — thêm nhiều ngôn ngữ

### Trước khi bắt đầu: bạn có thực sự cần?

📄 Repo hiện có tình trạng lẫn lộn: **UI string tiếng Anh, comment tiếng Việt:**

```tsx
<SubmitButton>Add to cart</SubmitButton>
<CardTitle>Sign in</CardTitle>
<Textarea placeholder={parentId ? 'Write a reply…' : 'Write a comment…'} />
```

```tsx
// Nút Reply cho bất kỳ comment nào (gốc hoặc con).
// Kiểu YouTube 2 tầng: reply luôn treo phẳng dưới comment GỐC (rootId),
```

**Hai lựa chọn, và chúng rất khác nhau về chi phí:**

| Lựa chọn | Công sức | Khi nào chọn |
| --- | --- | --- |
| **Dịch hết sang tiếng Việt, hardcode** | ~4 giờ | Chỉ phục vụ thị trường Việt Nam. **Đây là lựa chọn đúng cho hầu hết trường hợp.** |
| **Thêm i18n layer** (`next-intl`) | ~2 ngày + bảo trì | Thực sự có ≥2 ngôn ngữ trong roadmap |

> ⚠️ **Đừng thêm i18n "cho tương lai".** Nó thêm một lớp gián tiếp vào **mọi** string, một file
> translation phải đồng bộ, và routing phức tạp hơn. Nếu bạn chỉ có tiếng Việt, hardcode tiếng Việt là
> câu trả lời đúng — và bạn có thể thêm i18n sau khi thực sự cần.

### Nếu thực sự cần: `next-intl` và vấn đề với `proxy.ts`

**Đây là chi tiết thực chiến quan trọng nhất của mục này.** `next-intl` cần một middleware để phát hiện
locale và rewrite URL. Nhưng 📄 repo **đã có** `proxy.ts` làm auth (file `12`).

Next.js chỉ cho **một** proxy/middleware. Nên bạn phải **compose** chúng — và thứ tự quan trọng:

```tsx
// proxy.ts
import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { COOKIE, decodeJwt, isExpiringSoon } from '@/lib/auth/tokens'
import { shouldGateShop } from '@/lib/auth/gate'
import type { Tokens } from '@/types/api'

const LOCALES = ['vi', 'en'] as const
const DEFAULT_LOCALE = 'vi'

const intlMiddleware = createIntlMiddleware({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',      // /products (vi) và /en/products (en)
})

/** Bỏ prefix locale để logic auth so khớp path như trước. */
function stripLocale(pathname: string): string {
  for (const l of LOCALES) {
    if (pathname === `/${l}`) return '/'
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1)
  }
  return pathname
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  // ⭐ BƯỚC 1: intl chạy TRƯỚC — nó quyết định URL cuối cùng
  const intlResponse = intlMiddleware(req)

  // Nếu intl redirect (ví dụ / → /vi), trả về ngay. Auth sẽ chạy ở request tiếp theo.
  if (intlResponse.headers.get('location')) return intlResponse

  // ⭐ BƯỚC 2: auth, dùng path ĐÃ BỎ locale
  const pathname = stripLocale(req.nextUrl.pathname)
  const needsAuth = /^\/(seller|cart|checkout|orders)(\/|$)/.test(pathname)
  if (!needsAuth) return intlResponse

  const access = req.cookies.get(COOKIE.ACCESS)?.value
  const refresh = req.cookies.get(COOKIE.REFRESH)?.value
  const clientId = req.cookies.get(COOKIE.CLIENT)?.value

  // ⭐ Giữ locale khi redirect về login — nếu không, người dùng bị đổi ngôn ngữ
  const locale = LOCALES.find((l) => req.nextUrl.pathname.startsWith(`/${l}/`)) ?? DEFAULT_LOCALE
  const loginPath = locale === DEFAULT_LOCALE ? '/login' : `/${locale}/login`

  const redirectToLogin = (): NextResponse => {
    const url = new URL(loginPath, req.url)
    url.searchParams.set('redirect', pathname)
    const res = NextResponse.redirect(url)
    res.cookies.delete(COOKIE.ACCESS)
    res.cookies.delete(COOKIE.REFRESH)
    res.cookies.delete(COOKIE.CLIENT)
    return res
  }

  if (!clientId) return redirectToLogin()

  let payload = access ? decodeJwt(access) : null

  // ⭐ Ghi cookie mới lên intlResponse, KHÔNG tạo NextResponse.next() mới —
  // nếu không, rewrite của intl bị mất
  if (refresh && isExpiringSoon(payload, Date.now())) {
    const tokens = await refreshTokens(clientId, refresh)
    if (!tokens) return redirectToLogin()
    writeCookies(intlResponse, tokens, clientId)
    payload = decodeJwt(tokens.accessToken)
  }

  if (!payload) return redirectToLogin()

  if (shouldGateShop(pathname, payload.roles)) {
    const accountPath = locale === DEFAULT_LOCALE ? '/seller/account' : `/${locale}/seller/account`
    return NextResponse.redirect(new URL(accountPath, req.url))
  }

  return intlResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

**Bốn cạm bẫy trong đoạn này, mỗi cái là một buổi debug nếu không biết:**

| # | Cạm bẫy | Hậu quả |
| --- | --- | --- |
| 1 | Chạy auth trước intl | Path còn prefix `/vi/seller` → `shouldGateShop` không khớp → gate sai |
| 2 | Trả `NextResponse.next()` thay vì `intlResponse` | Rewrite locale bị mất → 404 |
| 3 | Redirect về `/login` cứng | Người dùng tiếng Anh bị đổi sang tiếng Việt |
| 4 | Không `stripLocale` trước khi test `needsAuth` | Route `/en/cart` không được bảo vệ |

📄 Và `lib/auth/gate.ts` **vẫn hoạt động không cần sửa** — vì nó nhận `pathname` làm **tham số**
(file `12`). Nếu nó tự đọc `req.nextUrl.pathname`, bạn sẽ phải sửa nó. **Đây là lợi ích cụ thể của
hàm pure với input tường minh**, thể hiện ở một tình huống mà nó chưa được thiết kế cho.

### Server vs Client translation

```tsx
// Server Component — không gửi file translation xuống client
import { getTranslations } from 'next-intl/server'

export default async function OrdersPage() {
  const t = await getTranslations('orders')
  return <h1 className="text-2xl font-semibold">{t('title')}</h1>
}
```

```tsx
// Client Component — cần translation ở client
'use client'
import { useTranslations } from 'next-intl'

export function AddToCart({ productId, max }: { productId: string; max?: number }) {
  const t = useTranslations('cart')
  return (
    <form action={formAction} className="flex items-end gap-3">
      {/* ... */}
      <SubmitButton>{t('addToCart')}</SubmitButton>
    </form>
  )
}
```

⚠️ **Mỗi Client Component dùng `useTranslations` kéo namespace đó vào client bundle.** Nên nguyên tắc
từ file `08` áp dụng ở đây: **dịch trong Server Component khi có thể**, truyền string đã dịch xuống
client làm prop:

```tsx
// Server Component dịch, Client Component nhận string
<AddToCart productId={product._id} max={product.product_quantity} label={t('addToCart')} />
```

⚖️ **Trade-off:** truyền string qua prop làm component kém tự chứa hơn (nó không tự biết dịch). Với
component dùng ở nhiều nơi, `useTranslations` gọn hơn. **Chọn theo kích thước namespace:** namespace
nhỏ → `useTranslations`; namespace lớn → truyền prop.

---

## 6. Trade-offs

| Kỹ thuật | Lợi ích | Cái giá |
| --- | --- | --- |
| **`Intl.NumberFormat` cho tiền** | Đúng định dạng, đúng ký hiệu, tự động theo locale | Phải tách hàm cho input value; U+00A0 làm test giòn |
| **`Money` branded type** | Ngăn sai số float và nhầm lẫn đơn vị | Thêm abstraction; lợi ích nhỏ hơn với VND nguyên |
| **`Intl.DateTimeFormat` chốt timezone** | Thân thiện + hydration-safe | Verbose hơn `toISOString()` |
| **Thời gian tương đối** | Dễ đọc hơn nhiều | Cần Client Component + interval; phải render ISO trước |
| **`Intl.Collator`** | Sắp xếp đúng tiếng Việt | Chậm hơn so sánh chuỗi thường (không đáng kể) |
| **Hardcode tiếng Việt** | Đơn giản nhất, không lớp gián tiếp | Thêm ngôn ngữ sau phải refactor |
| **`next-intl`** | Nhiều ngôn ngữ, routing, pluralization | Compose với `proxy.ts` phức tạp; bundle tăng; phải bảo trì file dịch |

---

## 7. Best Practices

1. **XÁC NHẬN đơn vị tiền với backend trước khi format.** Dùng trang `/debug` (file `25`) xem dữ liệu
   thật. Đừng đoán từ comment.

2. **Tách hàm format hiển thị khỏi hàm format giá trị input.** `toPriceString` cho UI,
   `toPriceInputValue` cho `<input type="number">`. Gộp chúng sẽ gây bug mất giá.

3. **Tạo `Intl.*Format` một lần ở tầng module.** Khởi tạo tốn ~0.1ms — nhân với hàng trăm item là chi
   phí thật (nguyên tắc từ file `04`).

4. **Chốt cả `locale` VÀ `timeZone`** trong `Intl.DateTimeFormat` — nếu không sẽ hydration mismatch.

5. **Lưu tiền bằng số nguyên đơn vị nhỏ nhất.** Làm tròn **một lần** ở cuối, không ở mỗi bước.

6. **Test tiền tệ dùng regex `\s?`**, không so chuỗi chính xác — `Intl` chèn U+00A0.

7. **Thời gian tương đối: render ISO trước, đổi sau khi mount.** Truyền `nowMs` làm tham số để hàm pure.

8. **`Intl.Collator('vi')` cho mọi sắp xếp chuỗi tiếng Việt.**

9. **Đừng thêm i18n "cho tương lai".** Hardcode tiếng Việt nếu chỉ có một ngôn ngữ.

10. **Nếu thêm `next-intl`: intl middleware chạy TRƯỚC auth, và trả `intlResponse` không phải
    `NextResponse.next()`.** Nhớ `stripLocale` trước khi test path.

11. **Dịch trong Server Component khi có thể** — namespace translation không cần vào client bundle.

---

## Tự kiểm tra

1. Bug tiền tệ trong repo là gì? Nó ảnh hưởng mấy file?
2. Vì sao phải tách `toPriceInputValue` khỏi `toPriceString`? Không tách thì bug gì?
3. Vì sao test tiền tệ phải dùng regex thay vì `toBe('250.000 ₫')`?
4. Vì sao tiền nên lưu bằng số nguyên đơn vị nhỏ nhất? Cho ví dụ sai số.
5. `Intl.DateTimeFormat` chốt `timeZone` giải quyết vấn đề gì của file `13`?
6. Vì sao thời gian tương đối gây hydration mismatch? Cách xử lý?
7. Vì sao `ListFormat` **sai** cho địa chỉ dù đúng cho danh sách?
8. Khi nào KHÔNG nên thêm i18n?
9. Kể bốn cạm bẫy khi compose `next-intl` với `proxy.ts` hiện có.
10. `lib/auth/gate.ts` vì sao không cần sửa khi thêm i18n?

➡️ Tiếp theo: `28-deployment-va-production-ops.md`
