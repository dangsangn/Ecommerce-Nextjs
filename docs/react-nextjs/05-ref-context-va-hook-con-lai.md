# 05. `useRef`, Context, và các hook còn lại

> **Mục tiêu:** nắm những hook ít dùng nhưng quan trọng khi cần, hiểu Context giải quyết vấn đề gì
> (và vì sao App Router làm nó ít cần thiết hơn nhiều), và biết React 19 đã đơn giản hoá `ref` thế nào.

---

## Phần I — `useRef`

### 1. Overview

`useRef` cho bạn một "cái hộp" tồn tại qua các lần render, nhưng **thay đổi nó không gây re-render**.

```tsx
const ref = useRef(initialValue)
// ref.current đọc/ghi tự do, React không quan tâm
```

So sánh ba cách lưu giá trị:

| | Tồn tại qua render? | Đổi thì render lại? | Dùng khi |
| --- | --- | --- | --- |
| Biến local (`let x = 0`) | ❌ | ❌ | Giá trị tạm trong một lần render |
| `useRef` | ✅ | ❌ | Ghi nhớ nhưng UI không phụ thuộc |
| `useState` | ✅ | ✅ | UI phụ thuộc vào giá trị này |

### 2. Mental Model

### 🧠 Ref như một cuốn sổ tay cạnh bàn làm việc

State là **bản vẽ**: sửa bản vẽ thì phải vẽ lại bảng thông báo. Ref là **cuốn sổ tay**: bạn ghi chú
gì trong đó cũng được, không ai đi vẽ lại bảng vì nó.

Từ đó suy ra quy tắc quan trọng:

> **Nếu bạn hiển thị `ref.current` trong JSX, gần như chắc chắn bạn đang dùng sai công cụ.**
> UI sẽ không cập nhật khi giá trị đó đổi.

`useRef` có hai công dụng khác biệt hẳn nhau:

**(a) Truy cập DOM node** — dùng phổ biến nhất
**(b) Lưu một giá trị mutable không liên quan tới render** — timer ID, subscription, giá trị lần trước

### 3. Practical Example — `useRef` trong repo

📄 `components/store/comment-form.tsx` — trường hợp `useRef` duy nhất trong toàn repo:

```tsx
export function CommentForm({ productId, parentId, replyToUserId, onDone }) {
  const [state, formAction] = useActionState(createCommentAction, initialActionState)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message)
      ref.current?.reset()      // ← xoá form sau khi post thành công
      onDone?.()
    } else if (!state.ok && state.message) {
      toast.error(state.message)
    }
  }, [state, onDone])

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {replyToUserId ? <input type="hidden" name="replyToUserId" value={replyToUserId} /> : null}
      <Textarea name="content" placeholder={parentId ? 'Write a reply…' : 'Write a comment…'} required />
      <SubmitButton>{parentId ? 'Reply' : 'Post comment'}</SubmitButton>
    </form>
  )
}
```

**Vì sao `useRef` là lựa chọn đúng ở đây?**

Cần gọi `form.reset()` — một **DOM imperative API**. Không có cách khai báo nào để nói "hãy xoá form
này". Đây đúng là loại việc mà ref sinh ra để làm.

**Chi tiết đáng chú ý — `ref.current?.reset()` dùng optional chaining.** Vì sao cần `?`

Vì `ref.current` có kiểu `HTMLFormElement | null`. Nó là `null` trong hai tình huống:
1. Trước khi form mount lần đầu (nhưng effect chạy sau commit nên lúc đó đã có)
2. **Sau khi form unmount** — React set `ref.current = null` khi tháo node

Tình huống (2) rất thực tế ở đây: `onDone?.()` gọi `close()` ở `CommentSection`, khiến chính
`CommentForm` này bị unmount. Nếu effect chạy trong một thứ tự khác, `?.` là thứ ngăn crash.

**Một điểm quan trọng về React 19:** dòng `<form ref={ref}>` hoạt động vì `form` là element DOM.
Nhưng `<Textarea>` và `<SubmitButton>` là **component**. Ở React 18, để truyền `ref` vào chúng bạn
**bắt buộc** phải bọc `forwardRef`. Ở React 19 thì không:

📄 `components/ui/textarea.tsx`, `components/ui/input.tsx`:

```tsx
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <InputPrimitive type={type} data-slot="input" className={cn("...", className)} {...props} />
}
```

`ref` đi qua `{...props}` như mọi prop khác. Không `forwardRef`, không generic type, không boilerplate.
Đây là một trong những thay đổi có tác động lớn nhất tới trải nghiệm viết component library.

### 4. `useRef` cho giá trị mutable (công dụng b)

Repo chưa dùng, nhưng đây là pattern bạn sẽ cần:

```tsx
// Lưu giá trị của lần render trước
function usedPrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => { ref.current = value })   // ghi SAU khi render
  return ref.current                          // trả về giá trị của lần TRƯỚC
}

// Lưu ID của timer để cleanup
function useDebounce(fn: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fn, ms)
  }
}
```

⚠️ **Quy tắc bất di bất dịch: KHÔNG đọc/ghi `ref.current` trong lúc render.**

```tsx
function Bad() {
  const count = useRef(0)
  count.current++              // ❌ mutate trong render → không pure
  return <div>{count.current}</div>   // ❌ đọc trong render → concurrent mode cho kết quả khác nhau
}
```

Nhớ lại mô hình "bản nháp có thể xé" ở file `01`: nếu render bị bỏ và chạy lại, `count.current` đã bị
tăng 2 lần cho một lần hiển thị. Ref chỉ được chạm tới trong **effect** hoặc **event handler**.

### 5. Ref callback + cleanup (React 19)

`ref` cũng nhận được một function thay vì object. React 19 cho phép function đó **trả về cleanup**:

```tsx
<div
  ref={(node) => {
    if (!node) return
    const observer = new ResizeObserver(() => { /* ... */ })
    observer.observe(node)
    // React 19: return cleanup ngay tại đây
    return () => observer.disconnect()
  }}
/>
```

Trước React 19, bạn phải xử lý trường hợp `node === null` (lúc unmount) để dọn dẹp — dễ quên và dễ
viết sai. Cleanup function làm việc này rõ ràng và đối xứng với `useEffect`.

### 6. `useImperativeHandle` — khi nào

Dùng khi bạn muốn **hạn chế** những gì component cha làm được với con:

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

Cha chỉ thấy `focusFirstDigit()` và `clear()`, không thấy toàn bộ DOM node. Đây là **encapsulation**:
cha không thể đổi `style`, gắn listener, hay `remove()` node.

**Khi nào KHÔNG dùng:** nếu chỉ cần truy cập DOM thông thường, `ref` trực tiếp đơn giản hơn.
`useImperativeHandle` chỉ đáng dùng cho component library cần API rõ ràng, hoặc khi cha cần một hành
động **không mô hình hoá được bằng prop** (focus, scroll, play/pause, mở dialog).

---

## Phần II — Context

### 7. Overview

Context giải quyết **prop drilling**: truyền một giá trị qua nhiều tầng component chỉ để tầng cuối
dùng được.

```
Không có Context:              Với Context:
  App (theme)                    App ─── Provider(theme)
   └ Layout (theme)               └ Layout
      └ Sidebar (theme)              └ Sidebar
         └ Nav (theme)                  └ Nav
            └ Item ← dùng                  └ Item ← useContext(ThemeContext)
```

### 8. Mental Model

### 🧠 Context như hệ thống loa phát thanh của một toà nhà

Provider là cái loa: đặt ở một tầng, mọi phòng **bên dưới** nghe được. Không cần đưa tin qua từng
phòng. Nhưng:

- **Nghe được tin mới thì cả phòng phải phản ứng** — mọi component `useContext` đều re-render khi
  value đổi, dù chỉ dùng một field nhỏ của value
- **Không có loa thì nghe giá trị mặc định** — và đây chính là chuyện đang xảy ra trong repo này

### 9. ⚠️ Một Context không có Provider — tìm thấy trong repo

📄 `components/ui/sonner.tsx`:

```tsx
"use client"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  return <Sonner theme={theme as ToasterProps["theme"]} ... />
}
```

`useTheme()` là một `useContext` của `next-themes`. Nhưng 📄 `app/layout.tsx`:

```tsx
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
```

**Không có `<ThemeProvider>` nào.** Không có Provider ở bất cứ đâu trong repo.

**Hệ quả:** `useTheme()` trả về giá trị mặc định của context. Nhờ `const { theme = "system" }`,
code **không crash** — nhưng `theme` **luôn** là `"system"`, và người dùng không có cách nào đổi
sang light/dark.

**Bài học ở đây có hai lớp:**

1. **Context không có Provider vẫn "chạy"** — nó lặng lẽ trả về default. Đây là nguồn bug cực khó
   tìm: không có lỗi, không có warning, chỉ là *hành vi sai*. Nếu bạn tạo Context, hãy cân nhắc để
   default là `null` và throw khi thiếu Provider:

   ```tsx
   const CartContext = createContext<CartValue | null>(null)

   export function useCart(): CartValue {
     const ctx = useContext(CartContext)
     if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
     return ctx
   }
   ```
   Thất bại ồn ào tốt hơn hành vi sai im lặng.

2. **Cách sửa cho repo này** (nếu muốn dark mode hoạt động):

   ```tsx
   // app/layout.tsx
   import { ThemeProvider } from 'next-themes'

   export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
     return (
       <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ...`}>
         <body className="min-h-full flex flex-col">
           <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
             {children}
             <Toaster richColors position="top-right" />
           </ThemeProvider>
         </body>
       </html>
     )
   }
   ```

   `suppressHydrationWarning` trên `<html>` là **bắt buộc**: `next-themes` ghi class lên `<html>` bằng
   một script chạy trước hydration, nên HTML từ server và DOM ở client **cố tình** khác nhau. Xem
   file `13-render-pipeline-va-hydration.md` để hiểu tại sao đây là ngoại lệ hợp lệ duy nhất.

### 10. React 19: Context dùng trực tiếp làm Provider

```tsx
const ThemeContext = createContext('light')

// React 18 và trước
<ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>

// React 19 — gọn hơn, và đối xứng với cách consume
<ThemeContext value="dark">{children}</ThemeContext>
```

Và có thể đọc context bằng `use()` thay vì `useContext()` — `use()` có thêm khả năng gọi **có điều kiện**:

```tsx
import { use } from 'react'

function Item({ compact }: { compact: boolean }) {
  if (compact) {
    // ✅ use() gọi được trong nhánh điều kiện — useContext thì không
    const theme = use(ThemeContext)
    return <span className={theme}>...</span>
  }
  return <div>...</div>
}
```

### 11. Vì sao repo này không có Context nào

Đây là quan sát đáng giá: một ứng dụng e-commerce đầy đủ (auth, cart, orders, products, discounts)
mà **không có `createContext` nào cả**. Ba lý do:

**(a) Server Component đọc dữ liệu trực tiếp — không cần chuyền qua cây.**

📄 `components/store/store-header.tsx`:

```tsx
export async function StoreHeader({ q = '' }: { q?: string }) {
  const payload = await getAccessPayload()
  const isShop = Boolean(payload?.roles?.includes('shop'))
  let cartCount = 0
  if (payload) {
    try {
      const cart = await apiFetch<Cart>('/cart', { auth: true })
      cartCount = cart.cart_count_product ?? 0
    } catch { cartCount = 0 }
  }
  // ...
```

Trong một SPA thuần, "user hiện tại" và "số lượng giỏ hàng" là hai ứng viên Context kinh điển
(`AuthContext`, `CartContext`) — vì header, sidebar, product page đều cần chúng.

Ở đây, `StoreHeader` **tự đọc** từ cookie và API. Bất kỳ Server Component nào cần cũng làm y hệt:

📄 `app/(seller)/seller/account/page.tsx`:

```tsx
const payload = await getAccessPayload()
const isShop = Boolean(payload?.roles?.includes('shop'))
```

📄 `app/(seller)/seller/page.tsx`:

```tsx
const payload = await getAccessPayload()
```

**Không có prop drilling nào để giải quyết**, vì mỗi component tự lấy dữ liệu nó cần. Đây là thay đổi
mô hình tinh thần quan trọng nhất khi chuyển từ SPA sang RSC.

*"Nhưng như vậy có gọi API 3 lần không?"* — Không, nhờ **request memoization** của React `cache()` và
Next.js. Chi tiết ở file `10-data-fetching-caching.md`.

**(b) Dữ liệu chia sẻ đi qua module, không qua Context.**

📄 `components/seller/nav-items.ts`:

```tsx
export const NAV_ITEMS: SellerNavItem[] = [ ... ]

export function isNavItemActive(href: string, pathname: string): boolean {
  return href === '/seller'
    ? pathname === '/seller'
    : pathname === href || pathname.startsWith(`${href}/`)
}
```

`SellerSidebar` (desktop) và `SellerMobileNav` (mobile) đều import từ đây. Đây là dữ liệu **tĩnh**
nên `import` là công cụ đúng — Context dành cho dữ liệu **động** thay đổi theo runtime.

> **Quy tắc:** dữ liệu tĩnh → `import`. Dữ liệu động cần chia sẻ → Context (hoặc URL, hoặc server).

**(c) State động dùng chung sống trong URL, không trong Context.**

Tab, page, search query — xem lại file `02`. URL là store toàn cục có sẵn.

### 12. Khi nào Context vẫn thực sự cần

| Tình huống | Vì sao Context là đúng |
| --- | --- |
| Theme (light/dark) | Cần state ở client + đọc `localStorage`; mọi component đều cần |
| Locale / i18n | Giống theme |
| Trạng thái mở/đóng của một compound component | `<Select>` phải cho `SelectItem` biết cái nào đang chọn, qua nhiều tầng DOM |
| Optimistic cart chưa lưu server | State chỉ ở client, nhiều component cần đọc |
| Form context (react-hook-form) | Field ở sâu cần biết trạng thái form |

📄 Repo này **đang dùng** loại thứ 3 một cách gián tiếp: `components/ui/select.tsx` bọc `@base-ui/react`,
và thư viện đó dùng Context bên trong để `SelectTrigger`/`SelectContent`/`SelectItem` nói chuyện được
với nhau mà không cần prop drilling:

```tsx
<Select name="discount_type" value={type} onValueChange={(v) => setType(v as DiscountType)}>
  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="fixed_amount">Fixed amount</SelectItem>
    <SelectItem value="percentage">Percentage</SelectItem>
  </SelectContent>
</Select>
```

`SelectItem` biết được nó có đang được chọn hay không mà không nhận prop nào từ `Select`. Đây là
**compound component pattern** — ứng dụng hay nhất của Context.

### 13. Cạm bẫy hiệu năng của Context

Mọi component `useContext(X)` re-render khi **value của X** đổi — kể cả khi nó chỉ dùng một field:

```tsx
// ❌ Value là object mới mỗi render → MỌI consumer render lại mỗi lần cha render
<AppContext value={{ user, cart, theme, setTheme }}>

// ❌ Đổi theme → component chỉ dùng `user` cũng render lại
```

Hai cách sửa:

**(a) Chia nhỏ Context theo tần suất thay đổi:**

```tsx
<UserContext value={user}>        {/* đổi rất ít */}
  <ThemeContext value={theme}>    {/* đổi khi user bấm toggle */}
    <CartContext value={cart}>    {/* đổi thường xuyên */}
```

**(b) Tách "state" khỏi "actions"** — actions có identity ổn định nên component chỉ dispatch sẽ không
bao giờ render lại:

```tsx
<CartStateContext value={cart}>           {/* đổi khi cart đổi */}
  <CartActionsContext value={actions}>    {/* useMemo(() => ({add, remove}), []) — không bao giờ đổi */}
```

---

## Phần III — Các hook còn lại

### 14. `useId` — ID ổn định cho SSR

**Vấn đề:** bạn cần `id` để nối `<label htmlFor>` với `<input id>`. Nếu bạn hardcode, component
dùng hai lần trên cùng một trang sẽ có ID trùng — và `<label>` sẽ focus vào input sai.

Bạn cũng **không thể** dùng `Math.random()` hay một counter toàn cục, vì server và client sẽ sinh ra
giá trị khác nhau → hydration mismatch.

`useId` sinh ID **xác định** (deterministic), khớp giữa server và client:

```tsx
function Field({ label, ...props }: { label: string } & React.ComponentProps<'input'>) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}
```

⚠️ **Repo này hardcode `id` ở mọi nơi** — 📄 `components/auth/login-form.tsx`:

```tsx
<Label htmlFor="email">Email</Label>
<Input id="email" name="email" type="email" required autoComplete="email" />
```

Hiện tại **không có xung đột thực tế**, vì mỗi form chỉ xuất hiện một lần trên trang. Nhưng đây là
một thiết kế **mong manh**. Ví dụ về nguy cơ: 📄 `components/products/attribute-fields.tsx` dùng
`name` làm `id`:

```tsx
function Field({ name, label, required, defaultValue }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? '' : ' (optional)'}</Label>
      <Input id={name} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}
```

Nếu sau này có trang "so sánh 2 sản phẩm" render `<AttributeFields>` hai lần, sẽ có hai
`id="brand"` — HTML không hợp lệ, và click label sẽ focus sai input.

**Cách sửa đúng đắn:** `id` cho DOM lấy từ `useId`, `name` cho form data giữ nguyên. Hai thứ này có
mục đích khác nhau và không nên dùng chung một giá trị:

```tsx
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

Với nhiều ID trong một component, dùng một `useId` làm prefix:

```tsx
const uid = useId()
<Input id={`${uid}-email`} /> <Input id={`${uid}-password`} />
```

⚠️ **Đừng dùng `useId` làm `key` trong list.** `key` phải gắn với **dữ liệu** (`product._id`),
không phải với vị trí render.

### 15. `useSyncExternalStore` — đọc dữ liệu ngoài React một cách an toàn

**Vấn đề nó giải quyết:** trong concurrent rendering, render có thể bị ngắt. Nếu bạn đọc một
external store (Redux, `window.innerWidth`, `matchMedia`) ở hai chỗ trong cùng một lần render, và
store đổi giữa hai lần đọc → bạn hiển thị UI **không nhất quán** (một nửa trạng thái cũ, một nửa mới).
Đây gọi là **tearing**.

`useSyncExternalStore` bảo đảm mọi lần đọc trong một render đều thấy cùng một snapshot:

```tsx
'use client'
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    // subscribe: React gọi để biết khi nào cần đọc lại
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    // getSnapshot: đọc giá trị hiện tại (client)
    () => window.matchMedia(query).matches,
    // getServerSnapshot: giá trị khi SSR — BẮT BUỘC nếu component được SSR
    () => false,
  )
}
```

**Vì sao repo này không cần nó** — và đây là một bài học kiến trúc hay.

📄 `app/(seller)/seller/layout.tsx`:

```tsx
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SellerSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <SellerMobileNav />
        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  )
}
```

Responsive được xử lý **hoàn toàn bằng CSS**: `hidden md:block` cho sidebar, `md:hidden` cho mobile nav.
Cả hai component đều được render, CSS quyết định cái nào hiện.

So sánh với cách dùng JS:

| | CSS (`hidden md:block`) — cách repo chọn | JS (`useMediaQuery`) |
| --- | --- | --- |
| Hoạt động khi SSR | ✅ HTML đúng ngay từ byte đầu | ❌ Server không biết viewport → phải đoán |
| Hydration mismatch | ✅ Không thể xảy ra | ⚠️ Rất dễ: server đoán `false`, client là `true` |
| Nhấp nháy layout khi load | ✅ Không có | ⚠️ Có — render sai rồi sửa sau hydration |
| Đổi kích thước cửa sổ | ✅ Tức thì, không JS | Cần listener + re-render |
| HTML gửi xuống | Cả hai nhánh (nặng hơn một chút) | Chỉ một nhánh |
| Cần JS? | ❌ Không | ✅ Có |

> **Nguyên tắc:** giải quyết responsive bằng CSS trước. Chỉ dùng `useMediaQuery` khi bạn thực sự cần
> **logic JS khác nhau** theo kích thước (ví dụ: chỉ khởi tạo virtualization trên desktop), không
> phải chỉ để ẩn/hiện.

### 16. `useLayoutEffect` — và cảnh báo SSR

Chạy **đồng bộ, sau khi DOM cập nhật nhưng TRƯỚC khi browser paint**. Dùng khi bạn cần **đo** DOM rồi
điều chỉnh **trước khi người dùng thấy**:

```tsx
useLayoutEffect(() => {
  const { height } = tooltipRef.current!.getBoundingClientRect()
  // Không đủ chỗ phía dưới → lật tooltip lên trên, TRƯỚC khi paint
  setPlacement(spaceBelow < height ? 'top' : 'bottom')
}, [isOpen])
```

Nếu dùng `useEffect` ở đây, người dùng sẽ thấy tooltip nhảy một khung hình.

⚠️ **`useLayoutEffect` không chạy được khi SSR** và React sẽ in warning. Vì trên server không có DOM
để đo. Nếu component vừa cần SSR vừa cần đo DOM:

```tsx
// Chạy layout effect ở client, no-op ở server
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
```

**Thứ tự ưu tiên:** `useEffect` là mặc định. Chỉ chuyển sang `useLayoutEffect` khi bạn thấy nhấp nháy
thực tế do đo-rồi-sửa.

### 17. `<Activity>` — giữ state của cây UI đang ẩn (React 19.2)

Nhớ lại vấn đề ở file `02`: unmount component = mất state.

📄 `components/discounts/create-discount-form.tsx`:

```tsx
{appliesTo === 'specific_products' ? (
  <div className="space-y-2">
    <Label htmlFor="discount_product_ids">Product IDs</Label>
    <Input id="discount_product_ids" name="discount_product_ids" placeholder="id1, id2, id3" />
    <p className="text-xs text-muted-foreground">Comma-separated product IDs.</p>
  </div>
) : null}
```

Đổi sang `all` rồi đổi lại `specific_products` → ô product IDs trắng, người dùng phải gõ lại.

`<Activity>` giải quyết đúng việc này: cây con vẫn tồn tại (state được giữ) nhưng bị ẩn và effect bị
tạm dừng:

```tsx
import { Activity } from 'react'

<Activity mode={appliesTo === 'specific_products' ? 'visible' : 'hidden'}>
  <div className="space-y-2">
    <Label htmlFor="discount_product_ids">Product IDs</Label>
    <Input id="discount_product_ids" name="discount_product_ids" placeholder="id1, id2, id3" />
  </div>
</Activity>
```

⚠️ **Cân nhắc trước khi áp vào chỗ này:** giá trị bị ẩn vẫn nằm trong DOM, nên khi submit với
`appliesTo === 'all'`, `FormData` **vẫn chứa** `discount_product_ids`. Server Action hiện tại xử lý
đúng (chỉ đọc field đó khi `appliesTo === 'specific_products'`), nhưng đây là loại chi tiết dễ gây bug.

**`<Activity>` phù hợp nhất cho:** tab đã xem (giữ vị trí scroll và filter), wizard cho phép lùi
bước, hoặc pre-render một route sắp tới. Với một field nhỏ như trên, `null` có thể vẫn là lựa chọn
đơn giản hơn — hãy quyết định dựa trên việc người dùng có hay chuyển qua lại không.

---

## 18. Trade-offs — bảng tổng hợp

| Công cụ | Lợi ích | Cái giá |
| --- | --- | --- |
| `useRef` | Cửa vào DOM; lưu giá trị không gây render | Không reactive → dùng sai thì UI không cập nhật; dễ vi phạm quy tắc pure nếu chạm trong render |
| Context | Xoá prop drilling; tách biệt cấp cha-con | Mọi consumer render khi value đổi; thiếu Provider thì lỗi im lặng; khó theo dõi luồng dữ liệu |
| `useId` | An toàn khi SSR, không trùng ID | Giá trị vô nghĩa với người đọc (`«r1»`); không dùng làm key được |
| `useSyncExternalStore` | Không tearing với store ngoài | Cần `getServerSnapshot`; API rườm rà; thường có cách CSS đơn giản hơn |
| `useLayoutEffect` | Đo-rồi-sửa trước paint | Chặn paint → jank nếu chậm; warning khi SSR |
| `useImperativeHandle` | Encapsulation cho component library | Thêm một tầng gián tiếp; thường không cần |
| `<Activity>` | Giữ state khi ẩn UI | DOM vẫn tồn tại (memory, form data, a11y cần kiểm tra) |

---

## 19. Best Practices

1. **`useRef` chỉ chạm trong effect hoặc event handler.** Không đọc/ghi trong render.
2. **Luôn `?.` khi truy cập `ref.current`** — nó là `null` trước mount và sau unmount.
3. **React 19: bỏ hẳn `forwardRef` cho code mới.** `ref` là prop bình thường.
4. **Context nên throw khi thiếu Provider**, đừng để default giá trị "trông có vẻ hợp lệ".
   Bài học từ `next-themes` trong repo này.
5. **Chia nhỏ Context theo tần suất thay đổi**, và tách state khỏi actions.
6. **Dùng `useId` cho mọi cặp `label`/`input` trong component tái sử dụng.** Đừng dùng `name` làm `id`.
7. **Responsive bằng CSS trước, `useMediaQuery` sau.** `seller/layout.tsx` là mẫu đúng.
8. **Trước khi tạo Context trong App Router, hỏi:** "Server Component đọc trực tiếp được không?"
   hoặc "cái này có thuộc về URL không?" — thường câu trả lời là có.

---

## Tự kiểm tra

1. Vì sao không được đọc `ref.current` trong lúc render?
2. Vì sao `ref.current?.reset()` trong `comment-form.tsx` cần optional chaining?
3. `useTheme()` trong `sonner.tsx` trả về gì khi không có Provider? Vì sao đây là lỗi khó tìm?
4. Kể ba lý do khiến repo này không có `createContext` nào.
5. `useSyncExternalStore` chống lại vấn đề gì? Vì sao CSS thường là giải pháp tốt hơn cho responsive?
6. Khi nào `useLayoutEffect` đáng dùng thay `useEffect`? Nó gây vấn đề gì khi SSR?

➡️ Tiếp theo: `06-suspense-va-streaming.md`
