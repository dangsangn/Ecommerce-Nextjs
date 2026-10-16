# 08. Server Components vs Client Components — ranh giới quan trọng nhất

> **Mục tiêu:** hiểu `'use client'` thực sự làm gì (không phải "component này chạy ở client"), biết cái
> gì được phép đi qua ranh giới, và đọc được bản đồ server/client của repo.

---

## 1. Overview

**Pages Router / SPA:** mọi component là Client Component. Server render HTML lần đầu rồi client tiếp
quản — **mọi** component đều được gửi xuống dưới dạng JS; dữ liệu lấy ở cấp *trang*
(`getServerSideProps`) rồi truyền prop.

**App Router:** mặc định là **Server Component**:

- Chạy **chỉ trên server**, code của nó không vào client bundle
- `async`/`await` trực tiếp; đọc cookie, env secret, gọi DB/API
- **Không có** state, effect, event handler, browser API

Bạn *chọn* đưa một nhánh sang client bằng `'use client'`. Lưu ý: Client Component **vẫn được SSR** ra
HTML ở lần tải đầu, rồi hydrate — "client" nghĩa là "có mặt trong bundle và chạy được ở browser", không
phải "chỉ chạy ở browser".

Ba vấn đề của SPA mà mô hình này giải quyết:

1. **Bundle tăng theo độ phức tạp** — thư viện format ngày, markdown parser đều phải tải xuống.
2. **Client-server waterfall** — HTML → JS → render → `useEffect` fetch → render lại.
3. **Over-fetching xuống client** — fetch object 50 field để hiện 3 field, cả 50 đi qua mạng.

---

## 2. Mental Model

### 🧠 `'use client'` là CÁI CỬA, không phải cái nhãn

> **"Module này và mọi thứ nó import thuộc về client bundle."**

Ranh giới **lan theo import**:

```
app/(store)/layout.tsx              ← Server
 └── StoreHeader                    ← Server (async, đọc cookie); icon ShoppingCart → SVG render trên server
      └── SearchBox 'use client'     ← 🚪 CỬA
           └── <Search /> (lucide)   ← client: được SearchBox import nên vào bundle
```

Một module không có directive **có thể là server ở chỗ này và client ở chỗ khác**, tuỳ ai import.

📄 `lib/products/price.ts` — không `'use client'`, không `'server-only'`:

| Import bởi | Loại |
| --- | --- |
| `components/store/product-card.tsx`, `order-card.tsx`, `components/products/product-list.tsx`, `app/(store)/cart/page.tsx`, `app/(store)/orders/[id]/page.tsx` | server |
| `components/store/cart-line.tsx`, `checkout-wizard.tsx`, `product-purchase.tsx`, `components/products/edit-product-form.tsx`, `sku-editor.tsx` | **client** |

Một file, chạy ở **cả hai** phía — *shared module*. Logic giá tiền có một nguồn sự thật duy nhất. Khả thi
vì nó là JS thuần: không `next/headers`, không secret, không `window`.

### 🧠 Ranh giới là RANH GIỚI MẠNG

```
┌──────────── SERVER ────────────┐        ┌──────── BROWSER ────────┐
│  Server Component              │        │                          │
│  ├─ đọc cookie, gọi API         │        │                          │
│  └─ render ra RSC payload ──────┼──props─┼─▶ Client Component       │
│     (props phải SERIALIZE được) │        │   useState, onClick...   │
└────────────────────────────────┘        └──────────────────────────┘
```

Props đi qua ranh giới phải thành **dữ liệu truyền qua mạng**. Cái gì không chuyển thành dữ liệu được thì không qua được.

---

## 3. Bảng serialization (React 19)

| Kiểu | Qua được? | Ghi chú |
| --- | --- | --- |
| `string`, `number`, `bigint`, `boolean`, `null`, `undefined` | ✅ | |
| Array, plain object | ✅ | Đệ quy — mọi field cũng phải serialize được |
| `Date`, `Map`, `Set`, `TypedArray`, `ArrayBuffer` | ✅ | (`FormData` chỉ được liệt kê cho **tham số Server Function**, không phải prop) |
| `Promise` | ✅ | Client dùng `use()` (file `06`) |
| JSX | ✅ | Nền tảng của composition |
| Server Function (`'use server'`) | ✅ | Đi qua dưới dạng reference ID |
| `Symbol.for('x')` (global symbol) | ✅ | Symbol thường thì ❌ |
| ❌ Function thường, component không thuộc module `'use client'` | **KHÔNG** | `onClick={() => …}`, `icon={LayoutDashboard}` từ Server → lỗi. Ngoại lệ: thứ được export từ file `'use client'` đi qua dưới dạng client reference |
| ❌ Class instance, object null-prototype | **KHÔNG** | |

```tsx
// ❌ Server Component
<ProductPurchase spu={spu} onAdd={(id) => console.log(id)} />
// Error: Functions cannot be passed directly to Client Components...

// ✅ Truyền Server Action (serialize được) hoặc để Client Component tự định nghĩa handler
<ProductPurchase spu={spu} addAction={addToCartAction} />
```

### ⚠️ Cái bẫy thật trong repo: `NAV_ITEMS`

📄 `components/seller/nav-items.ts`:

```tsx
export interface SellerNavItem {
  label: string
  href: string
  icon: LucideIcon        // ← COMPONENT (function)!
}
export const NAV_ITEMS: SellerNavItem[] = [
  { label: 'Dashboard', href: '/seller', icon: LayoutDashboard },
  // ...
]
```

Vì sao chạy được? `NAV_ITEMS` **không đi qua prop** — nó được **import trực tiếp** bởi Client Component
📄 `components/seller/seller-sidebar.tsx` và `seller-mobile-nav.tsx` (đều `'use client'`, render `<item.icon />`).
Import không đi qua mạng: bundler đưa `nav-items.ts` vào client bundle, mảng được tạo ngay trên client.

```tsx
// ❌ Vỡ nếu viết trong app/(seller)/seller/layout.tsx (Server Component):
<SellerSidebar items={NAV_ITEMS} />
// "Functions cannot be passed directly to Client Components"
```

Đối chiếu `QUICK_ACTIONS` trong 📄 `app/(seller)/seller/page.tsx`: cũng chứa icon component, nhưng Server
Component render `<action.icon />` **trên server** thành SVG — không vượt ranh giới nào.

> **Quy tắc:** dữ liệu chứa function/component đi qua **`import`**, không qua **prop**.

---

## 4. Bản đồ server/client của repo

### 4.1 Server Component thuần: `StoreHeader`

📄 `components/store/store-header.tsx` (rút gọn):

```tsx
export async function StoreHeader({ q = '' }: { q?: string }) {
  const payload = await getAccessPayload()                       // cookie — chỉ server
  let cartCount = 0
  if (payload) {
    const cart = await apiFetch<Cart>('/cart', { auth: true })     // API + API_KEY — chỉ server
    cartCount = cart.cart_count_product ?? 0
  }
  return (
    <header>
      <SearchBox defaultValue={q} />                {/* 🚪 cửa sang client */}
      <Link href="/cart"><ShoppingCart />{cartCount > 0 ? <span>{cartCount}</span> : null}</Link>
      <form action={logoutAction}>                   {/* Server Action — không cần 'use client' */}
        <button type="submit" aria-label="Sign out"><LogOut /></button>
      </form>
    </header>
  )
}
```

| Thứ | Vào client bundle? |
| --- | --- |
| `getAccessPayload`, `decodeJwt`, `apiFetch`, `buildHeaders` | ❌ |
| Icon `ShoppingCart`, `Store`, `Package`, `LogOut` | ❌ (thành SVG trên server) |
| `logoutAction` | ❌ — chỉ một reference ID |
| `SearchBox` + icon `Search` + `useRouter` | ✅ (đây là cửa) |

`<form action={logoutAction}>` hoạt động **không cần JS** — Server Action serialize thành ID; form vẫn
submit được trước hydration (progressive enhancement).

### 4.2 Đẩy `'use client'` xuống lá

📄 `components/auth/submit-button.tsx` — Client Component nhỏ, dùng ở **17 file form**:

```tsx
'use client'
export function SubmitButton({ children, disabled, className }: {
  children: React.ReactNode; disabled?: boolean; className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className={cn('w-full', className)} disabled={pending || disabled}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
```

Đây là quy tắc số một của kiến trúc RSC: **đẩy ranh giới xuống càng sâu càng tốt.**

⚠️ Repo chưa làm triệt để. 📄 `components/auth/login-form.tsx` là `'use client'` toàn bộ (vì cần
`useActionState` + toast), nên `Card*`, `Label`, `Input`, `Link` và toàn bộ JSX form đều vào bundle. Với
form nhỏ thì chấp nhận được (Card chỉ là `<div>`). Form lớn hơn thì tách:

```tsx
// login-page-content.tsx — Server Component
export function LoginPageContent({ redirectTo }: { redirectTo: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>Sign in</CardTitle></CardHeader>
      <CardContent>
        <LoginFormFields redirectTo={redirectTo} />   {/* ← chỉ phần này là client */}
        <Link href="/signup">Sign up</Link>
      </CardContent>
    </Card>
  )
}
```

### 4.3 Composition — Server Component *trong* Client Component

Client Component **không thể `import`** Server Component (import sẽ kéo nó thành client). Nhưng nó **nhận
được Server Component qua `children`/prop** — vì JSX đã render serialize được.

```tsx
// ❌ import trong file 'use client' → ServerThing bị biến thành client (và vỡ nếu nó async/đọc cookie)
'use client'
import { ProductReviews } from './product-reviews'

// ✅ nhận qua children
'use client'
export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section>
      <button onClick={() => setOpen(!open)}>{title}</button>
      {open ? children : null}      {/* đã render TRÊN SERVER */}
    </section>
  )
}

// Server Component dùng nó
<Collapsible title="Reviews">
  <ProductReviews productId={id} />   {/* async, gọi API trên server */}
</Collapsible>
```

📄 **Repo:** `components/store/comment-section.tsx` (~167 dòng) là client toàn bộ, dù phần lớn là text
tĩnh. Cấu trúc tối ưu:

```
CommentSection (server)         ← groupComments, render danh sách
 ├── CommentItem (server)       ← text, tên, ngày → chỉ HTML
 │    └── DeleteButton (client) ← chỉ khi là comment của mình
 └── ReplyControl (client)      ← state mở/đóng + CommentForm
```

⚖️ Trade-off thật: yêu cầu "chỉ **một** form reply mở tại một thời điểm" cần state chung ở cấp section →
section phải là client. Cho phép nhiều form mở → tách được. Đây là quyết định sản phẩm, không phải kỹ thuật.

---

## 5. `server-only` — hàng rào ngăn lỗi bảo mật

📄 `lib/api/server-client.ts` và `lib/auth/session.ts` đều bắt đầu bằng `import 'server-only'`.

`server-only` chỉ làm một việc: **build lỗi** nếu module lọt vào client bundle. Ở đây nó quan trọng vì
`apiFetch` đọc `process.env.API_KEY` và cookie httpOnly:

```tsx
// ❌ Ai đó import apiFetch vào một Client Component
'use client'
import { apiFetch } from '@/lib/api/server-client'
// pnpm build → lỗi: 'server-only' cannot be imported from a Client Component module
```

⚠️ Đừng dựa vào `NEXT_PUBLIC_`: biến không có prefix sẽ là `undefined` ở client — code **chạy nhưng sai**
(fail âm thầm). `server-only` biến lỗi im lặng thành lỗi build ồn ào. Chiều ngược lại có `client-only`.

### Đối ngẫu: module **cố ý** pure

📄 `lib/auth/gate.ts` (`shouldGateShop`) và `lib/auth/tokens.ts` (`decodeJwt`) không import `server-only`
hay `next/headers`, vì `proxy.ts` import chúng.

⚠️ Comment trong `gate.ts` ghi "proxy.ts (Edge runtime)" — **đã lỗi thời**: ở Next 16, Proxy **mặc định
chạy Node.js runtime** và không cho cấu hình `runtime`. Lý do giữ pure vẫn đúng, chỉ khác lý lẽ: proxy đọc
cookie qua `req.cookies` (không qua `next/headers`), và module pure dùng được ở proxy, server, client, test.

`decodeJwt` dùng `atob`, `Uint8Array`, `TextDecoder` (Web API — có ở Node, browser, mọi runtime) thay vì
`Buffer.from(b64, 'base64')` (Node-only) → chạy mọi nơi, test bằng Vitest không cần mock.

| Tầng | File | Ai dùng được |
| --- | --- | --- |
| **Server-only** | `lib/api/server-client.ts`, `lib/auth/session.ts` | Server Component, Server Action, Route Handler |
| **Pure, runtime-agnostic** | `lib/auth/gate.ts`, `lib/auth/tokens.ts` | proxy, server, client |
| **Shared (pure)** | `lib/products/price.ts`, `lib/cart/summary.ts`, `lib/comments/group.ts`, `lib/checkout/build-shop-orders.ts`, … | Mọi nơi |
| **Client-only** | `components/*` có `'use client'` | Chỉ client tree |

---

## 6. Cây quyết định

```
Component cần một trong những thứ sau?
├─ useState / useReducer / useOptimistic / useActionState
├─ useEffect / useLayoutEffect
├─ Event handler (onClick, onChange)
├─ Browser API (window, localStorage, matchMedia)
├─ Hook client của Next (useRouter, usePathname, useSearchParams)
├─ Thư viện chỉ chạy ở client (map, chart, editor)
│
├─ CÓ  ──▶ 'use client' — nhưng TRƯỚC ĐÓ: tách được phần cần state thành component nhỏ hơn không?
└─ KHÔNG ──▶ Server Component (mặc định): async, cookies(), env secret, DB/API, server-only module
```

### Khi KHÔNG nên `'use client'`

- **"Cho chắc"** — mỗi cửa kéo cả nhánh import vào bundle.
- **Ở layout/page** — biến toàn bộ cây thành client. Tách phần tương tác ra (như `seller/layout.tsx`
  làm với `SellerSidebar`/`SellerMobileNav`).
- **Chỉ để submit** — `<form action={serverAction}>` không cần client (nút Sign out trong `StoreHeader`).
- **Thứ CSS giải quyết được** — `hidden md:block` không cần JS.

---

## 7. Trade-offs

| Lợi ích | Cái giá |
| --- | --- |
| Bundle nhỏ — fetch, format, secret không xuống client | Phải luôn biết mình đang ở phía nào |
| Truy cập trực tiếp cookie/DB/env | Ranh giới serialization là một lớp lỗi mới |
| Không client-server waterfall | Mỗi tương tác cần dữ liệu mới = một round-trip |
| Secret không rời server (`server-only`) | Refactor một component thành client có thể kéo cả nhánh theo |
| Shared module dùng hai phía | File "pure" hôm nay có thể bị thêm `next/headers` ngày mai |

Repo: 7 component nghiệp vụ là Server Component — đều là component render **danh sách/hiển thị**
(`product-grid`, `product-card`, `product-list`, `order-card`, `order-status-timeline`, `discount-list`,
`store-header`); ~31 component client còn lại là form, wizard, nút — phần tương tác được cô lập.

---

## 8. Best Practices

1. **Mặc định Server Component.** Chỉ `'use client'` khi cần hook/handler/browser API.
2. **Đẩy `'use client'` xuống lá** — `SubmitButton` là mẫu tốt nhất repo.
3. **`import 'server-only'`** cho mọi module chạm secret hoặc `next/headers`.
4. **Giữ `lib/` pure**; cần request API thì tách file (`gate.ts` pure vs `session.ts` server-only).
5. **Function/component đi qua `import`, không qua prop** (`NAV_ITEMS`).
6. **Composition (`children`)** để nhúng Server Component vào Client Component.
7. **Comment ràng buộc runtime** — và cập nhật khi framework đổi (comment "Edge runtime" của `gate.ts`).

---

## Tự kiểm tra

1. `'use client'` thực sự có nghĩa gì? Client Component có được SSR không?
2. Vì sao icon `Search` trong `SearchBox` vào client bundle còn `ShoppingCart` trong `StoreHeader` thì không?
3. Vì sao `NAV_ITEMS` chứa function mà vẫn chạy? Khi nào nó vỡ?
4. `lib/products/price.ts` chạy ở phía nào? Điều gì làm nó khả thi?
5. `import 'server-only'` bảo vệ khỏi điều gì trong `lib/api/server-client.ts`?
6. Ở Next 16, `proxy.ts` chạy runtime nào? Vì sao `gate.ts` vẫn nên pure?
7. Làm sao nhúng một Server Component vào trong một Client Component?

➡️ Tiếp theo: `09-routing-layout-route-groups.md`
