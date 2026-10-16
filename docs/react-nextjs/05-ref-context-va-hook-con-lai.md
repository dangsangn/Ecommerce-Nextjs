# 05. `useRef`, Context, và các hook còn lại

> **Mục tiêu:** nắm những hook ít dùng nhưng quan trọng khi cần, hiểu Context giải quyết vấn đề gì
> (và vì sao App Router làm nó ít cần hơn nhiều), và biết React 19 đã đơn giản hoá `ref` thế nào.

---

## Phần I — `useRef`

### 1. Overview

`useRef` là một "cái hộp" tồn tại qua các lần render, nhưng **đổi nó không gây re-render**.

| | Tồn tại qua render? | Đổi thì render lại? | Dùng khi |
| --- | --- | --- | --- |
| Biến local | ❌ | ❌ | Giá trị tạm trong một lần render |
| `useRef` | ✅ | ❌ | Ghi nhớ nhưng UI không phụ thuộc |
| `useState` | ✅ | ✅ | UI phụ thuộc giá trị này |

### 2. Mental Model

### 🧠 Ref như cuốn sổ tay cạnh bàn

State là **bản vẽ** — sửa thì phải vẽ lại bảng. Ref là **sổ tay** — ghi gì cũng được, không ai vẽ lại
bảng vì nó.

> **Hiển thị `ref.current` trong JSX gần như chắc chắn là sai công cụ** — UI không cập nhật khi nó đổi.

Hai công dụng khác hẳn nhau: **(a) truy cập DOM node**, **(b) lưu giá trị mutable không liên quan
render** (timer ID, subscription, giá trị lần trước).

### 3. Practical Example — `useRef` trong repo

📄 `components/products/image-manager.tsx` — ref tới `<input type="file">` bị ẩn:

```tsx
const inputRef = useRef<HTMLInputElement>(null)

<input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
       onChange={(e) => upload(e.target.files)} />
<Button type="button" onClick={() => inputRef.current?.click()}>Upload images</Button>

// trong upload(), sau khi xong:
// Let the same file be picked again after a failure.
if (inputRef.current) inputRef.current.value = ''
```

Đúng chỗ dùng ref: `click()` và reset `value` của file input là **DOM imperative API** — không có
cách khai báo nào cho chúng. Ref được chạm trong **event handler** và callback, không trong render.

📄 `components/store/comment-form.tsx` — `<form ref={ref}>` rồi `ref.current?.reset()` trong effect
sau khi post thành công. ⚠️ Từ React 19 dòng này **thừa**: form có `action={fn}` được React **tự
reset** (các field uncontrolled) khi action xong. Nếu muốn reset chủ động ở chỗ khác, dùng
`requestFormReset(form)` từ `react-dom` (file `03`, ví dụ #3).

**Vì sao luôn `?.`?** `ref.current` là `null` trước khi node mount và **sau khi unmount** (React gán
`null` khi tháo node).

### 4. React 19: `ref` là prop — tạm biệt `forwardRef`

`<form ref>` chạy vì `form` là DOM element. Với **component** (`<Input>`, `<Textarea>`), React 18 bắt
buộc `forwardRef`. React 19 thì không:

```tsx
// ❌ React 18 — boilerplate
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  return <input ref={ref} {...props} />
})

// ✅ React 19 — 📄 components/ui/input.tsx
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <InputPrimitive type={type} data-slot="input" className={cn("...", className)} {...props} />
}
// ref đi qua ...props: <Input ref={searchRef} /> chạy được
```

`forwardRef` vẫn hoạt động nhưng sẽ bị deprecate — code mới không dùng nữa.

### 5. `useRef` cho giá trị mutable

```tsx
// Debounce ô tìm kiếm: giữ timer ID qua các render, không cần re-render khi đổi
function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])  // dọn khi unmount
  return (...args: A) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), ms)
  }
}
```

⚠️ **KHÔNG đọc/ghi `ref.current` trong lúc render** (ngoại lệ duy nhất: khởi tạo lười
`if (ref.current === null) ref.current = new X()`).

```tsx
function ProductViewCounter() {
  const count = useRef(0)
  count.current++                        // ❌ mutate trong render → bản nháp bị bỏ vẫn tăng
  return <div>{count.current}</div>      // ❌ đọc trong render → UI không đáng tin
}
```

Nhớ mô hình "bản nháp có thể xé" (file `01`): render bị bỏ và chạy lại → `count.current` tăng 2 lần cho
một lần hiển thị. Ref chỉ chạm trong **effect** hoặc **event handler**. (React Compiler cũng bail out
component vi phạm quy tắc này.)

### 6. Ref callback + cleanup (React 19)

`ref` nhận function; React 19 cho function đó **trả về cleanup**:

```tsx
<ul
  ref={(node) => {
    if (!node) return
    // Lazy-load ảnh sản phẩm khi danh sách vào viewport
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    })
    observer.observe(node)
    return () => observer.disconnect()   // React 19: cleanup khi node bị tháo
  }}
/>
```

Trước React 19, React gọi lại ref với `null` lúc unmount và bạn phải tự xử lý — dễ quên. Có cleanup
thì React **không** gọi với `null` nữa.

⚠️ TypeScript: ref callback dạng arrow **trả về giá trị ngầm** giờ bị báo lỗi, vì React hiểu giá trị
trả về là cleanup:

```tsx
<div ref={(n) => (instance = n)} />    // ❌ trả về n → TS lỗi
<div ref={(n) => { instance = n }} />  // ✅
```

⚖️ Ref callback inline là function mới mỗi render → React chạy cleanup + gắn lại mỗi render. Với
observer đắt, hoist callback ra ngoài hoặc dùng `useCallback`.

### 7. `useImperativeHandle` — khi nào

Dùng khi muốn **giới hạn** những gì cha làm được với con:

```tsx
interface OtpFormHandle { focusFirstDigit(): void; clear(): void }

function OtpForm({ ref }: { ref?: React.Ref<OtpFormHandle> }) {   // React 19: ref là prop
  const formRef = useRef<HTMLFormElement>(null)
  useImperativeHandle(ref, () => ({
    focusFirstDigit: () => formRef.current?.querySelector<HTMLInputElement>('input')?.focus(),
    clear: () => formRef.current?.reset(),
  }), [])
  return <form ref={formRef}>...</form>
}
```

Cha chỉ thấy `focusFirstDigit()` và `clear()`, không thấy DOM node — **encapsulation**. Chỉ đáng dùng
cho hành động **không mô hình hoá được bằng prop** (focus, scroll, play/pause, mở dialog).

---

## Phần II — Context

### 8. Overview & Mental Model

Context giải quyết **prop drilling**: truyền giá trị qua nhiều tầng chỉ để tầng cuối dùng.

### 🧠 Context như hệ thống loa phát thanh của toà nhà

Provider là cái loa: mọi phòng **bên dưới** nghe được. Nhưng:

- **Có tin mới thì mọi phòng nghe loa đều phản ứng** — mọi consumer re-render khi value đổi, dù chỉ
  dùng một field
- **Không có loa thì nghe giá trị mặc định** — chuyện đang xảy ra trong repo này

### 9. React 19: `<Context>` làm Provider, `use(Context)` đọc có điều kiện

```tsx
const CartContext = createContext<CartValue | null>(null)

// React 18
<CartContext.Provider value={cart}>{children}</CartContext.Provider>
// React 19 — Context.Provider sẽ bị deprecate
<CartContext value={cart}>{children}</CartContext>
```

```tsx
import { use } from 'react'

function PriceTag({ showCurrency, amount }: { showCurrency: boolean; amount: number }) {
  if (!showCurrency) return <span>{amount}</span>
  const { currency } = use(LocaleContext)   // ✅ use() gọi được sau early return / trong if
  return <span>{formatPrice(amount, currency)}</span>
}
```

### 10. ⚠️ Context không có Provider — tìm thấy trong repo

📄 `components/ui/sonner.tsx`:

```tsx
"use client"
import { useTheme } from "next-themes"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  return <Sonner theme={theme as ToasterProps["theme"]} ... />
}
```

`useTheme()` là `useContext` của `next-themes` — nhưng **không có `<ThemeProvider>` ở đâu trong repo**
(`app/layout.tsx` chỉ render `{children}` + `<Toaster>`). `useTheme()` trả default, `theme` luôn
`"system"`. Không crash, không warning — chỉ là **hành vi sai im lặng**.

**Bài học 1 — Context tự viết nên throw khi thiếu Provider:**

```tsx
const CartContext = createContext<CartValue | null>(null)

export function useCart(): CartValue {
  const ctx = use(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
```

**Bài học 2 — cách sửa (nếu muốn dark mode):**

```tsx
// app/layout.tsx
import { ThemeProvider } from 'next-themes'

<html lang="en" suppressHydrationWarning className={...}>
  <body className="min-h-full flex flex-col">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  </body>
</html>
```

`suppressHydrationWarning` trên `<html>` là bắt buộc: `next-themes` ghi class lên `<html>` bằng script
chạy trước hydration, nên server HTML và DOM client **cố tình** khác nhau (file `13`). Lưu ý
`ThemeProvider` là Client Component nhưng bọc `{children}` không biến children thành client — Server
Component truyền qua `children` vẫn render trên server (file `08`).

### 11. Vì sao repo này không có `createContext` nào

Một app e-commerce đủ auth, cart, orders, products, discounts — **0 `createContext`**. Ba lý do:

**(a) Server Component tự đọc dữ liệu — không có gì để drill.**

📄 `components/store/store-header.tsx`:

```tsx
export async function StoreHeader({ q = '' }: { q?: string }) {
  const payload = await getAccessPayload()                 // đọc cookie
  const isShop = Boolean(payload?.roles?.includes('shop'))
  let cartCount = 0
  if (payload) {
    try {
      const cart = await apiFetch<Cart>('/cart', { auth: true })
      cartCount = cart.cart_count_product ?? 0
    } catch { cartCount = 0 }
  }
```

Trong SPA, "user hiện tại" và "số lượng giỏ" là ứng viên kinh điển của `AuthContext`/`CartContext`.
Ở đây mọi Server Component cần thì tự gọi `getAccessPayload()` (`app/(seller)/seller/page.tsx`,
`app/(seller)/seller/account/page.tsx` cũng vậy).

*"Gọi nhiều lần có tốn không?"* `getAccessPayload` chỉ đọc cookie + decode JWT (`lib/auth/session.ts`)
— rẻ. Với hàm gọi mạng: `fetch` GET cùng URL + options được Next **memoize trong một request**;
hàm không dùng `fetch` (ORM, SDK) thì bọc `React.cache()` (file `10`).

```tsx
// lib/auth/current-user.ts — mẫu cho dữ liệu đắt cần ở nhiều Server Component
import 'server-only'
import { cache } from 'react'
export const getCurrentUser = cache(async () => {
  const payload = await getAccessPayload()
  return payload ? apiFetch<User>('/user/me', { auth: true }) : null
})  // 5 component gọi → 1 lần chạy cho mỗi request
```

**(b) Dữ liệu tĩnh đi qua module.** 📄 `components/seller/nav-items.ts` export `NAV_ITEMS` và
`isNavItemActive`; `SellerSidebar` và `SellerMobileNav` cùng `import`.

> Dữ liệu tĩnh → `import`. Dữ liệu động cần chia sẻ → server, URL, rồi mới đến Context.

**(c) State động dùng chung sống trong URL** — tab, page, search query (file `02`).

### 12. Khi nào Context vẫn thực sự cần

| Tình huống | Vì sao Context |
| --- | --- |
| Theme, locale | State client, mọi nơi cần |
| Compound component (`Select` → `SelectItem`) | Các phần nói chuyện qua nhiều tầng |
| Optimistic cart chưa lưu server | State chỉ ở client, nhiều component đọc |
| Form library (react-hook-form) | Field ở sâu cần trạng thái form |
| Chia sẻ **promise** từ Server Component xuống nhiều Client Component | Xem dưới |

📄 Repo dùng compound component gián tiếp: `components/ui/select.tsx` bọc `@base-ui/react`, thư viện
dùng Context bên trong — `SelectItem` biết mình đang được chọn mà không nhận prop nào từ `Select`:

```tsx
<Select name="discount_type" value={type} onValueChange={(v) => setType(v as DiscountType)}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="fixed_amount">Fixed amount</SelectItem>
    <SelectItem value="percentage">Percentage</SelectItem>
  </SelectContent>
</Select>
```

**Pattern App Router: Context chứa Promise** (theo docs Next 16). Layout (server) bắt đầu fetch nhưng
**không await**, truyền promise vào Provider; Client Component nào cần thì `use()` nó trong `<Suspense>`:

```tsx
// app/(store)/layout.tsx — Server Component
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const cartPromise = getCart()               // không await → không chặn render
  return <CartProvider cartPromise={cartPromise}>{children}</CartProvider>
}

// components/store/cart-provider.tsx
'use client'
export const CartContext = createContext<Promise<Cart> | null>(null)
export function CartProvider({ cartPromise, children }: { cartPromise: Promise<Cart>; children: React.ReactNode }) {
  return <CartContext value={cartPromise}>{children}</CartContext>
}

// components/store/cart-count.tsx
'use client'
export function CartCount() {
  const cartPromise = use(CartContext)
  if (!cartPromise) throw new Error('CartCount must be inside <CartProvider>')
  const cart = use(cartPromise)               // suspend tới khi có data
  return <span>{cart.cart_count_product}</span>
}
// <Suspense fallback={<span>…</span>}><CartCount /></Suspense>
```

### 13. Cạm bẫy hiệu năng của Context

```tsx
// ❌ Value là object mới mỗi render → MỌI consumer render lại mỗi lần cha render;
//    đổi theme → component chỉ dùng `user` cũng render lại
<AppContext value={{ user, cart, theme, setTheme }}>
```

**(a) Chia nhỏ theo tần suất thay đổi:**

```tsx
<UserContext value={user}>          {/* đổi rất ít */}
  <ThemeContext value={theme}>      {/* đổi khi toggle */}
    <CartContext value={cart}>      {/* đổi thường xuyên */}
```

**(b) Tách state khỏi actions** — component chỉ dispatch không bao giờ render lại:

```tsx
const [cart, dispatch] = useReducer(cartReducer, initialCart)
<CartStateContext value={cart}>
  <CartDispatchContext value={dispatch}>   {/* dispatch có identity ổn định */}
```

---

## Phần III — Các hook còn lại

### 14. `useId` — ID ổn định cho SSR

Hardcode `id` → component dùng hai lần trên một trang bị trùng ID. `Math.random()`/counter toàn cục →
server và client sinh khác nhau → hydration mismatch. `useId` sinh ID **deterministic**, khớp hai phía
(React 19.2 đổi prefix thành `_r_…_` để hợp lệ làm CSS selector / `view-transition-name`).

⚠️ 📄 `components/products/attribute-fields.tsx` dùng `name` làm `id`:

```tsx
// ❌ render <AttributeFields> hai lần (vd. trang so sánh) → hai id="brand", label focus sai input
function Field({ name, label, required, defaultValue }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? '' : ' (optional)'}</Label>
      <Input id={name} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}

// ✅ id cho DOM từ useId, name cho FormData giữ nguyên — hai mục đích khác nhau
function Field({ name, label, required, defaultValue }) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? '' : ' (optional)'}</Label>
      <Input id={id} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}
```

Hiện chưa lỗi (mỗi form xuất hiện một lần; `login-form.tsx` cũng hardcode `id="email"`), nhưng mong
manh. Nhiều ID trong một component: một `useId` làm prefix — `` `${uid}-email` ``.

⚠️ **Không dùng `useId` làm `key`** — `key` gắn với **dữ liệu** (`product._id`).

### 15. `useSyncExternalStore` — đọc store ngoài React an toàn

Trong concurrent rendering, nếu đọc external store (`matchMedia`, store tự viết) ở hai chỗ trong một
lần render và store đổi giữa chừng → UI nửa cũ nửa mới (**tearing**). `useSyncExternalStore` bảo đảm
mọi lần đọc trong một render thấy cùng snapshot:

```tsx
'use client'
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {                                   // subscribe
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,           // getSnapshot (client)
    () => false,                                      // getServerSnapshot — bắt buộc khi SSR
  )
}
```

**Vì sao repo không cần** — 📄 `app/(seller)/seller/layout.tsx` làm responsive **bằng CSS**:

```tsx
<aside className="sticky top-0 hidden h-screen w-60 shrink-0 ... md:block">
  <SellerSidebar />
</aside>
<div className="flex min-w-0 flex-1 flex-col">
  <SellerMobileNav />          {/* bên trong: <div className="md:hidden"> */}
  <main className="flex-1 p-6 md:p-10">{children}</main>
</div>
```

| | CSS (repo chọn) | JS `useMediaQuery` |
| --- | --- | --- |
| SSR | ✅ HTML đúng từ byte đầu | ❌ Server không biết viewport, phải đoán |
| Hydration / nhấp nháy | ✅ Không | ⚠️ Server đoán `false`, client `true` → nhảy layout |
| HTML gửi xuống | Cả hai nhánh | Một nhánh |

> Responsive bằng CSS trước. `useMediaQuery` chỉ khi cần **logic JS khác nhau** theo kích thước.

### 16. `useLayoutEffect` — đo rồi sửa trước paint

Chạy **đồng bộ sau khi DOM cập nhật, TRƯỚC paint**:

```tsx
useLayoutEffect(() => {
  const { height, bottom } = tooltipRef.current!.getBoundingClientRect()
  // Không đủ chỗ phía dưới → lật tooltip lên trên, trước khi người dùng thấy
  setPlacement(window.innerHeight - bottom < height ? 'top' : 'bottom')
}, [isOpen])
```

Dùng `useEffect` ở đây → tooltip nhảy một frame.

Trên server `useLayoutEffect` **không chạy** (không có DOM). React 19 đã **bỏ warning** SSR của nó, nên
hack `useIsomorphicLayoutEffect` không còn cần thiết. Chỉ cần nhớ: HTML từ server là trạng thái *trước*
khi đo. `useEffect` vẫn là mặc định; chuyển sang `useLayoutEffect` khi thấy nhấp nháy thật.

### 17. `<Activity>` — giữ state của cây UI đang ẩn (React 19.2)

```tsx
import { Activity } from 'react'

function ProductTabs({ tab }: { tab: 'desc' | 'specs' | 'reviews' }) {
  return (
    <>
      <Activity mode={tab === 'desc' ? 'visible' : 'hidden'}><Description /></Activity>
      <Activity mode={tab === 'specs' ? 'visible' : 'hidden'}><Specs /></Activity>
      {/* Đang gõ dở review, chuyển tab rồi quay lại → nội dung vẫn còn */}
      <Activity mode={tab === 'reviews' ? 'visible' : 'hidden'}><ReviewForm /></Activity>
    </>
  )
}
```

Khi `hidden`: DOM được giữ nhưng `display: none`, **state giữ nguyên**, **effect bị cleanup** (chạy
lại khi `visible`), và cây con vẫn có thể render ở ưu tiên thấp (pre-render tab sắp mở).

⚠️ DOM ẩn vẫn tồn tại → input ẩn **vẫn có trong `FormData`** khi submit (ví dụ form discount ở file
`02`, mục 3.3); video/audio đang phát cần tự pause trong cleanup của effect.

**Phù hợp:** tab, wizard cho phép lùi bước, pre-render màn hình sắp tới. Với field nhỏ người dùng ít
chuyển qua lại, render `null` vẫn đơn giản hơn.

### 18. Hook React 19 khác — ở chương nào

| Hook / API | Dùng để | Chương |
| --- | --- | --- |
| `useEffectEvent` (19.2) | Đọc giá trị mới nhất trong effect mà không thành dependency | `03` |
| `use(promise)` | Đọc Promise trong render, kết hợp Suspense | `06` |
| `useTransition`, `useDeferredValue` (có `initialValue` từ 19) | Cập nhật không gấp | `07` |
| `useOptimistic` | UI lạc quan trong Action | `07` |
| `useActionState`, `useFormStatus` (`react-dom`) | Trạng thái/pending của form action | `11` |

---

## 19. Trade-offs — bảng tổng hợp

| Công cụ | Lợi ích | Cái giá |
| --- | --- | --- |
| `useRef` | Cửa vào DOM; lưu giá trị không gây render | Không reactive; chạm trong render là vi phạm pure |
| Context | Xoá prop drilling | Mọi consumer render khi value đổi; thiếu Provider lỗi im lặng |
| `useId` | Không trùng ID, SSR-safe | Không dùng làm key |
| `useSyncExternalStore` | Không tearing | Cần `getServerSnapshot`; CSS thường đơn giản hơn |
| `useLayoutEffect` | Đo-rồi-sửa trước paint | Chặn paint → jank nếu chậm |
| `useImperativeHandle` | Encapsulation | Thêm tầng gián tiếp |
| `<Activity>` | Giữ state khi ẩn | DOM vẫn tồn tại (memory, FormData) |

---

## 20. Best Practices

1. **`ref.current` chỉ chạm trong effect/handler**, luôn dùng `?.`.
2. **React 19: không viết `forwardRef` mới**; ref callback trả cleanup thay vì xử lý `null`.
3. **Context tự viết: default `null` + throw khi thiếu Provider** (bài học `next-themes`).
4. **Chia nhỏ Context theo tần suất thay đổi**, tách state khỏi dispatch.
5. **`useId` cho mọi cặp `label`/`input` trong component tái sử dụng**; không dùng `name` làm `id`.
6. **Responsive bằng CSS trước** (`seller/layout.tsx`).
7. **Trước khi tạo Context trong App Router, hỏi:** Server Component đọc trực tiếp được không? Có thuộc
   về URL không?

---

## Tự kiểm tra

1. Vì sao không được đọc/ghi `ref.current` trong render?
2. Vì sao `ref.current?.reset()` trong `comment-form.tsx` là thừa từ React 19?
3. `useTheme()` trong `sonner.tsx` trả gì khi không có Provider? Vì sao lỗi này khó tìm?
4. Ba lý do khiến repo không có `createContext` nào? Khi nào bạn sẽ cần `cache()`?
5. `useSyncExternalStore` chống vấn đề gì? Vì sao CSS thường tốt hơn cho responsive?
6. `<Activity mode="hidden">` làm gì với state, DOM và effect của cây con?

➡️ Tiếp theo: `06-suspense-va-streaming.md`
