# 23. Accessibility Engineering

> **Mục tiêu:** coi accessibility là **kỹ thuật**, không phải checklist. Sau chương này bạn sẽ dùng
> được bàn phím và screen reader để tự tìm bug, và biết sửa 8 vấn đề a11y thật đang có trong repo.

---

## 1. Overview

**Vì sao a11y là vấn đề kỹ thuật:**

- **Người dùng bàn phím là mọi người** — power-user, người chấn thương tay, laptop không chuột. Checkout
  bằng bàn phím phổ biến hơn bạn nghĩ.
- **A11y bug ≈ bug logic.** "Nút không focus được" nghiêm trọng ngang "nút không click được" — nhưng cái
  sau được phát hiện trong 5 phút, cái trước tồn tại nhiều năm.
- **Trùng với SEO:** heading đúng cấp, `alt`, HTML semantic — crawler và screen reader đọc cùng một cây.

📄 **Repo đã có ý thức a11y ở nhiều chỗ:**

```tsx
// cart-line.tsx — nút icon có nhãn
<Button type="submit" variant="ghost" size="icon" aria-label={label} disabled={pending}>
// seller-sidebar.tsx — nav item báo trang hiện tại
aria-current={active ? 'page' : undefined}
// seller-mobile-nav.tsx — trigger báo trạng thái
aria-label="Open menu" aria-expanded={open}
// search-box.tsx
<input name="q" type="search" aria-label="Search products" ... />
```

Và Next.js lo sẵn một phần: App Router có **route announcer** — khi điều hướng client-side, nó đọc
`document.title` (hoặc `<h1>` đầu tiên, rồi pathname) qua một live region. Vì vậy **mỗi page nên có
`metadata.title` riêng**. `eslint-config-next` cũng bật sẵn plugin `jsx-a11y` — `pnpm lint` bắt được
`<img>` thiếu `alt`, `aria-*` sai tên...

**Nhưng còn 8 vấn đề thật.** Chương này đi qua từng cái.

---

## 2. Mental Model

### 🧠 Accessibility Tree — cây thứ hai mà bạn không thấy

```
     HTML/DOM Tree                    Accessibility Tree
     <div onClick>                    (không có gì — div không có role)
     <button>Lưu</button>       →      button "Lưu"
     <img src alt="Áo thun">    →      image "Áo thun"
     <img src alt="">           →      (bị loại bỏ — presentational)
     <span aria-hidden="true">  →      (bị loại bỏ)
```

**Screen reader đọc cây thứ hai.** Từ đó:

> **`<div onClick>` là vô hình với screen reader và bàn phím** — không role, không focus được, không
> phản hồi Enter/Space.

```tsx
// ❌
<div onClick={addToCart} className="btn">Thêm vào giỏ</div>
// ✅ — role, focus, Enter/Space miễn phí
<button type="button" onClick={addToCart} className="btn">Thêm vào giỏ</button>
```

### 🧠 Bốn câu hỏi cho mọi thành phần tương tác

1. **Focus được không?** Tab tới được? Thấy focus ring?
2. **Nó là gì?** Screen reader đọc "button", "link", "dialog"?
3. **Trạng thái là gì?** Mở/đóng? Đang chọn? Disabled? Loading?
4. **Thay đổi được thông báo không?** UI đổi mà không do người dùng bấm, họ có biết?

---

## 3. Tự kiểm tra: ba công cụ, 15 phút

**(1) Bàn phím.** Bỏ chuột, làm luồng mua hàng: `Tab`/`Shift+Tab` di chuyển, `Enter` kích hoạt link/button,
`Space` button/checkbox, `Escape` đóng modal, mũi tên trong select/menu. Để ý: focus ring có luôn thấy?
Thứ tự Tab có hợp lý? Có bị kẹt focus không?

**(2) Screen reader.** macOS VoiceOver (`Cmd + F5`), Windows NVDA (miễn phí) hoặc Narrator
(`Ctrl + Win + Enter`). Nhắm mắt, thử thêm sản phẩm vào giỏ.

**(3) Automated** — Lighthouse tab Accessibility, axe DevTools, `pnpm lint` (jsx-a11y). Chỉ bắt ~30%:
thiếu `alt`, contrast, thiếu label. **Không** bắt được focus trap sai, thứ tự Tab vô lý, `aria-label` sai
nghĩa, thông báo động không tồn tại.

### Focus ring: đừng xoá mà không thay

Người dùng bàn phím chỉ biết mình đang ở đâu nhờ focus ring. `outline-none` một mình là xoá nó:

```tsx
// ❌ Tab tới ô search — không thấy gì
<input className="... outline-none" />

// ✅ components/store/search-box.tsx — bỏ outline mặc định NHƯNG thay bằng ring riêng
<input className="... outline-none focus-visible:ring-2 focus-visible:ring-white/60" />
```

`focus-visible:` (không phải `focus:`) chỉ hiện ring khi focus bằng bàn phím, không hiện khi click chuột.
Các component trong `components/ui/` (shadcn) đã làm đúng sẵn — cẩn thận khi tự viết `className` đè lên.

---

## 4. ⚠️ Vấn đề 1: Mobile drawer không phải dialog thật

Vấn đề nghiêm trọng nhất trong repo. 📄 `components/seller/seller-mobile-nav.tsx`:

```tsx
{open ? (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
    <div className="absolute inset-y-0 left-0 flex w-64 ...">
      <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>...</button>
      <nav>{/* nav items */}</nav>
    </div>
  </div>
) : null}
```

| Thiếu | Hậu quả |
| --- | --- |
| `role="dialog"` + `aria-modal` | Screen reader đọc như nội dung trang thường |
| **Focus không vào drawer** | Bấm mở xong, focus vẫn ở nút Menu; SR không đọc gì mới |
| **Focus trap / inert** | Tab đi vào các link **phía sau** backdrop (bị che nhưng vẫn trong DOM) |
| **Escape không đóng** | Phải Tab tới nút X — mà focus lại không ở trong drawer |
| **Trả focus khi đóng** | Đóng xong, focus về `<body>` — người dùng "mất chỗ" |

### ✅ Cách 1 (khuyên dùng): Base UI `Dialog` — repo đã có `@base-ui/react`

```tsx
// components/seller/seller-mobile-nav.tsx
'use client'
import { Dialog } from '@base-ui/react/dialog'

export function SellerMobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger aria-label="Mở menu" className="md:hidden">
        <Menu className="size-5" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50" />
        <Dialog.Popup className="fixed inset-y-0 left-0 w-64 bg-sidebar px-3 py-6">
          <Dialog.Title className="sr-only">Menu điều hướng</Dialog.Title>
          <Dialog.Close aria-label="Đóng menu"><X className="size-5" aria-hidden="true" /></Dialog.Close>
          <nav aria-label="Menu quản lý">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                aria-current={isNavItemActive(item.href, pathname) ? 'page' : undefined}>
                <item.icon className="size-4" aria-hidden="true" /> {item.label}
              </Link>
            ))}
          </nav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

Role, `aria-modal`, focus vào/trả focus, focus trap, Escape, scroll lock — **đều có sẵn và đã test** (file
`17`: a11y đúng là hàng nghìn dòng logic). `aria-hidden="true"` trên icon vì text/nhãn bên cạnh đã đủ —
không có nó, SR có thể đọc nội dung SVG vô nghĩa.

### Cách 2: `<dialog>` native

```tsx
const ref = useRef<HTMLDialogElement>(null)

<button type="button" aria-label="Mở menu" onClick={() => ref.current?.showModal()}>...</button>
<dialog ref={ref} aria-label="Menu điều hướng" className="backdrop:bg-black/50">
  {/* showModal(): focus vào dialog, Escape đóng, phần còn lại của trang bị inert */}
  <button type="button" onClick={() => ref.current?.close()}>Đóng</button>
</dialog>
```

### Hiểu cơ chế: tự viết thì cần gì

Nếu bắt buộc tự làm, đây là tối thiểu. React 19 hỗ trợ thuộc tính **`inert`** — làm cả một vùng không
focus được, không click được, ẩn khỏi accessibility tree — thay cho việc tự bắt phím Tab:

```tsx
<div inert={open}>{/* header + main phía sau drawer */}</div>

{open && (
  <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Menu điều hướng" tabIndex={-1}>
    ...
  </div>
)}
```

```tsx
useEffect(() => {
  if (!open) return
  const prev = document.activeElement as HTMLElement | null
  panelRef.current?.focus()                                   // (1) focus vào drawer
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }  // (2) Escape
  document.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('keydown', onKey)
    prev?.focus()                                             // (3) trả focus khi đóng
  }
}, [open])
```

⚠️ `inert` chỉ hiệu quả khi drawer **không nằm bên trong** vùng bị inert — render nó ở cấp ngang hàng
(hoặc qua portal).

---

## 5. ⚠️ Vấn đề 2: `pointer-events-none` chặn chuột nhưng không chặn bàn phím

📄 `components/store/product-grid.tsx` và `components/products/product-list.tsx`:

```tsx
<Link
  href={pageHref(q, pagination.page - 1)}
  aria-disabled={!pagination.hasPreviousPage}
  className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasPreviousPage && 'pointer-events-none opacity-50')}
>
  Previous
</Link>
```

Link vẫn nằm trong tab order, Enter vẫn kích hoạt → điều hướng tới `?page=0`.

| Thuộc tính | Chặn chuột | Chặn bàn phím | Bỏ khỏi tab order | Thông báo cho SR |
| --- | --- | --- | --- | --- |
| `disabled` (chỉ button/input) | ✅ | ✅ | ✅ | ✅ |
| `aria-disabled="true"` | ❌ | ❌ | ❌ | ✅ |
| `pointer-events-none` | ✅ | ❌ | ❌ | ❌ |
| `tabIndex={-1}` | ❌ | ✅ (không Tab tới) | ✅ | ❌ |

**`<a>` không có thuộc tính `disabled`.** Cách tốt nhất: **đừng render link khi nó không dùng được.**

```tsx
// ✅ Không tạo ra thứ cần "chặn"
function PageLink({ href, enabled, children }: { href: string; enabled: boolean; children: React.ReactNode }) {
  const className = cn(buttonVariants({ variant: 'outline', size: 'sm' }), !enabled && 'opacity-50')
  if (!enabled) return <span className={className} aria-disabled="true">{children}</span>
  return <Link href={href} className={className}>{children}</Link>
}
```

Cùng nguyên tắc với file `18` và `21`: *loại bỏ trạng thái không hợp lệ, đừng bảo vệ nó.*

---

## 6. ⚠️ Vấn đề 3: Tab active chỉ thể hiện bằng màu

📄 `components/products/product-list.tsx`:

```tsx
function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      href={`/seller/products?tab=${tab}`}
      className={cn('...', active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
    >
```

Screen reader đọc "Draft, link" và "Published, link" — không biết cái nào đang chọn. Vi phạm nguyên tắc
**"màu sắc không được là kênh truyền tải duy nhất"** (cũng ảnh hưởng ~8% nam giới mù màu).
`seller-sidebar.tsx` làm đúng với `aria-current`. Sửa tương tự:

```tsx
<nav aria-label="Lọc sản phẩm theo trạng thái">
  <Link href="/seller/products?tab=draft" aria-current={tab === 'draft' ? 'page' : undefined}>Nháp</Link>
  <Link href="/seller/products?tab=published" aria-current={tab === 'published' ? 'page' : undefined}>Đã đăng</Link>
</nav>
```

`aria-current`: `'page'` cho điều hướng, `'step'` cho bước wizard, `'true'` cho trường hợp khác. Đừng dùng
`aria-selected` cho link — đó là cho `role="tab"`/`role="option"`.

---

## 7. ⚠️ Vấn đề 4: Toast là kênh thông báo lỗi duy nhất

📄 ~20 component dùng pattern này, ví dụ `components/auth/login-form.tsx`:

```tsx
const [state, formAction] = useActionState(loginAction, initialActionState)
useEffect(() => {
  if (state.message) toast.error(state.message)
}, [state])
```

Nhập sai mật khẩu → toast hiện ở góc phải trên rồi mất sau vài giây (SR đọc chậm hơn), không nằm cạnh
field lỗi, focus vẫn ở nút Submit. Người dùng SR không biết chuyện gì xảy ra.

### Sửa: lỗi inline trong live region + `aria-invalid`

```tsx
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(loginAction, initialActionState)
  const hasError = !state.ok && !!state.message

  return (
    <form action={formAction} className="space-y-4">
      {/* Container LUÔN có trong DOM; chỉ nội dung thay đổi → SR đọc đáng tin cậy */}
      <div role="alert">
        {hasError ? <p id="login-error" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p> : null}
      </div>

      <Label htmlFor="email">Email</Label>
      <Input id="email" name="email" type="email" required autoComplete="email"
        aria-invalid={hasError || undefined} aria-describedby={hasError ? 'login-error' : undefined} />
      {/* ... password tương tự */}
      <SubmitButton>Đăng nhập</SubmitButton>
    </form>
  )
}
```

**`aria-invalid` có lợi ích kép:** SR đọc "invalid", **và** `components/ui/input.tsx` đã có style sẵn:
`aria-invalid:border-destructive aria-invalid:ring-3 ...`. Design system đã chuẩn bị — chỉ chưa ai dùng.
`aria-describedby` nối input với câu lỗi, nên khi focus lại vào ô email SR đọc luôn lý do.

Với lỗi **theo từng field** (form tạo sản phẩm nhiều ô), thêm một bước: đưa focus tới ô sai đầu tiên —
người dùng bàn phím không phải đi tìm. (`ActionState` trong `actions/state.ts` hiện chỉ có `ok` +
`message`; ví dụ giả định bạn mở rộng thêm `fieldErrors`.)

```tsx
// ActionState mở rộng: { ok: boolean; message?: string; fieldErrors?: Record<string, string> }
useEffect(() => {
  if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}, [state])
```

### `role="alert"` vs `aria-live`

| | `role="alert"` | `aria-live="polite"` |
| --- | --- | --- |
| Ngắt lời screen reader | ✅ Có (≈ `assertive`) | ❌ Chờ hết câu |
| Dùng cho | Lỗi cần biết ngay ("Sai mật khẩu") | Cập nhật không gấp ("Đã cập nhật giỏ hàng", "Trang 2/5") |

⚠️ **Container live region phải có trong DOM TRƯỚC khi nội dung xuất hiện.** Mount cả element cùng lúc
với nội dung (`{error && <p role="alert">…</p>}`) → một số SR **không đọc**.

```tsx
// ❌ Mount cùng lúc với nội dung
{state.message && <p role="alert">{state.message}</p>}
// ✅ Container cố định, nội dung đổi
<div role="alert">{state.message && <p>{state.message}</p>}</div>
```

---

## 8. ⚠️ Vấn đề 5: Thay đổi động không được thông báo

📄 `components/store/cart-line.tsx` — bấm "+":

```tsx
<span className="w-8 text-center font-medium tabular-nums">{quantity}</span>
```

Người sáng mắt thấy 2 → 3. Screen reader: **không có gì.** Chỉ đọc "3" cũng thiếu ngữ cảnh — dùng live
region riêng với câu đầy đủ:

```tsx
<span className="w-8 text-center font-medium tabular-nums" aria-hidden="true">{quantity}</span>

{/* Câu đầy đủ cho SR, ẩn về mặt hình ảnh; aria-atomic → đọc cả câu, không chỉ phần đổi */}
<span className="sr-only" aria-live="polite" aria-atomic="true">
  {name}: số lượng {quantity}, tổng {lineTotal}
</span>
```

`aria-hidden` trên con số hiển thị để SR không đọc trùng. `sr-only` (class có sẵn của Tailwind) ẩn về mặt
hình ảnh nhưng **vẫn trong accessibility tree**. ⚠️ `display: none` / `visibility: hidden` loại element
khỏi cây luôn — ngược với điều bạn muốn.

**Chỗ khác cần live region:** badge giỏ hàng (`store-header.tsx`), số trang (`product-grid.tsx`),
`OrderStatusTimeline` (đặc biệt với realtime, file `20`), số kết quả tìm kiếm.

---

## 9. ⚠️ Vấn đề 6: `id` hardcode từ `name`

📄 `components/products/attribute-fields.tsx`:

```tsx
<Label htmlFor={name}>{label}{required ? '' : ' (optional)'}</Label>
<Input id={name} name={name} required={required} defaultValue={defaultValue} />
```

`<AttributeFields>` xuất hiện hai lần trên một trang → hai `id="brand"` → click label focus nhầm input.

```tsx
function Field({ name, label, required, defaultValue }: FieldProps) {
  const id = useId()      // ⭐ id cho DOM, name cho form data — hai mục đích khác nhau
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : ' (không bắt buộc)'}
      </Label>
      <Input id={id} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}
```

- Dấu `*` là quy ước **hình ảnh** — SR đọc "star" vô nghĩa → `aria-hidden`. Thuộc tính `required` đã
  khiến SR đọc "required", không cần thêm `aria-required`.
- `useId` ở React 19.2 sinh id dạng `_r_1_` (trước đó là `:r1:` rồi `«r1»`) — hợp lệ làm CSS selector và
  `view-transition-name`. Đừng parse hay phụ thuộc vào format này.

---

## 10. ⚠️ Vấn đề 7: `alt` không nhất quán

```tsx
// ✅ product-list.tsx: tên sản phẩm ở ngay bên cạnh → ảnh là trang trí
<img src={p.product_thumb} alt="" className="h-10 w-10 ..." />
<span className="font-medium">{p.product_name}</span>

// ✅ product-card.tsx: ảnh là nội dung chính
alt={product.product_name}

// ❌ edit-product-form.tsx: gallery không có text nào bên cạnh
{product.product_images.map((img) => (
  <img key={img.public_id} src={img.url} alt="" className="h-20 w-20 ..." />
))}
```

Ca thứ ba: người dùng SR **không biết có ảnh nào** — không xác minh được ảnh đã upload đúng chưa.

```tsx
// ✅
<ul className="flex flex-wrap gap-2" aria-label={`${product.product_images.length} ảnh sản phẩm`}>
  {product.product_images.map((img, i) => (
    <li key={img.public_id}>
      <img src={img.url} alt={`Ảnh ${i + 1} trên ${product.product_images.length}`} className="h-20 w-20 ..." />
    </li>
  ))}
</ul>
```

| Ảnh là gì | `alt` |
| --- | --- |
| **Trang trí** (có text tương đương bên cạnh) | `alt=""` — rỗng, không phải thiếu |
| **Nội dung** (ảnh sản phẩm, avatar) | Mô tả: `alt="Áo thun trắng cổ tròn"` |
| **Chức năng** (ảnh trong button/link) | Mô tả **hành động**: `alt="Xem chi tiết"` |
| **Trong một tập** (gallery) | Vị trí + ngữ cảnh: `alt="Ảnh 2 trên 5"` |

📄 `components/store/product-purchase.tsx` làm đúng kiểu **chức năng**: thumbnail là `<button
aria-label="Show this image">` chứa `<img alt="">` — nhãn nằm ở button, ảnh không đọc trùng. Chỉ thiếu
phân biệt: năm nút cùng đọc "Show this image". Sửa: `aria-label={`Xem ảnh ${i + 1} trên ${images.length}`}`.

⚠️ **Thiếu hẳn `alt` khác `alt=""`.** Thiếu → SR đọc **tên file** (`"IMG_20260815_142033 dot jpg"`).
`next/image` bắt buộc prop `alt` ở mức type, nên chuyển sang nó cũng chặn luôn lỗi này.

---

## 11. ⚠️ Vấn đề 8: `lang`, skip link, landmark

### `lang`

📄 `app/layout.tsx` có `<html lang="en">`. UI hiện tiếng Anh nên đúng — **nhưng khi bản địa hoá sang
tiếng Việt phải đổi thành `lang="vi"`**, nếu không SR đọc tiếng Việt bằng quy tắc phát âm tiếng Anh, gần
như không hiểu được. Một dòng, tác động lớn.

### Skip link

Người dùng bàn phím phải Tab qua toàn bộ header trên **mọi trang** trước khi tới nội dung.

```tsx
// app/layout.tsx — element ĐẦU TIÊN trong <body>
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
>
  Bỏ qua, đến nội dung chính
</a>
```

```tsx
// app/(store)/layout.tsx
<main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
```

`sr-only focus:not-sr-only` — vô hình với chuột, hiện ra khi Tab tới. `tabIndex={-1}` để `<main>` **nhận
focus** khi nhảy tới; không có nó, một số browser chỉ scroll mà Tab tiếp theo lại về đầu trang.

### Landmark

📄 `(store)/layout.tsx` đã dùng đúng `<header>` (trong `StoreHeader`), `<main>`, `<footer>`. Chỉ cần
**nhãn khi có nhiều landmark cùng loại** — không có nhãn, SR đọc "navigation" cho tất cả:

```tsx
// store-header.tsx
<nav aria-label="Điều hướng chính" className="ml-auto flex items-center gap-2">
// seller-sidebar.tsx
<nav aria-label="Menu quản lý" className="flex flex-1 flex-col gap-1">
```

---

## 12. Heading hierarchy

SR điều hướng bằng heading (`H` trong NVDA). 📄 `app/(store)/orders/[id]/page.tsx` có `<h1>`, rồi các
`<CardTitle>` — mà `CardTitle` render `<div>`:

```tsx
// components/ui/card.tsx
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("font-heading ...", className)} {...props} />
}
```

→ Trang có `<h1>` rồi không có gì; các card Items/Summary/Shipping không xuất hiện trong danh sách
heading. Sửa: cho `CardTitle` nhận `as`:

```tsx
function CardTitle({ className, as: Tag = 'div', ...props }:
  React.ComponentProps<"div"> & { as?: 'div' | 'h2' | 'h3' }) {
  return <Tag data-slot="card-title" className={cn("font-heading ...", className)} {...props} />
}

// orders/[id]/page.tsx
<CardHeader><CardTitle as="h2">Sản phẩm</CardTitle></CardHeader>
```

**Quy tắc:** một `<h1>` mỗi trang; không nhảy cấp (h1 → h3); cấp phản ánh **cấu trúc**, kích thước chữ do
class quyết định.

---

## 13. `prefers-reduced-motion`

📄 `components/ui/select.tsx` có `data-open:zoom-in-95 data-closed:zoom-out-95 ...`. Với người rối loạn
tiền đình, zoom/slide gây chóng mặt. Họ bật "Reduce motion" trong OS.

```css
/* app/globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Vì sao `0.01ms` mà không `animation: none`?** `animationend` vẫn phải fire — nhiều library (kể cả
`@base-ui/react`) đợi event đó để unmount; với `none`, event không bao giờ fire và component treo ở trạng
thái mở. Cho từng chỗ riêng, Tailwind có variant `motion-reduce:` / `motion-safe:`:

```tsx
<div className="motion-safe:animate-pulse h-64 rounded-lg bg-muted" />   // skeleton chỉ nhấp nháy khi được phép
```

---

## 14. Best Practices

1. **Tự thử bằng bàn phím 15 phút** — tìm ra nhiều hơn mọi automated tool. Không bao giờ `outline-none` mà không có `focus-visible:ring`.
2. **Modal/drawer: dùng Base UI `Dialog` hoặc `<dialog>` native.** Tự viết thì cần đủ: role + `aria-modal`,
   focus vào, trap/`inert`, Escape, trả focus.
3. **`aria-disabled` thông báo, không chặn.** Với link: không render link khi disabled.
4. **Màu không là kênh duy nhất** — active cần `aria-current`, lỗi cần text.
5. **Lỗi form: inline + live region có sẵn trong DOM + `aria-invalid`.** Toast chỉ bổ sung.
6. **Live region (`polite`) cho thay đổi động** — số lượng giỏ, số trang, trạng thái đơn.
7. **`useId` cho cặp label/input**; `aria-hidden` cho icon trang trí.
8. **Luôn viết `alt`**: rỗng cho trang trí, mô tả cho nội dung, hành động cho chức năng.
9. **Skip link + `lang` đúng ngôn ngữ + landmark có nhãn + `metadata.title` mỗi trang** (route announcer).
10. **Heading phản ánh cấu trúc**; **reduced motion với `0.01ms`**.

---

## 15. Danh sách sửa a11y cho repo, theo ưu tiên

| # | Vấn đề | File | Tác động | Công sức |
| --- | --- | --- | --- | --- |
| 1 | Drawer không phải dialog thật | `seller-mobile-nav.tsx` | 🔴 Rất cao | 1 giờ (Base UI) |
| 2 | `pointer-events-none` không chặn bàn phím | `product-grid.tsx`, `product-list.tsx` | 🔴 Cao | 1 giờ |
| 3 | Lỗi form chỉ có toast | ~20 component | 🔴 Cao | 3 giờ |
| 4 | Thiếu skip link | `app/layout.tsx`, `(store)/layout.tsx` | 🟠 Trung bình | 15 phút |
| 5 | Tab thiếu `aria-current` | `product-list.tsx` | 🟠 Trung bình | 10 phút |
| 6 | Số lượng giỏ hàng không có live region | `cart-line.tsx`, `store-header.tsx` | 🟠 Trung bình | 1 giờ |
| 7 | `alt=""` cho gallery không có text | `edit-product-form.tsx` | 🟠 Trung bình | 10 phút |
| 8 | Hardcoded `id` | `attribute-fields.tsx` | 🟡 Thấp (chưa xung đột) | 30 phút |
| 9 | `CardTitle` không phải heading | `card.tsx` + call site | 🟡 Thấp | 1 giờ |
| 10 | Thiếu `prefers-reduced-motion` | `globals.css` | 🟡 Thấp | 15 phút |
| 11 | `nav` chưa có `aria-label` | `store-header.tsx`, `seller-sidebar.tsx` | 🟡 Thấp | 10 phút |
| — | `lang="vi"` | `app/layout.tsx` | 🔴 khi bản địa hoá | 1 phút |

---

## Tự kiểm tra

1. Vì sao `<div onClick>` là vô hình với screen reader? Cây nào bị ảnh hưởng?
2. Bốn câu hỏi tự kiểm tra a11y cho một component tương tác?
3. Năm thứ một modal/drawer bắt buộc phải có? Base UI `Dialog` / `<dialog>.showModal()` lo cái nào?
4. Thuộc tính `inert` (React 19) làm gì, và vì sao drawer không được nằm trong vùng inert?
5. So sánh `disabled`, `aria-disabled`, `pointer-events-none`, `tabIndex={-1}`.
6. `role="alert"` khác `aria-live="polite"` thế nào? Vì sao `{error && <p role="alert">}` không đáng tin?
7. Vì sao `sr-only` chứ không `display: none` cho text bổ sung?
8. Ba loại `alt` và cách chọn. `alt=""` khác thiếu `alt` thế nào?
9. Route announcer của Next đọc gì khi điều hướng? Điều đó đòi hỏi bạn làm gì ở mỗi page?
10. Vì sao `prefers-reduced-motion` dùng `0.01ms` mà không `animation: none`?

➡️ Tiếp theo: `24-security-nang-cao.md`
