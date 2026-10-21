# 05 — React 19.2: `<Activity>`, `useEffectEvent`, `<ViewTransition>`, `cacheSignal`

> React 19.2 (10/2025) là bản đi kèm Next.js 16. Hai thứ bạn nên biết rõ: `<Activity>` và `useEffectEvent`. Hai thứ còn lại là "biết để không bất ngờ".

---

## 1. `<Activity>` — ẩn UI mà không phá huỷ nó

### Là gì?

```tsx
import { Activity } from 'react'

<Activity mode={isVisible ? 'visible' : 'hidden'}>
  <Sidebar />
</Activity>
```

- `mode="visible"`: hiển thị và hoạt động bình thường.
- `mode="hidden"`: con bị ẩn (`display: none`), **state được giữ nguyên**, **effect bị cleanup** (unmount effect), và cập nhật của nó được render với **ưu tiên thấp nhất** — chỉ khi React rảnh.

### Tại sao tồn tại? — Hai lựa chọn tệ trước đây

```tsx
// Cách 1: điều kiện render → MẤT state khi ẩn
{tab === 'reviews' && <ReviewsTab />}
// Người dùng gõ dở đánh giá → chuyển tab → quay lại → mất hết.

// Cách 2: CSS ẩn → giữ state nhưng effect vẫn chạy, vẫn render khi props đổi
<div hidden={tab !== 'reviews'}><ReviewsTab /></div>
// Video ẩn vẫn phát tiếng, polling ẩn vẫn gọi API, mọi update vẫn render với ưu tiên đầy đủ.
```

`<Activity>` là cách thứ ba: **giữ state như cách 2, nhưng tắt side effect và hạ ưu tiên như thể đã unmount**.

### 🧠 Mô hình tư duy: "đặt app vào nền" như trên điện thoại

> Khi bạn chuyển app trên điện thoại, app cũ không bị tắt — nó **ngủ**: giữ nguyên màn hình bạn đang xem, nhưng không chiếm CPU, không phát nhạc. Mở lại → tiếp tục đúng chỗ.
> `<Activity mode="hidden">` làm điều đó cho một cây component.

Đây cũng là lý do Strict Mode chạy effect 2 lần (file 01): React đang tập cho code của bạn chịu được việc effect bị **cleanup rồi chạy lại** mà state vẫn còn.

### Ví dụ cơ bản: tab giữ trạng thái

```tsx
'use client'
import { Activity, useState } from 'react'

export function ProductInfoTabs({ productId }: { productId: string }) {
  const [tab, setTab] = useState<'details' | 'reviews'>('details')
  return (
    <>
      <button onClick={() => setTab('details')}>Chi tiết</button>
      <button onClick={() => setTab('reviews')}>Đánh giá</button>

      <Activity mode={tab === 'details' ? 'visible' : 'hidden'}>
        <DetailsTab productId={productId} />
      </Activity>
      <Activity mode={tab === 'reviews' ? 'visible' : 'hidden'}>
        {/* Bản nháp đánh giá đang gõ dở vẫn còn khi quay lại */}
        <ReviewsTab productId={productId} />
      </Activity>
    </>
  )
}
```

### Ví dụ: render trước (pre-render) màn hình sắp tới

Vì nội dung `hidden` vẫn được render (ở ưu tiên thấp), bạn có thể **chuẩn bị trước** màn hình người dùng có khả năng mở — kể cả tải dữ liệu qua Suspense:

```tsx
// Bước 1 checkout đang hiển thị; bước 2 được render sẵn ở nền
<Activity mode={step === 1 ? 'visible' : 'hidden'}><ShippingStep /></Activity>
<Activity mode={step === 2 ? 'visible' : 'hidden'}><PaymentStep /></Activity>
```

Khi người dùng bấm "Tiếp", bước 2 hiện **ngay** — không spinner. (Liên quan: [checkout-wizard.tsx](../../components/store/checkout-wizard.tsx) của repo là một wizard nhiều bước — nơi có thể cân nhắc pattern này nếu muốn giữ dữ liệu khi quay lại bước trước.)

> **Liên hệ Next.js 16:** khi bật Cache Components (file 08), router **không unmount trang cũ khi điều hướng** mà ẩn nó bằng `<Activity mode="hidden">`. Hệ quả: `useState`, nội dung form gõ dở, vị trí scroll được giữ khi bạn đi rồi quay lại. Đó là tính năng — nhưng cũng là bất ngờ nếu bạn mong form trống lại. Next có hướng dẫn riêng: `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.

### When NOT to use

- ❌ **Cây lớn mà người dùng hiếm khi quay lại.** Ẩn ≠ giải phóng: DOM và state vẫn chiếm bộ nhớ. 20 tab ẩn, mỗi tab 2.000 node = trang nặng.
- ❌ **Cần reset state khi ẩn** (form tạo mới phải trống mỗi lần mở) → điều kiện render thường, hoặc đổi `key`.
- ❌ **Component có side effect không nằm trong effect** (ví dụ `<video autoPlay>` — DOM vẫn còn, React chỉ cleanup effect). Bạn phải tự `pause()` trong cleanup của `useLayoutEffect`.

### Trade-offs

| Benefits | Costs |
| --- | --- |
| Giữ state khi ẩn/hiện, không cần nâng state lên cha | Tốn bộ nhớ cho cây bị ẩn |
| Effect được cleanup → không có polling/subscription "ma" | Effect phải viết cleanup đúng (vốn dĩ nên vậy) |
| Pre-render màn hình kế tiếp → chuyển cảnh tức thì | Render nền vẫn tiêu tốn CPU (dù ưu tiên thấp) |

---

## 2. `useEffectEvent` — tách logic "không phản ứng" ra khỏi effect

### Vấn đề nó giải quyết

Đây là một trong những vấn đề khó chịu nhất của `useEffect`. Xem ví dụ:

```tsx
function ChatRoom({ roomId, theme }: { roomId: string; theme: 'light' | 'dark' }) {
  useEffect(() => {
    const conn = connect(roomId)
    conn.on('connected', () => {
      showToast('Đã kết nối!', theme) // dùng theme
    })
    return () => conn.disconnect()
  }, [roomId, theme]) // ⚠️ linter bắt thêm theme
}
```

Người dùng đổi theme sáng → tối → **kết nối chat bị ngắt và nối lại**. Vô lý: theme chỉ dùng để *hiển thị toast*, nó không phải lý do để kết nối lại.

Các cách "chữa" cũ đều tệ:
- Bỏ `theme` khỏi deps + `eslint-disable` → toast dùng theme **cũ** (stale closure), và tắt linter là che giấu bug tương lai.
- Lưu theme vào `useRef` và đồng bộ bằng một effect khác → rườm rà.

### Là gì?

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, theme }: Props) {
  const onConnected = useEffectEvent(() => {
    showToast('Đã kết nối!', theme) // luôn đọc theme MỚI NHẤT
  })

  useEffect(() => {
    const conn = connect(roomId)
    conn.on('connected', () => onConnected())
    return () => conn.disconnect()
  }, [roomId]) // ✅ chỉ roomId — Effect Event không phải dependency
}
```

### 🧠 Mô hình tư duy: phân loại từng giá trị

Với mỗi giá trị effect dùng, hỏi: **"Khi giá trị này đổi, effect có nên chạy lại không?"**

```
 roomId đổi → phải kết nối phòng khác        → REACTIVE  → để trong deps
 theme đổi  → chỉ ảnh hưởng toast lần sau    → NON-REACTIVE → đưa vào useEffectEvent
```

> Effect Event giống một **event handler được gọi từ effect**: như `onClick` luôn thấy state mới nhất khi bạn click, `onConnected` luôn thấy props mới nhất khi sự kiện xảy ra — nhưng bản thân nó không kích hoạt effect.

### Ví dụ thực tế: analytics không làm chạy lại effect

```tsx
'use client'
import { useEffect, useEffectEvent } from 'react'

export function ProductViewTracker({ productId, cartCount }: { productId: string; cartCount: number }) {
  const logView = useEffectEvent((id: string) => {
    analytics.track('product_view', { id, cartCountAtView: cartCount }) // đọc cartCount mới nhất
  })

  useEffect(() => {
    logView(productId) // ✅ chỉ log khi đổi sản phẩm, không log lại khi giỏ hàng đổi
  }, [productId])

  return null
}
```

Ví dụ trong repo: [comment-form.tsx](../../components/store/comment-form.tsx) có effect `[state, onDone]`. `onDone` là callback từ cha — nếu cha truyền một arrow function mới mỗi lần render, effect chạy lại dù `state` không đổi (may mắn là ở đây vô hại vì thân effect kiểm tra `state.message`). Bọc `onDone` trong Effect Event sẽ làm rõ ý định: *chỉ `state` là lý do chạy lại.*

### Quy tắc bắt buộc

- ✅ **Chỉ gọi Effect Event từ bên trong effect** (hoặc từ Effect Event khác).
- ❌ **Không truyền nó cho component khác, không gọi trong render, không dùng làm event handler `onClick`.**
- ❌ **Không đưa vào mảng deps** (ESLint `react-hooks` v6+ hiểu điều này và sẽ không đòi).

### When NOT to use

- ❌ **Để "lách" linter khi giá trị thật sự là reactive.** Nếu `roomId` đổi mà bạn bọc nó vào Effect Event để effect không chạy lại → bug: vẫn kết nối phòng cũ.
- ❌ **Event handler thông thường** (onClick, onSubmit) — chúng vốn đã đọc giá trị mới nhất, không cần.
- ❌ **Effect chỉ có deps reactive** — không có gì để tách.

### Trade-offs

| Benefits | Costs |
| --- | --- |
| Hết stale closure mà không cần `eslint-disable` | Thêm một khái niệm phải phân biệt (reactive vs non-reactive) |
| Effect chỉ chạy lại khi thật sự cần | Dễ bị lạm dụng để giấu dependency thật |
| Thay thế pattern `useRef` + effect đồng bộ | Giới hạn chỗ được gọi (chỉ trong effect) |

---

## 3. `<ViewTransition>` — hoạt ảnh chuyển cảnh (thử nghiệm)

```tsx
import { ViewTransition } from 'react'

<ViewTransition>
  <ProductImage src={src} />
</ViewTransition>
```

Bọc phần tử để trình duyệt (View Transitions API) tự tạo hoạt ảnh khi nó thay đổi **trong một transition** (`startTransition`, navigation, Suspense hiện nội dung). Ví dụ: ảnh sản phẩm "bay" từ lưới sang trang chi tiết.

**Trạng thái:** vẫn ở **kênh Canary/thử nghiệm** của React. Trong Next.js 16 phải bật cờ:

```ts
// next.config.ts
experimental: { viewTransition: true }
```

✅ Khuyến nghị: thử ở nhánh riêng, **chưa dùng cho production** của repo này. API có thể còn đổi.

---

## 4. `cacheSignal` — huỷ việc khi cache hết hạn (Server Components)

```tsx
import { cache, cacheSignal } from 'react'

const getProduct = cache(async (id: string) => {
  return fetch(`${API}/product/${id}`, { signal: cacheSignal() })
})
```

Chỉ dùng trong **Server Components**. `cacheSignal()` trả về `AbortSignal` bị huỷ khi phạm vi `cache()` kết thúc (render xong, bị huỷ, hoặc lỗi) → request còn treo được dọn dẹp thay vì chạy vô ích.

Bạn hiếm khi gọi trực tiếp trong ứng dụng Next — chủ yếu cho tác giả thư viện / data layer.

---

## 5. Những thứ khác trong 19.2 (biết để không bất ngờ)

- **Performance Tracks trong Chrome DevTools**: tab Performance hiện track riêng "Scheduler" (làn khẩn cấp vs transition — đúng mô hình file 01) và "Components". Công cụ tốt nhất để thấy transition đang hoạt động.
- **Partial Pre-rendering ở cấp React** (`prerender` + `resume`): nền móng mà Next.js dùng cho PPR (file 08). Bạn không gọi trực tiếp.
- **Suspense boundary trên server được gom (batch) khi lộ ra**: nội dung stream tới gần nhau sẽ hiện cùng lúc thay vì nhấp nháy từng mẩu.
- **`eslint-plugin-react-hooks` v6**: hiểu `useEffectEvent`, thêm các rule phục vụ React Compiler.

---

## Best Practices

1. ✅ **Dùng `<Activity>` khi "mất state lúc ẩn" là vấn đề thật** (tab có form, wizard, sidebar có scroll). Không dùng cho mọi điều kiện render.
2. ✅ **Trước khi dùng `useEffectEvent`, phân loại từng giá trị**: "đổi cái này có nên chạy lại effect không?" Chỉ cái trả lời "không" mới vào Effect Event.
3. ✅ **Effect luôn có cleanup đúng** — cả `<Activity>` lẫn Strict Mode đều dựa vào điều này.
4. ✅ **Tính năng Canary (`<ViewTransition>`) để ở nhánh thử nghiệm**, không merge vào luồng production.

---

**Trước:** [04 — `use()` & API mới](./04-react19-use-and-new-apis.md) · **Tiếp theo:** [06 — Server & Client Components](./06-server-and-client-components.md)
