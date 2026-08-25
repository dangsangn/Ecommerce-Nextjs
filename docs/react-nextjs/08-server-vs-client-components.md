# 08. Server Components vs Client Components — ranh giới quan trọng nhất

> **Mục tiêu:** hiểu `'use client'` thực sự làm gì (không phải "đánh dấu component này chạy ở client"),
> biết cái gì được phép đi qua ranh giới, và đọc được bản đồ server/client của repo này.

---

## 1. Overview

### Mô hình cũ vs mô hình mới

**Trong Pages Router (và mọi SPA):** mọi component đều là Client Component. Server chỉ render HTML
lần đầu (SSR) rồi client "tiếp quản" toàn bộ. Nghĩa là:

- **Mọi** component đều phải được gửi xuống browser dưới dạng JavaScript
- Component nào cũng có thể có state, effect, event handler
- Muốn lấy dữ liệu → `getServerSideProps` ở cấp *trang*, rồi truyền xuống bằng prop

**Trong App Router:** mặc định mọi component là **Server Component**. Chúng:

- Chạy **chỉ trên server**, không bao giờ gửi JS xuống client
- Có thể `async`, `await` trực tiếp
- Đọc được cookie, biến môi trường, gọi database trực tiếp
- **Không có** state, effect, event handler, hay browser API

Bạn *chọn* đưa một component sang phía client bằng `'use client'`.

### Vấn đề mà mô hình này giải quyết

Ba vấn đề cụ thể của SPA:

1. **Bundle size tăng theo độ phức tạp app.** Mỗi component, mỗi thư viện format ngày, mỗi markdown
   parser đều phải tải xuống browser — dù người dùng chỉ đọc nội dung tĩnh.

2. **Client-server waterfall.** Trang tải → JS tải → component render → `useEffect` fetch → chờ API →
   render lại. Bốn chặng nối tiếp, mỗi chặng cộng thêm latency.

3. **Dữ liệu bị đẩy xuống client dù không cần.** Bạn fetch một object 50 field để hiển thị 3 field.
   47 field kia vẫn đi qua mạng và nằm trong `__NEXT_DATA__`.

---

## 2. Mental Model

### 🧠 `'use client'` là một CÁI CỬA, không phải một cái nhãn

Đây là điểm bị hiểu sai nhiều nhất. `'use client'` **không** có nghĩa "component này chạy ở client".
Nó có nghĩa:

> **"Từ đây trở xuống thuộc về client bundle."**

Nó đánh dấu **ranh giới**, và ranh giới đó **lan xuống** (transitive):

```
app/(store)/layout.tsx              ← Server Component
 └── StoreHeader                    ← Server Component (async, đọc cookie)
      └── SearchBox 'use client'     ← 🚪 CỬA
           └── Input                 ← client (dù KHÔNG có 'use client')
                └── InputPrimitive   ← client
```

`components/ui/input.tsx` **không có** `'use client'`. Nhưng vì nó được `SearchBox` (đã là client)
import, nó trở thành phần của client bundle.

**Hệ quả quan trọng:** một component không có `'use client'` **có thể là Server Component ở một chỗ
và Client Component ở chỗ khác**, tuỳ vào ai import nó.

📄 Ví dụ thật trong repo: `lib/products/price.ts`

```tsx
// lib/products/price.ts — KHÔNG có 'use client', KHÔNG có 'server-only'
export function toPriceString(value: Decimal): string { ... }
export function toPriceNumber(value: Decimal): number { ... }
```

Nó được import bởi:

| File import nó | Loại |
| --- | --- |
| `components/store/product-card.tsx` | server |
| `components/store/order-card.tsx` | server |
| `components/products/product-list.tsx` | server |
| `app/(store)/cart/page.tsx` | server |
| `app/(store)/orders/[id]/page.tsx` | server |
| `components/store/cart-line.tsx` | **client** |
| `components/store/checkout-wizard.tsx` | **client** |
| `components/products/edit-product-form.tsx` | **client** |

Cùng một file, chạy ở **cả hai** phía. Nó được gọi là **shared module** (hay "universal module"), và
đây là một thiết kế cố ý và rất tốt: logic parse giá tiền là **một nguồn sự thật duy nhất**, dùng ở
mọi nơi. Không có bản sao nào để lệch nhau.

Điều làm nó khả thi: file này chỉ chứa JavaScript thuần — không `next/headers`, không `process.env`,
không `window`.

### 🧠 Ranh giới là RANH GIỚI MẠNG

Cách nghĩ mạnh nhất về `'use client'`: nó không phải ranh giới "loại component", nó là
**ranh giới mạng** — một cuộc gọi RPC.

```
┌──────────── SERVER ────────────┐        ┌──────── BROWSER ────────┐
│                                │        │                          │
│  Server Component chạy         │        │                          │
│  ├─ đọc cookie                 │        │                          │
│  ├─ gọi API/database           │        │                          │
│  └─ render ra RSC payload      │        │                          │
│         │                      │        │                          │
│         │  props phải          │  ═══▶  │  Client Component        │
│         │  SERIALIZE ĐƯỢC ─────┼────────┼─▶ nhận props            │
│         └────────────────────  │        │  ├─ có useState          │
│                                │        │  ├─ có useEffect         │
│                                │        │  └─ có onClick           │
└────────────────────────────────┘        └──────────────────────────┘
```

Từ hình này, **quy tắc serialization** trở nên hiển nhiên: props đi qua ranh giới phải được chuyển
thành **text** để truyền qua mạng. Cái gì không chuyển thành text được thì không đi qua được.

---

## 3. How It Works — bảng serialization

| Kiểu dữ liệu | Qua được ranh giới? | Ghi chú |
| --- | --- | --- |
| `string`, `number`, `boolean`, `null`, `undefined` | ✅ | |
| `Array`, plain `Object` | ✅ | Đệ quy — mọi field bên trong cũng phải serialize được |
| `Date` | ✅ | Được hỗ trợ |
| `Map`, `Set`, `BigInt`, `TypedArray` | ✅ | React 19 mở rộng danh sách này |
| `Promise` | ✅ | Client dùng `use()` để unwrap (xem file `06`) |
| **JSX** (`<div>...`) | ✅ | Đây là nền tảng của composition pattern |
| **Server Function** (`'use server'`) | ✅ | Truyền được như một prop function |
| ❌ Function thường | **KHÔNG** | `onClick={() => ...}` từ Server Component → lỗi |
| ❌ Class instance | **KHÔNG** | Prototype không serialize được |
| ❌ Symbol | **KHÔNG** | |
| ❌ Component reference | **KHÔNG** | Chính là function |

### ⚠️ Một cái bẫy thật trong repo

📄 `components/seller/nav-items.ts`:

```tsx
import { LayoutDashboard, Package, Tag, User, type LucideIcon } from 'lucide-react'

export interface SellerNavItem {
  label: string
  href: string
  icon: LucideIcon        // ← đây là một COMPONENT (function)!
}

export const NAV_ITEMS: SellerNavItem[] = [
  { label: 'Dashboard', href: '/seller',           icon: LayoutDashboard },
  { label: 'Products',  href: '/seller/products',  icon: Package },
  { label: 'Discounts', href: '/seller/discounts', icon: Tag },
  { label: 'Account',   href: '/seller/account',   icon: User },
]
```

`NAV_ITEMS` chứa **function** (component icon). Theo bảng trên, nó **không serialize được**.

**Vậy tại sao code này chạy được?**

Vì `NAV_ITEMS` không bao giờ đi qua ranh giới **dưới dạng prop**. Nó được **import trực tiếp** bởi
các Client Component:

📄 `components/seller/seller-sidebar.tsx`:

```tsx
'use client'
import { NAV_ITEMS, isNavItemActive } from '@/components/seller/nav-items'

export function SellerSidebar() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item.href, pathname)
        return (
          <Link key={item.href} href={item.href} ...>
            <item.icon className="size-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

`import` **không phải** đi qua ranh giới mạng. Bundler đưa `nav-items.ts` (và các icon) vào client
bundle, và `NAV_ITEMS` được tạo *ngay trên client*. Không có serialization nào cả.

**Nhưng code này sẽ vỡ nếu bạn viết:**

```tsx
// ❌ app/(seller)/seller/layout.tsx — Server Component
import { NAV_ITEMS } from '@/components/seller/nav-items'
import { SellerSidebar } from '@/components/seller/seller-sidebar'

export default function SellerLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      {/* Lỗi: Functions cannot be passed directly to Client Components */}
      <SellerSidebar items={NAV_ITEMS} />
```

Cùng một dữ liệu, nhưng lần này đi qua **prop** → phải serialize → thất bại vì `icon` là function.

📄 **So sánh với `QUICK_ACTIONS`** trong `app/(seller)/seller/page.tsx`:

```tsx
const QUICK_ACTIONS = [
  { title: 'Products', description: '...', href: '/seller/products', cta: 'Manage products', icon: Package },
  ...
]

export default async function SellerHomePage() {
  return (
    // ...
    {QUICK_ACTIONS.map((action) => (
      <Card key={action.href}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <action.icon className="size-4 text-muted-foreground" />   {/* ← render TRÊN SERVER */}
```

Cũng chứa component reference, cũng chạy được — nhưng vì lý do **khác**: đây là Server Component
render `<action.icon />` **trên server**, biến nó thành HTML ngay tại đó. Không có ranh giới nào bị
vượt qua.

> **Quy tắc thực dụng:** dữ liệu có chứa function/component thì phải đi qua **`import`**, không đi qua
> **prop**. Nếu bạn thấy lỗi "Functions cannot be passed directly to Client Components", câu trả lời
> hầu như luôn là: chuyển sang import trực tiếp trong Client Component.

---

## 4. Bản đồ server/client của repo này

### 4.1 Server Component thuần

📄 `components/store/store-header.tsx` — ví dụ tốt nhất trong repo:

```tsx
import Link from 'next/link'
import { ShoppingCart, Store, Package } from 'lucide-react'
import { getAccessPayload } from '@/lib/auth/session'
import { apiFetch } from '@/lib/api/server-client'
import { logoutAction } from '@/actions/auth.actions'
import { buttonVariants } from '@/components/ui/button'
import { SearchBox } from '@/components/store/search-box'
import type { Cart } from '@/types/cart'

export async function StoreHeader({ q = '' }: { q?: string }) {
  const payload = await getAccessPayload()          // đọc cookie — chỉ server làm được
  const isShop = Boolean(payload?.roles?.includes('shop'))
  let cartCount = 0
  if (payload) {
    try {
      const cart = await apiFetch<Cart>('/cart', { auth: true })   // gọi API — chỉ server
      cartCount = cart.cart_count_product ?? 0
    } catch {
      cartCount = 0
    }
  }
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold">SHOP</Link>
        <div className="flex-1">
          <SearchBox defaultValue={q} />          {/* ← 🚪 cửa sang client */}
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/cart" aria-label="Cart" className="relative ...">
            <ShoppingCart className="size-5" />
            {cartCount > 0 ? (
              <span className="absolute -right-2 -top-2 ...">{cartCount}</span>
            ) : null}
          </Link>
          {payload ? (
            <>
              {/* ... */}
              <form action={logoutAction}>       {/* ← Server Action, không cần 'use client' */}
                <button type="submit" className="...">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: 'outline' })}>Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
```

Hãy đếm những gì component này **không** gửi xuống client:

| Thứ | Kích thước ước tính | Có trong client bundle? |
| --- | --- | --- |
| Logic đọc/decode JWT (`getAccessPayload`, `decodeJwt`) | ~1KB | ❌ Không |
| `apiFetch` + `buildHeaders` + `unwrap` | ~1.5KB | ❌ Không |
| Logic tính `isShop`, `cartCount` | — | ❌ Không |
| Icon `ShoppingCart`, `Store`, `Package` | ~1.5KB | ❌ Không (render thành SVG trên server) |
| `logoutAction` | — | ❌ Chỉ một reference ID |
| `SearchBox` + `Input` + `useRouter` | ~2KB | ✅ Có (đây là cửa) |

**Client chỉ nhận `SearchBox`.** Toàn bộ phần còn lại là HTML tĩnh.

Và quan trọng hơn kích thước: `<form action={logoutAction}>` hoạt động **không cần `'use client'`**.
Server Action truyền được vào Server Component vì nó serialize thành một ID mà React biết cách gọi lại.

### 4.2 Client Component tối thiểu

📄 `components/auth/submit-button.tsx` — 12 dòng, và đó là toàn bộ điểm của nó:

```tsx
'use client'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
```

Component này được dùng ở **13 form** khác nhau. Nếu thay vì nó, mỗi form được đánh `'use client'` toàn
bộ, thì mọi `Card`, `Label`, `Input`, và cả JSX của form đều phải vào client bundle.

Đây là kỹ thuật **"đẩy `'use client'` xuống lá"** (push the boundary down), và là quy tắc số một của
kiến trúc RSC.

⚠️ Nhưng repo chưa làm triệt để. 📄 `components/auth/login-form.tsx`:

```tsx
'use client'
import { useActionState, useEffect } from 'react'
// ...
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(loginAction, initialActionState)

  useEffect(() => {
    if (state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your seller dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {/* ... */}
```

`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Label` — tất cả bị kéo vào
client bundle chỉ vì component cha cần `useActionState`.

**Đây là trade-off có thể chấp nhận** (Card chỉ là `<div>` với className, rất nhẹ), nhưng nếu form
lớn hơn thì nên tách:

```tsx
// login-page-content.tsx — Server Component
export function LoginPageContent({ redirectTo }: { redirectTo: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your seller dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginFormFields redirectTo={redirectTo} />   {/* ← chỉ phần này là client */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">Sign up</Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

### 4.3 Composition pattern — Server Component *trong* Client Component

Đây là kỹ thuật mạnh nhất và ít được biết nhất của RSC.

**Quy tắc bạn có thể tưởng là đúng:** "Client Component không thể chứa Server Component."

**Sự thật:** Client Component **không thể `import`** một Server Component. Nhưng nó **có thể nhận
Server Component qua `children`** — vì JSX serialize được.

```tsx
// ❌ KHÔNG được: import
'use client'
import { ServerThing } from './server-thing'   // ServerThing sẽ bị biến thành client!

// ✅ ĐƯỢC: nhận qua children
'use client'
export function Collapsible({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open ? children : null}     {/* children đã được render TRÊN SERVER */}
    </div>
  )
}
```

```tsx
// Server Component sử dụng nó
export default async function Page() {
  return (
    <Collapsible>
      <ExpensiveServerThing />   {/* ← chạy trên server, chỉ HTML đi xuống */}
    </Collapsible>
  )
}
```

`Collapsible` giữ state ở client. `ExpensiveServerThing` chạy trên server, gọi database, và kết quả
đi xuống dưới dạng HTML. **Client bundle chỉ chứa `Collapsible`.**

📄 **Repo này đang dùng pattern đó, nhưng chưa tối ưu.** `components/store/comment-section.tsx`:

```tsx
'use client'
export function CommentSection({ productId, comments, currentUserId }) {
  const { topLevel, repliesByParent } = groupComments(comments)
  const [replyOpen, setReplyOpen] = useState<string | null>(null)
  // ... render toàn bộ CommentItem, DeleteButton, ReplyControl ở client
```

Toàn bộ section (164 dòng) là client, dù phần lớn chỉ là hiển thị text tĩnh. Chỉ có
`replyOpen` là thực sự cần state.

Với composition pattern, cấu trúc tối ưu sẽ là:

```
CommentSection (server)              ← group comments, render danh sách
 ├── CommentItem (server)            ← hiển thị text, tên, ngày → chỉ HTML
 │    └── DeleteButton (client)      ← chỉ khi comment.userId === currentUserId
 └── ReplyControl (client)           ← state mở/đóng
      └── CommentForm (client)
```

`groupComments` chạy trên server. Text comment không cần JS. Chỉ nút Delete và Reply là client.

⚖️ **Nhưng đây là trade-off thật, không phải cải tiến thuần.** Yêu cầu "chỉ một form reply mở tại
một thời điểm" cần một state dùng chung ở cấp section. Đưa state xuống từng `ReplyControl` sẽ mất tính
chất đó. Bạn sẽ phải chọn:

- Giữ state chung → section phải là client (như hiện tại)
- Cho phép nhiều form mở → tách được thành server + client lá

Quyết định này thuộc về sản phẩm, không phải kỹ thuật. Đây là lý do việc hiểu trade-off quan trọng hơn
việc biết pattern.

---

## 5. `server-only` — hàng rào ngăn lỗi bảo mật

📄 `lib/api/server-client.ts`:

```tsx
import 'server-only'
import { cookies } from 'next/headers'
import { COOKIE } from '@/lib/auth/tokens'
import { ApiError, buildHeaders, unwrap, type SessionHeaders } from '@/lib/api/http'

function baseUrl(): string {
  const url = process.env.BACKEND_URL
  if (!url) throw new Error('BACKEND_URL is not configured')
  return `${url}/api/v1`
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  let session: SessionHeaders | undefined
  if (opts.auth) {
    const store = await cookies()
    session = {
      clientId: store.get(COOKIE.CLIENT)?.value,
      accessToken: store.get(COOKIE.ACCESS)?.value,
    }
  }
  const json = !opts.multipart && opts.body !== undefined
  const headers = buildHeaders({ apiKey: process.env.API_KEY!, json, session })
  // ...
}
```

📄 `lib/auth/session.ts` cũng vậy:

```tsx
import 'server-only'
import { cookies } from 'next/headers'
import { COOKIE, decodeJwt } from '@/lib/auth/tokens'
```

**`import 'server-only'` làm gì?** Nó là một package chỉ có một tác dụng: **gây lỗi build** nếu file
này lọt vào client bundle.

**Vì sao nó cực kỳ quan trọng ở đây?** Vì `apiFetch` đọc `process.env.API_KEY`. Nếu file này vào
client bundle:

1. `API_KEY` (một secret) sẽ nằm trong JavaScript mà **bất kỳ ai** cũng tải và đọc được
2. Logic đọc cookie httpOnly sẽ không hoạt động (mà lại fail âm thầm)

`server-only` biến một **lỗ bảo mật im lặng** thành một **lỗi build ồn ào**. Đó là loại đánh đổi luôn
đáng làm.

```
$ pnpm build
Error: You're importing a component that needs "server-only".
That only works in a Server Component but one of its parents is marked
with "use client", so it's a Client Component.
```

⚠️ **Lưu ý về `NEXT_PUBLIC_`:** biến môi trường **không** có prefix `NEXT_PUBLIC_` sẽ là `undefined`
ở client — nhưng đây **không phải** cơ chế bảo vệ đủ. Nếu bạn viết
`const key = process.env.API_KEY` trong một Client Component, Next.js sẽ thay nó bằng `undefined`
lúc build, và code sẽ *chạy nhưng sai*. `server-only` chặn tình huống đó trước khi nó xảy ra.

### Đối ngẫu: `lib/auth/gate.ts` — cố ý KHÔNG server-only

📄 `lib/auth/gate.ts`:

```tsx
// Pure, edge-safe: decide whether a /seller request should be gated for
// lacking the `shop` role. Kept free of server-only / next/headers so proxy.ts
// (Edge runtime) can import it.
export function shouldGateShop(
  pathname: string,
  roles: string[] | undefined,
): boolean {
  if (!pathname.startsWith('/seller')) return false
  if (pathname === '/seller/account' || pathname.startsWith('/seller/account/')) {
    return false
  }
  return !(roles ?? []).includes('shop')
}
```

Comment nói rõ **vì sao**: `proxy.ts` chạy ở **Edge runtime** — một môi trường JavaScript hạn chế
(không có Node.js API đầy đủ, không có `next/headers`). Nếu file này `import 'server-only'` hoặc
`import { cookies } from 'next/headers'`, proxy sẽ không import được.

📄 Tương tự với `lib/auth/tokens.ts`:

```tsx
export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload
  } catch {
    return null
  }
}
```

Chú ý: dùng `atob`, `Uint8Array`, `TextDecoder` — **Web API**, có ở cả Edge runtime, Node.js, và
browser. **Không** dùng `Buffer.from(b64, 'base64')` (Node.js-only). Đây là chi tiết cho thấy người
viết đã cân nhắc runtime — và cũng là lý do file này test được bằng Vitest mà không cần mock gì cả.

### Bảng phân tầng của repo

| Tầng | File | Đặc điểm | Ai dùng được |
| --- | --- | --- | --- |
| **Server-only** | `lib/api/server-client.ts`, `lib/auth/session.ts` | `import 'server-only'`, đọc cookie + env secret | Chỉ Server Component / Server Action |
| **Edge-safe (pure)** | `lib/auth/gate.ts`, `lib/auth/tokens.ts` | Không import gì đặc thù runtime | proxy.ts, server, client — mọi nơi |
| **Shared (pure)** | `lib/products/price.ts`, `lib/cart/summary.ts`, `lib/comments/group.ts`, `lib/checkout/build-shop-orders.ts`, `lib/orders/display.ts`, `lib/validations/*` | JavaScript thuần | Mọi nơi |
| **Client-only** | `components/*` có `'use client'` | Hook, event handler | Chỉ client tree |

Đây là một kiến trúc tầng sạch sẽ, và nó **không phải tình cờ** — nó là kết quả của việc mỗi file
được đặt đúng chỗ với ràng buộc runtime rõ ràng.

---

## 6. When to Use — cây quyết định

```
Component này có cần một trong những thứ sau?
├─ useState / useReducer / useOptimistic
├─ useEffect / useLayoutEffect
├─ Event handler (onClick, onChange, onSubmit)
├─ Browser API (window, document, localStorage, matchMedia)
├─ Hook của Next.js phía client (useRouter, usePathname, useSearchParams)
├─ Thư viện chỉ chạy ở client (map, chart, editor)
│
├─ CÓ  ──▶ 'use client'  ── nhưng TRƯỚC ĐÓ hãy hỏi:
│           "tôi có tách được phần cần state ra một component nhỏ hơn không?"
│
└─ KHÔNG ──▶ Server Component (mặc định). Được dùng:
             ├─ async / await
             ├─ cookies(), headers()
             ├─ process.env (kể cả secret)
             ├─ gọi database / API trực tiếp
             └─ import server-only module
```

Bước "TRƯỚC ĐÓ hãy hỏi" là bước tạo ra khác biệt lớn nhất về bundle size.

## 7. When NOT to Use `'use client'`

- **Chỉ để "cho chắc".** Mỗi `'use client'` là một cửa, và mọi thứ bên dưới nó vào bundle.
- **Ở cấp layout hoặc page.** Đây là sai lầm tệ nhất — nó biến **toàn bộ** cây thành client và bạn
  mất hết lợi ích của RSC. Nếu layout cần một chút tương tác, tách component đó ra
  (như `seller/layout.tsx` làm với `SellerSidebar`/`SellerMobileNav`).
- **Chỉ vì component nhận `onClick` từ cha.** Nếu `onClick` là một Server Action, dùng `<form action={...}>`
  thay vì `onClick` — không cần client. Đó chính là cách `store-header.tsx` xử lý nút Sign out.
- **Cho thứ có thể giải quyết bằng CSS.** `hidden md:block` không cần JS (xem file `05`).

---

## 8. Trade-offs

| Lợi ích của Server Components | Cái giá |
| --- | --- |
| Bundle nhỏ hơn nhiều — logic fetch, format, secret không đi xuống client | Mô hình tinh thần phức tạp hơn: phải luôn biết mình đang ở phía nào |
| Truy cập trực tiếp cookie/DB/env → không cần tầng API trung gian | Ranh giới serialization là một lớp lỗi mới (`Functions cannot be passed...`) |
| Không có client-server waterfall | Mỗi tương tác cần dữ liệu mới = một round-trip tới server |
| Secret không bao giờ rời server (có `server-only` bảo vệ) | Cần hiểu `server-only`/`client-only` và cách bundler quyết định |
| Có thể fetch ở cấp component, không chỉ cấp trang | Refactor một component thành client có thể vô tình kéo cả nhánh theo |
| Shared module dùng được ở cả hai phía | Một file "pure" hôm nay có thể bị ai đó thêm `next/headers` vào mai |

**Vì sao đánh đổi này đáng:** với một app e-commerce, phần lớn UI là **đọc dữ liệu và hiển thị** —
danh sách sản phẩm, chi tiết đơn hàng, trang giỏ hàng. Đó chính là loại UI mà Server Components làm
tốt nhất. Phần tương tác thật (form, nút, wizard) chỉ là một phần nhỏ và được cô lập gọn gàng.

Con số cụ thể trong repo: 7 trong 30 component nghiệp vụ là Server Component — nhưng đó chính là
7 component render **danh sách** (`product-grid`, `product-list`, `order-card`, `discount-list`, …).
23 component client còn lại thì đều nhỏ: cái lớn nhất (`checkout-wizard.tsx`) khoảng 40 node DOM,
phần lớn dưới 10 node.

---

## 9. Best Practices

1. **Mặc định là Server Component.** Chỉ thêm `'use client'` khi trình biên dịch bắt buộc bạn.

2. **Đẩy `'use client'` xuống càng sâu càng tốt.** `SubmitButton` (12 dòng, dùng ở 13 form) là mẫu tốt nhất
   trong repo.

3. **`import 'server-only'` cho mọi module chạm vào secret hoặc `next/headers`.** Đây là hàng rào
   biến lỗ bảo mật thành lỗi build.

4. **Giữ `lib/` pure.** Đừng import `next/headers` vào một module dùng chung. Nếu cần, tách thành hai
   file — cách `lib/auth/gate.ts` (pure) tách khỏi `lib/auth/session.ts` (server-only).

5. **Dữ liệu chứa function/component đi qua `import`, không qua prop.** Bài học từ `NAV_ITEMS`.

6. **Dùng composition (`children`) để nhúng Server Component vào Client Component.** Nhưng cân nhắc
   xem yêu cầu nghiệp vụ có cho phép chia state như vậy không.

7. **Server Action truyền được vào Server Component.** Không cần `'use client'` cho một cái nút submit —
   `<form action={logoutAction}>` là đủ.

8. **Viết comment giải thích ràng buộc runtime.** Comment trong `lib/auth/gate.ts` ngăn người sau
   vô tình thêm `next/headers` vào và làm vỡ proxy. Đây là comment có giá trị cao nhất.

---

## Tự kiểm tra

1. `'use client'` thực sự có nghĩa gì? Vì sao gọi nó là "cửa" chứ không phải "nhãn"?
2. Vì sao `components/ui/input.tsx` không có `'use client'` mà vẫn là Client Component?
3. Vì sao `NAV_ITEMS` chứa function mà code vẫn chạy? Khi nào nó sẽ vỡ?
4. `lib/products/price.ts` chạy ở phía nào? Điều gì làm nó khả thi?
5. `import 'server-only'` bảo vệ khỏi điều gì cụ thể trong `lib/api/server-client.ts`?
6. Vì sao `lib/auth/tokens.ts` dùng `atob` mà không dùng `Buffer.from`?
7. Làm sao nhúng một Server Component vào bên trong một Client Component?

➡️ Tiếp theo: `09-routing-layout-route-groups.md`
