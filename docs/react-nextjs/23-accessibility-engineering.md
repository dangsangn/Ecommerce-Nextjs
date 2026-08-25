# 23. Accessibility Engineering

> **Mục tiêu:** coi accessibility là **kỹ thuật**, không phải checklist. Sau chương này bạn sẽ dùng
> được bàn phím và screen reader để tự tìm bug, và biết sửa 8 vấn đề a11y thật đang có trong repo.

---

## 1. Overview

### Vì sao a11y là vấn đề kỹ thuật, không phải vấn đề tuân thủ

Ba lý do thực dụng:

**(1) Người dùng bàn phím là mọi người.** Không chỉ người khiếm thị. Người dùng power-user dùng Tab,
người bị chấn thương tay tạm thời, người dùng laptop không có chuột, người dùng điện thoại có bàn phím
ngoài. Trong e-commerce, **checkout bằng bàn phím** là luồng phổ biến hơn bạn nghĩ.

**(2) A11y bug ≈ bug logic.** "Nút này không focus được" và "nút này không click được bằng chuột" là
cùng một mức nghiêm trọng. Nhưng cái thứ hai được phát hiện trong 5 phút; cái thứ nhất tồn tại nhiều năm.

**(3) Nó trùng với SEO và chất lượng chung.** Heading đúng cấp, `alt` có nghĩa, HTML semantic, landmark
— crawler và screen reader đọc cùng một cây accessibility.

### Repo này đang ở đâu

**Điểm tốt — có ý thức a11y ở nhiều chỗ:**

```tsx
// components/store/cart-line.tsx — nút icon có nhãn
<Button type="submit" variant="outline" size="icon" aria-label={label} disabled={pending}>

// components/seller/seller-sidebar.tsx — nav item báo trang hiện tại
aria-current={active ? 'page' : undefined}

// components/seller/seller-mobile-nav.tsx — trigger báo trạng thái
aria-label="Open menu"
aria-expanded={open}

// backdrop bị ẩn khỏi screen reader
aria-hidden="true"

// components/store/store-header.tsx — icon-only link có nhãn
<Link href="/cart" aria-label="Cart" ...>

// components/store/search-box.tsx
<Input name="q" type="search" aria-label="Search products" ... />
```

Đây là mức trên trung bình. Nhiều codebase không có `aria-label` nào cho nút icon.

**Nhưng có 8 vấn đề thật.** Chương này đi qua từng cái, giải thích **hậu quả cụ thể**, và sửa.

---

## 2. Mental Model

### 🧠 Accessibility Tree — cây thứ hai mà bạn không thấy

Browser dựng **hai** cây từ HTML của bạn:

```
     HTML/DOM Tree                    Accessibility Tree
     ─────────────                    ──────────────────
     <div onClick>                    (không có gì — div không có role)
     <button>Lưu</button>       →      button "Lưu"
     <img src alt="Áo thun">    →      image "Áo thun"
     <img src alt="">           →      (bị loại bỏ — presentational)
     <div role="dialog">        →      dialog
     <span aria-hidden="true">  →      (bị loại bỏ)
```

**Screen reader đọc cây thứ hai, không phải cây thứ nhất.**

Từ đó suy ra quy tắc quan trọng nhất của a11y:

> **`<div onClick>` là vô hình với screen reader và bàn phím.**
> Nó không có role, không focus được, không phản hồi Enter/Space.

### 🧠 Bốn câu hỏi để tự kiểm tra bất kỳ UI nào

Với mỗi thành phần tương tác, hỏi:

1. **Focus được không?** Tab tới được không? Có thấy focus ring?
2. **Nó là gì?** Screen reader đọc ra "button", "link", "dialog"? Hay chỉ đọc nội dung text?
3. **Trạng thái là gì?** Đang mở/đóng? Đang chọn? Đang disabled? Đang loading?
4. **Thay đổi được thông báo không?** Khi UI đổi mà không do người dùng bấm, họ có biết?

Bốn câu này bao phủ ~90% bug a11y thực tế.

---

## 3. Tự kiểm tra: ba công cụ, 15 phút

### Công cụ 1 — Bàn phím (không cần cài gì)

Đóng chuột lại. Mở `/`. Làm luồng mua hàng hoàn chỉnh chỉ bằng bàn phím:

| Phím | Làm gì |
| --- | --- |
| `Tab` / `Shift+Tab` | Di chuyển giữa các element focus được |
| `Enter` | Kích hoạt link và button |
| `Space` | Kích hoạt button, toggle checkbox |
| `Escape` | Đóng modal/dropdown |
| `Arrow` | Di chuyển trong select, radio group, menu |

**Ba thứ cần để ý:**

1. **Focus ring có luôn thấy được?** Nếu bạn "mất dấu" mình đang ở đâu → bug.
2. **Thứ tự Tab có hợp lý?** Trên xuống dưới, trái sang phải. Nếu nhảy loạn → bug.
3. **Có bẫy focus không?** Focus vào một chỗ rồi không Tab ra được → bug nghiêm trọng.

### Công cụ 2 — Screen reader (có sẵn trên mọi hệ điều hành)

| OS | Screen reader | Bật |
| --- | --- | --- |
| macOS | VoiceOver | `Cmd + F5` |
| Windows | Narrator | `Ctrl + Win + Enter` |
| Windows | NVDA (miễn phí, phổ biến hơn) | Cài từ nvaccess.org |
| Linux | Orca | `Super + Alt + S` |

**Bài tập 10 phút:** bật VoiceOver/NVDA, nhắm mắt, thử thêm sản phẩm vào giỏ. Bạn sẽ tìm ra nhiều bug
hơn bất kỳ automated tool nào.

### Công cụ 3 — Automated (bắt ~30% vấn đề)

```bash
# Chrome DevTools → Lighthouse → chọn "Accessibility"
# Hoặc extension axe DevTools
```

⚠️ **Automated tool chỉ bắt được vấn đề có thể phát hiện tự động** — thiếu `alt`, contrast thấp, thiếu
`label`. Chúng **không** bắt được: focus trap sai, thứ tự Tab vô lý, `aria-label` sai nghĩa,
thông báo động không tồn tại. **Đó là lý do phải tự thử bằng bàn phím.**

---

## 4. ⚠️ Vấn đề 1: Mobile drawer không có focus trap

Đây là vấn đề nghiêm trọng nhất trong repo.

📄 `components/seller/seller-mobile-nav.tsx`:

```tsx
{open ? (
  <div className="fixed inset-0 z-50">
    <div
      className="absolute inset-0 bg-black/50"
      onClick={() => setOpen(false)}
      aria-hidden="true"
    />
    <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col gap-6 bg-sidebar px-3 py-6 shadow-lg">
      <div className="flex items-center justify-between px-3">
        {/* ... */}
        <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="...">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {/* nav items */}
      </nav>
      {/* ... */}
    </div>
  </div>
) : null}
```

**Bốn thiếu sót, mỗi cái một hậu quả cụ thể:**

| Thiếu | Hậu quả với người dùng bàn phím / screen reader |
| --- | --- |
| `role="dialog"` + `aria-modal` | Screen reader không biết đây là dialog; nó đọc như nội dung trang thường |
| **Focus trap** | Tab đi ra sau backdrop, vào nội dung trang bị che. Người dùng Tab "vào hư không" |
| **Focus không vào drawer** | Sau khi bấm mở, focus vẫn ở nút Menu. Screen reader không đọc gì mới |
| **Escape không đóng** | Cách duy nhất đóng là Tab tới nút X — nhưng focus không ở trong drawer |

**Kịch bản thật:** người dùng screen reader trên mobile bấm "Open menu". Drawer mở về mặt hình ảnh.
Nhưng screen reader vẫn đang đọc header. Họ Tab → đi vào các link **phía sau** drawer (bị che nhưng
vẫn trong DOM). Họ hoàn toàn **không biết** menu đã mở.

### Sửa: hook `useFocusTrap`

```tsx
// lib/hooks/use-focus-trap.ts
'use client'
import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Giam focus trong một container khi `active`.
 *
 * Làm bốn việc:
 *  1. Nhớ element đang focus trước khi mở
 *  2. Focus vào element đầu tiên trong container (hoặc chính container)
 *  3. Vòng Tab/Shift+Tab trong container
 *  4. Trả focus về chỗ cũ khi đóng
 *
 * Query lại danh sách focusable ở MỖI lần Tab — vì nội dung có thể đổi
 * (form reply mở ra, item bị disable...).
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Focus element đầu tiên, hoặc chính container nếu không có gì focus được
    const first = container.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? container).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null)      // bỏ element đang ẩn
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const activeEl = document.activeElement

      if (e.shiftKey && (activeEl === firstItem || activeEl === container)) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && activeEl === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Trả focus về chỗ cũ — QUAN TRỌNG: người dùng không bị "mất chỗ"
      previouslyFocused.current?.focus()
    }
  }, [active])

  return containerRef
}
```

**Chi tiết `.filter((el) => el.offsetParent !== null)`:** loại bỏ element có `display: none`. Nếu không,
Tab có thể "focus" vào element ẩn và người dùng thấy focus ring biến mất.

### Áp dụng

```tsx
// components/seller/seller-mobile-nav.tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { NAV_ITEMS, isNavItemActive } from '@/components/seller/nav-items'

export function SellerMobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const panelRef = useFocusTrap(open)                   // ⭐

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // ⭐ Escape để đóng
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3">
        <button
          type="button"
          aria-label="Mở menu"
          aria-expanded={open}
          aria-controls="seller-mobile-drawer"          {/* ⭐ nối trigger với panel */}
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/seller" className="text-base font-semibold">
          SHOP <span className="font-normal text-muted-foreground">Seller Centre</span>
        </Link>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}                              {/* ⭐ */}
            id="seller-mobile-drawer"
            role="dialog"                               {/* ⭐ */}
            aria-modal="true"                           {/* ⭐ */}
            aria-label="Menu điều hướng"                {/* ⭐ */}
            tabIndex={-1}                               {/* ⭐ focus được bằng JS, không bằng Tab */}
            className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col gap-6 bg-sidebar px-3 py-6 shadow-lg outline-none"
          >
            <div className="flex items-center justify-between px-3">
              <div>
                <span className="text-lg font-semibold">SHOP</span>
                <p className="text-xs text-muted-foreground">Seller Centre</p>
              </div>
              <button type="button" aria-label="Đóng menu" onClick={close} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1" aria-label="Điều hướng chính">
              {NAV_ITEMS.map((item) => {
                const active = isNavItemActive(item.href, pathname)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-sidebar-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                    )}
                  >
                    <item.icon className="size-4" aria-hidden="true" />   {/* ⭐ icon trang trí */}
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <Link href="/" onClick={close} className="flex items-center gap-1 px-3 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Về trang bán hàng
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
```

**Chú ý `aria-hidden="true"` trên icon.** Icon `<Menu>`, `<X>`, `<ChevronLeft>` là **trang trí** — text
bên cạnh đã nói đủ. Không có `aria-hidden`, screen reader có thể đọc thêm nội dung SVG vô nghĩa.

⚖️ **Hoặc: dùng library.** `@base-ui/react` (repo đã có) cung cấp `Dialog` với focus trap, Escape, và
scroll lock đúng chuẩn:

```tsx
import { Dialog } from '@base-ui/react/dialog'
```

**Đây thường là lựa chọn tốt hơn** (nhớ file `17`: a11y đúng là ~2.000 dòng logic). Nhưng hiểu cơ chế
vẫn cần thiết — để biết library đang làm gì và debug được khi nó không đúng ý.

---

## 5. ⚠️ Vấn đề 2: `pointer-events-none` chặn chuột nhưng không chặn bàn phím

📄 `components/store/product-grid.tsx` và `components/products/product-list.tsx`:

```tsx
<Link
  href={pageHref(q, pagination.page - 1)}
  aria-disabled={!pagination.hasPreviousPage}
  className={cn(
    buttonVariants({ variant: 'outline' }),
    !pagination.hasPreviousPage && 'pointer-events-none opacity-50',
  )}
>
  Previous
</Link>
```

**Vấn đề:** `pointer-events-none` chỉ chặn **chuột**. Link vẫn:
- Nằm trong tab order → người dùng Tab vào được
- Kích hoạt được bằng Enter
- Điều hướng tới `?page=0` → trang lỗi hoặc trang trống

`aria-disabled="true"` **thông báo** trạng thái nhưng **không chặn** hành vi. Đó là điểm mọi người nhầm:

| Thuộc tính | Chặn chuột | Chặn bàn phím | Bỏ khỏi tab order | Thông báo cho SR |
| --- | --- | --- | --- | --- |
| `disabled` (chỉ trên button/input) | ✅ | ✅ | ✅ | ✅ |
| `aria-disabled="true"` | ❌ | ❌ | ❌ | ✅ |
| `pointer-events-none` | ✅ | ❌ | ❌ | ❌ |
| `tabIndex={-1}` | ❌ | ✅ (không Tab tới) | ✅ | ❌ |

**`<a>` không có thuộc tính `disabled`.** Nên với link, bạn cần kết hợp — hoặc đơn giản hơn:
**đừng render link khi nó không dùng được.**

### Hai cách sửa

```tsx
// Cách A — kết hợp đủ ba thuộc tính
<Link
  href={pageHref(q, pagination.page - 1)}
  aria-disabled={!pagination.hasPreviousPage}
  tabIndex={pagination.hasPreviousPage ? undefined : -1}        // ⭐ bỏ khỏi tab order
  onClick={(e) => { if (!pagination.hasPreviousPage) e.preventDefault() }}  // ⭐ chặn Enter
  className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasPreviousPage && 'opacity-50')}
>
  Trước
</Link>
```

```tsx
// Cách B — TỐT HƠN: render <span> khi disabled, <Link> khi dùng được
function PageLink({
  href,
  enabled,
  children,
}: {
  href: string
  enabled: boolean
  children: React.ReactNode
}) {
  const className = cn(buttonVariants({ variant: 'outline', size: 'sm' }), !enabled && 'opacity-50')
  if (!enabled) {
    // <span> không focus được, không click được, không cần thuộc tính nào
    return <span className={className} aria-disabled="true">{children}</span>
  }
  return <Link href={href} className={className}>{children}</Link>
}
```

**Cách B tốt hơn vì nó không dựa vào việc "chặn" — nó không tạo ra thứ cần chặn.** Đây là nguyên tắc
chung: *loại bỏ trạng thái không hợp lệ, đừng bảo vệ nó* — cùng tinh thần với file `18` và `21`.

---

## 6. ⚠️ Vấn đề 3: Tab không có `aria-current`

📄 `components/products/product-list.tsx`:

```tsx
function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      href={`/seller/products?tab=${tab}`}
      className={cn(
        'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}
```

**Trạng thái active chỉ được truyền tải bằng MÀU và SHADOW.** Screen reader đọc "Draft, link" và
"Published, link" — không biết cái nào đang được chọn.

Đây là vi phạm nguyên tắc **"không dùng màu sắc làm phương tiện truyền tải duy nhất"** — cũng ảnh hưởng
người mù màu (~8% nam giới).

📄 **Đối chiếu: `seller-sidebar.tsx` làm ĐÚNG:**

```tsx
<Link
  key={item.href}
  href={item.href}
  aria-current={active ? 'page' : undefined}     // ⭐ có
  className={cn(/* ... */)}
>
```

**Sửa `TabLink` (kết hợp với `pageHref` từ file `17`):**

```tsx
function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      href={pageHref('/seller/products', { tab }, 1)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}
```

Và bọc trong landmark có nhãn:

```tsx
<nav aria-label="Lọc sản phẩm theo trạng thái" className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-[3px]">
  <TabLink tab="draft" current={tab}>Nháp</TabLink>
  <TabLink tab="published" current={tab}>Đã đăng</TabLink>
</nav>
```

**Giá trị của `aria-current`:** `'page'` cho điều hướng, `'true'` cho các trường hợp khác
(step trong wizard, item trong list). Đừng dùng `aria-selected` cho link — đó là cho
`role="tab"`/`role="option"`.

---

## 7. ⚠️ Vấn đề 4: Toast là kênh thông báo duy nhất

📄 12+ chỗ trong repo dùng pattern này:

```tsx
useEffect(() => {
  if (state.message) toast.error(state.message)
}, [state])
```

**Ba vấn đề với screen reader:**

1. **Toast có thể không được thông báo** — phụ thuộc vào việc `sonner` có set `role="status"` /
   `aria-live` đúng không, và screen reader nào đang dùng.
2. **Toast biến mất sau vài giây.** Người dùng screen reader đọc chậm hơn — thông báo có thể mất trước
   khi họ nghe hết.
3. **Toast không nằm cạnh field bị lỗi.** Nghe "Enter a valid email" mà không biết field nào.

📄 **`login-form.tsx` — trường hợp tệ nhất:**

```tsx
const [state, formAction] = useActionState(loginAction, initialActionState)

useEffect(() => {
  if (state.message) toast.error(state.message)
}, [state])
```

Người dùng nhập sai mật khẩu. Toast hiện ở góc phải trên rồi mất. Focus vẫn ở nút Submit. Họ không có
cách nào biết chuyện gì xảy ra.

### Sửa: lỗi inline + `role="alert"` + focus

```tsx
'use client'
import { useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { loginAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(loginAction, initialActionState)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Đưa focus tới thông báo lỗi → screen reader đọc, và người dùng bàn phím
  // ở ngay cạnh chỗ cần sửa.
  useEffect(() => {
    if (state.message) errorRef.current?.focus()
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng nhập</CardTitle>
        <CardDescription>Truy cập trang quản lý của bạn</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirect" value={redirectTo} />

          {/* role="alert" → screen reader đọc NGAY khi nội dung xuất hiện.
              tabIndex={-1} → focus được bằng JS nhưng không nằm trong tab order. */}
          {state.message ? (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive outline-none"
            >
              {state.message}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={state.message ? true : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-invalid={state.message ? true : undefined}
            />
          </div>
          <SubmitButton>Đăng nhập</SubmitButton>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">Đăng ký</Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

**`aria-invalid` có lợi ích kép:** screen reader đọc "invalid", **và** `components/ui/input.tsx` đã có
style cho nó:

```tsx
// input.tsx — có sẵn!
"... aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 ..."
```

Design system **đã chuẩn bị** cho `aria-invalid` — chỉ chưa ai dùng. Thêm một thuộc tính, được cả
a11y và visual state.

### `role="alert"` vs `aria-live` — khác biệt quan trọng

| | `role="alert"` | `aria-live="polite"` | `aria-live="assertive"` |
| --- | --- | --- | --- |
| Ngắt lời screen reader | ✅ Có | ❌ Không (chờ hết câu) | ✅ Có |
| Dùng cho | Lỗi, cảnh báo cần biết ngay | Cập nhật không gấp | Rất ít — quá xâm phạm |
| Ví dụ | "Sai mật khẩu" | "Đã cập nhật giỏ hàng", "Trang 2/5" | Hết thời gian phiên |

⚠️ **Điều kiện bắt buộc:** element có `role="alert"` hoặc `aria-live` phải **tồn tại trong DOM TRƯỚC**
khi nội dung xuất hiện. Nếu bạn mount cả element cùng lúc với nội dung, một số screen reader **không
thông báo**.

**Cách an toàn — luôn render container, chỉ đổi nội dung:**

```tsx
{/* Container LUÔN tồn tại; chỉ nội dung xuất hiện/biến mất */}
<div role="alert" aria-live="assertive" className="min-h-0">
  {state.message ? (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>
  ) : null}
</div>
```

---

## 8. ⚠️ Vấn đề 5: Thay đổi động không được thông báo

📄 `components/store/cart-line.tsx` — bấm "+" đổi số lượng:

```tsx
<span className="w-8 text-center tabular-nums">{quantity}</span>
```

Với người dùng sáng: số đổi từ 2 thành 3 — thấy ngay.
Với screen reader: **không có gì được thông báo.** Họ phải tự điều hướng lại tới con số để đọc.

**Sửa bằng live region:**

```tsx
<span
  className="w-8 text-center tabular-nums"
  aria-live="polite"
  aria-atomic="true"                    // đọc TOÀN BỘ nội dung, không chỉ phần đổi
>
  {quantity}
</span>
```

**Nhưng chỉ đọc "3" thì thiếu ngữ cảnh.** Cách tốt hơn — một live region riêng có câu đầy đủ:

```tsx
export function CartLine({ product }: { product: CartProduct }) {
  const { productId, name, thumb, price, quantity } = product
  // ...
  const lineTotal = toPriceString(toPriceNumber(price) * quantity)

  return (
    <div className="flex items-center gap-4 border-b py-4">
      {/* ... */}
      <div className="flex items-center gap-2">
        {/* nút − và + */}
        <span className="w-8 text-center tabular-nums" aria-hidden="true">{quantity}</span>
      </div>

      {/* Live region: câu đầy đủ cho screen reader, ẩn về mặt hình ảnh */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {name}: số lượng {quantity}, tổng {lineTotal}
      </span>
      {/* ... */}
    </div>
  )
}
```

**`aria-hidden="true"` trên con số hiển thị + live region riêng** — tránh việc screen reader đọc trùng.

**Cần class `sr-only`** (Tailwind có sẵn) — ẩn về mặt hình ảnh nhưng vẫn trong accessibility tree:

```css
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border-width: 0;
}
```

⚠️ **Đừng dùng `display: none` hoặc `visibility: hidden`** — chúng loại element khỏi accessibility tree
luôn, đúng cái ngược lại điều bạn muốn.

**Các chỗ khác trong repo cần live region:**

| Chỗ | Thông báo gì |
| --- | --- |
| Badge giỏ hàng (`store-header.tsx`) | "Giỏ hàng: 3 sản phẩm" |
| Pagination (`product-grid.tsx`) | "Trang 2 trên 5" |
| `OrderStatusTimeline` | "Trạng thái: đang giao" (đặc biệt với realtime, file `20`) |
| Kết quả tìm kiếm | "Tìm thấy 12 sản phẩm cho 'áo thun'" |

---

## 9. ⚠️ Vấn đề 6: Hardcoded `id` (nhắc lại từ file `05`)

📄 `components/products/attribute-fields.tsx`:

```tsx
function Field({ name, label, required, defaultValue }: { name: string; label: string; required?: boolean; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? '' : ' (optional)'}</Label>
      <Input id={name} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}
```

`id` = `name`. Nếu `<AttributeFields>` xuất hiện hai lần trên một trang → hai `id="brand"` →
HTML không hợp lệ → click label focus vào input **sai**.

**Sửa (dùng `useId`, file `05`):**

```tsx
'use client'
import { useId } from 'react'

function Field({ name, label, required, defaultValue }: { name: string; label: string; required?: boolean; defaultValue?: string }) {
  const id = useId()          // ⭐ id cho DOM, name cho form data — hai mục đích khác nhau
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : ' (không bắt buộc)'}
      </Label>
      <Input
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-required={required || undefined}      {/* ⭐ SR đọc "required" */}
      />
    </div>
  )
}
```

**Chú ý `<span aria-hidden="true"> *</span>`:** dấu `*` là quy ước **hình ảnh** cho "bắt buộc".
Screen reader đọc "star" là vô nghĩa. `aria-hidden` che nó, và `aria-required` (cùng `required`) mới là
kênh thông báo đúng.

---

## 10. ⚠️ Vấn đề 7: `alt` không nhất quán

📄 Ba cách dùng `alt` trong repo — hai đúng, một sai:

```tsx
// ✅ ĐÚNG — product-list.tsx: tên sản phẩm ở ngay bên cạnh
<img src={p.product_thumb} alt="" className="h-10 w-10 rounded-md border object-cover" />
<span className="font-medium">{p.product_name}</span>

// ✅ ĐÚNG — product-card.tsx: ảnh là nội dung chính của card
<img src={product.product_thumb} alt={product.product_name} className="aspect-square w-full object-cover" />

// ❌ SAI — edit-product-form.tsx: gallery không có text nào bên cạnh
{product.product_images.map((img) => (
  <img key={img.public_id} src={img.url} alt="" className="h-20 w-20 rounded-md border object-cover" />
))}
```

Ở ca thứ ba, người dùng screen reader **không biết có ảnh nào** — họ không thể xác minh ảnh đã upload
đúng chưa.

**Sửa:**

```tsx
<div className="flex flex-wrap gap-2" role="list" aria-label={`${product.product_images.length} ảnh sản phẩm`}>
  {product.product_images.map((img, i) => (
    <img
      key={img.public_id}
      src={img.url}
      alt={`Ảnh sản phẩm ${i + 1} trên ${product.product_images.length}`}
      role="listitem"
      className="h-20 w-20 rounded-md border object-cover"
    />
  ))}
</div>
```

**Quy tắc quyết định `alt`:**

| Ảnh là gì | `alt` |
| --- | --- |
| **Trang trí** (có text tương đương bên cạnh) | `alt=""` — bắt buộc rỗng, không phải thiếu |
| **Nội dung** (ảnh sản phẩm, avatar) | Mô tả nội dung: `alt="Áo thun trắng cổ tròn"` |
| **Chức năng** (ảnh trong button/link) | Mô tả **hành động**: `alt="Xem chi tiết"` |
| **Trong một tập** (gallery) | Vị trí + ngữ cảnh: `alt="Ảnh 2 trên 5"` |

⚠️ **`alt` thiếu hoàn toàn (không có thuộc tính) khác với `alt=""`.** Thiếu → screen reader đọc
**tên file** (`"IMG_20260815_142033_dot_jpg"`). `alt=""` → bỏ qua hoàn toàn. **Luôn** viết `alt`.

---

## 11. ⚠️ Vấn đề 8: Thiếu skip link và landmark

### Skip link

Người dùng bàn phím phải Tab qua **toàn bộ header** (logo, search, 4 link, nút sign out) trên **mọi
trang** trước khi tới nội dung. Với `store-header.tsx` đó là ~8 lần Tab, mỗi trang.

```tsx
// app/layout.tsx
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Ẩn cho đến khi focus — element ĐẦU TIÊN trong tab order */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
        >
          Bỏ qua, đến nội dung chính
        </a>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
```

**`sr-only focus:not-sr-only`** — vô hình cho người dùng chuột, hiện ra ngay khi Tab tới. Đây là pattern
chuẩn cho skip link.

Và target:

```tsx
// app/(store)/layout.tsx
<main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
  {children}
</main>
```

`tabIndex={-1}` để `<main>` **nhận được focus** khi nhảy tới — nếu không, một số browser chỉ scroll mà
không di chuyển focus, và Tab tiếp theo lại về đầu trang.

### `lang="vi"`

📄 `app/layout.tsx` hiện có `lang="en"`. Nếu nội dung là tiếng Việt, đây là bug thật: screen reader
sẽ đọc tiếng Việt bằng **giọng và quy tắc phát âm tiếng Anh** — gần như không hiểu được.

```tsx
<html lang="vi" className={...}>
```

Đây là **một dòng sửa** với tác động lớn cho người dùng screen reader Việt Nam.

### Landmark

Screen reader cho phép nhảy nhanh giữa các landmark (`<header>`, `<nav>`, `<main>`, `<footer>`).
📄 Repo dùng đúng semantic HTML ở `(store)/layout.tsx`:

```tsx
<StoreHeader />       {/* → <header> */}
<main className="...">{children}</main>
<footer className="border-t">...</footer>
```

Chỉ cần thêm nhãn khi có **nhiều landmark cùng loại**:

```tsx
// store-header.tsx
<nav aria-label="Điều hướng chính" className="flex items-center gap-3 text-sm">

// seller-sidebar.tsx
<nav aria-label="Menu quản lý" className="flex flex-1 flex-col gap-1">
```

Không có nhãn, screen reader chỉ đọc "navigation" cho cả hai — người dùng không biết cái nào là cái nào.

---

## 12. Heading hierarchy

Screen reader cho phép điều hướng bằng heading (`H` trong NVDA). Điều đó chỉ hoạt động nếu cấp heading
hợp lý.

📄 Kiểm tra `app/(store)/orders/[id]/page.tsx`:

```tsx
<h1 className="text-2xl font-semibold">Order #{code}</h1>
{/* ... */}
<Card>
  <CardHeader><CardTitle>Items</CardTitle></CardHeader>
```

`CardTitle` render ra `<div>`, không phải heading:

```tsx
// card.tsx
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("font-heading text-base ...", className)} {...props} />
}
```

**Nghĩa là trang có `<h1>` rồi không có gì.** Bốn card (Items, Summary, Shipping, Payment) không xuất
hiện trong danh sách heading — người dùng screen reader không nhảy tới chúng được.

**Sửa — dùng `render` prop (file `17`) hoặc thêm `asChild`-style:**

Vì `CardTitle` là `React.ComponentProps<"div">` thuần, cách đơn giản nhất là cho nó nhận `as`:

```tsx
// card.tsx
function CardTitle({
  className,
  as: Tag = 'div',
  ...props
}: React.ComponentProps<"div"> & { as?: 'div' | 'h2' | 'h3' | 'h4' }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn("font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm", className)}
      {...props}
    />
  )
}
```

```tsx
// orders/[id]/page.tsx
<Card>
  <CardHeader><CardTitle as="h2">Sản phẩm</CardTitle></CardHeader>
```

**Quy tắc heading:**

| Quy tắc | Vì sao |
| --- | --- |
| Đúng **một** `<h1>` mỗi trang | Nó là tiêu đề của trang |
| Không nhảy cấp (h1 → h3) | Screen reader hiểu là có h2 bị thiếu |
| Cấp phản ánh **cấu trúc**, không phải **kích thước chữ** | Dùng class để đổi kích thước, đừng đổi cấp |

---

## 13. Prefers-reduced-motion

📄 `components/ui/select.tsx` có nhiều animation:

```tsx
className="... duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
```

Với người bị **vestibular disorder** (rối loạn tiền đình), animation zoom/slide có thể gây chóng mặt và
buồn nôn. Họ bật `prefers-reduced-motion` trong OS.

**Sửa toàn cục trong `globals.css`:**

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Vì sao `0.01ms` mà không `none`?** Vì `animationend` event vẫn phải fire — nhiều library (kể cả
`@base-ui/react`) đợi event đó để unmount element. Với `animation: none`, event không bao giờ fire và
component bị treo ở trạng thái mở.

**Đây là chi tiết quan trọng mà bản "tắt animation" đơn giản thường làm sai.**

---

## 14. Trade-offs

| Kỹ thuật | Lợi ích | Cái giá |
| --- | --- | --- |
| **Focus trap tự viết** | Không thêm dependency; hiểu rõ cơ chế | ~50 dòng phải bảo trì; dễ thiếu edge case (iframe, shadow DOM) |
| **Dùng `@base-ui/react` Dialog** | A11y đúng chuẩn, đã test kỹ | Ít kiểm soát chi tiết; bundle lớn hơn chút |
| **`role="alert"` + focus** | Lỗi được thông báo đáng tin cậy | Ngắt lời screen reader — chỉ dùng cho lỗi thật |
| **Live region cho thay đổi động** | Người dùng SR biết chuyện gì xảy ra | Quá nhiều live region → ồn ào, người dùng tắt SR |
| **`sr-only` text bổ sung** | Ngữ cảnh đầy đủ cho SR | Thêm text phải bảo trì; dễ lệch với UI thật |
| **`useId` cho mọi field** | Không trùng ID | `id` khó đọc khi debug (`«r1»`) |
| **Render `<span>` thay `<Link>` khi disabled** | Không cần "chặn" gì | Cấu trúc DOM đổi giữa hai trạng thái |
| **`prefers-reduced-motion`** | Không gây khó chịu cho người nhạy cảm | Cần `0.01ms` chứ không `none` — dễ làm sai |

---

## 15. Best Practices

1. **Tự thử bằng bàn phím 15 phút.** Đóng chuột, làm luồng mua hàng. Bạn sẽ tìm ra nhiều hơn mọi
   automated tool.

2. **Mọi modal/drawer cần: `role="dialog"`, `aria-modal`, focus trap, Escape, trả focus.**
   Năm thứ, không thiếu cái nào. Hoặc dùng library.

3. **`aria-disabled` thông báo, không chặn.** Với link, tốt nhất là **không render link** khi disabled.

4. **Không dùng màu sắc làm kênh truyền tải duy nhất.** Active tab cần `aria-current`, lỗi cần text.

5. **Lỗi form: inline + `role="alert"` + `aria-invalid` + focus.** Toast là bổ sung, không phải thay thế.

6. **Live region cho mọi thay đổi động không do người dùng bấm.** Số lượng giỏ hàng, số trang, trạng
   thái đơn hàng.

7. **Container của `aria-live` phải có sẵn trong DOM trước khi nội dung xuất hiện.**

8. **`useId` cho cặp `label`/`input`.** Đừng dùng `name` làm `id`.

9. **Luôn viết `alt`.** `alt=""` cho trang trí, mô tả cho nội dung, hành động cho chức năng.

10. **Skip link + `lang="vi"` + landmark có nhãn.** Ba việc nhỏ, tác động lớn.

11. **`aria-hidden="true"` cho icon trang trí.** Text bên cạnh đã nói đủ.

12. **Heading phản ánh cấu trúc, không phải kích thước.** `CardTitle` cần render heading thật.

13. **`prefers-reduced-motion` với `0.01ms`, không `none`** — để `animationend` vẫn fire.

---

## 16. Danh sách sửa a11y cho repo, theo ưu tiên

| # | Vấn đề | File | Tác động | Công sức |
| --- | --- | --- | --- | --- |
| 1 | `lang="en"` cho nội dung tiếng Việt | `app/layout.tsx` | 🔴 Rất cao | 1 phút |
| 2 | Drawer không có focus trap / Escape / `role` | `seller-mobile-nav.tsx` | 🔴 Rất cao | 2 giờ |
| 3 | `pointer-events-none` không chặn bàn phím | `product-grid.tsx`, `product-list.tsx` | 🔴 Cao | 1 giờ |
| 4 | Lỗi form chỉ có toast | 12 form | 🔴 Cao | 3 giờ |
| 5 | Thiếu skip link | `app/layout.tsx` | 🟠 Trung bình | 15 phút |
| 6 | Tab thiếu `aria-current` | `product-list.tsx` | 🟠 Trung bình | 10 phút |
| 7 | Số lượng giỏ hàng không có live region | `cart-line.tsx`, `store-header.tsx` | 🟠 Trung bình | 1 giờ |
| 8 | `alt=""` cho gallery không có text | `edit-product-form.tsx` | 🟠 Trung bình | 10 phút |
| 9 | Hardcoded `id` | `attribute-fields.tsx` + form | 🟡 Thấp (chưa xung đột) | 2 giờ |
| 10 | `CardTitle` không phải heading | `card.tsx` + call site | 🟡 Thấp | 1 giờ |
| 11 | Thiếu `prefers-reduced-motion` | `globals.css` | 🟡 Thấp | 15 phút |
| 12 | `nav` chưa có `aria-label` | `store-header.tsx`, `seller-sidebar.tsx` | 🟡 Thấp | 10 phút |

**Bắt đầu từ #1 và #5** — tổng 16 phút, tác động rõ rệt. Rồi #2 (nghiêm trọng nhất về mặt kỹ thuật).

---

## Tự kiểm tra

1. Vì sao `<div onClick>` là vô hình với screen reader? Cây nào bị ảnh hưởng?
2. Bốn câu hỏi tự kiểm tra a11y cho một component tương tác?
3. Năm thứ mà một modal/drawer bắt buộc phải có?
4. So sánh `disabled`, `aria-disabled`, `pointer-events-none`, `tabIndex={-1}` — cái nào chặn gì?
5. Vì sao render `<span>` tốt hơn "chặn" một `<Link>` disabled?
6. `role="alert"` khác `aria-live="polite"` thế nào? Khi nào dùng cái nào?
7. Vì sao container `aria-live` phải tồn tại trước khi nội dung xuất hiện?
8. Vì sao `sr-only` chứ không `display: none` cho text bổ sung?
9. Ba loại `alt` và cách chọn. `alt=""` khác thiếu `alt` thế nào?
10. Vì sao `prefers-reduced-motion` dùng `0.01ms` mà không `animation: none`?
11. `aria-invalid` cho bạn hai lợi ích gì trong repo này?

➡️ Tiếp theo: `24-security-nang-cao.md`
