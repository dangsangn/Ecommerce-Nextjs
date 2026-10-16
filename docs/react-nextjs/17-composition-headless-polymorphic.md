# 17. Composition nâng cao — Compound, Polymorphic, Headless

> **Mục tiêu:** thiết kế được API component ở mức library. Hiểu compound component, polymorphic
> component qua `render` prop, và cách `data-slot` biến CSS thành một API công khai.
> Repo này dùng `@base-ui/react` — một thư viện headless hiện đại — nên có sẵn material rất tốt.
>
> Phiên bản: React 19.2 — `ref` là prop thường, `<Context value>` thay cho `<Context.Provider>`.

---

## 1. Overview

### Vấn đề: prop explosion

```tsx
// ❌ Sáu tháng sau
<Card
  title="Orders" description="Your recent orders" showHeader headerAlign="between"
  action={<Button>New</Button>} actionPosition="header-right"
  footer={<Total />} footerVariant="muted" padding="sm" bordered hoverable
  headerClassName="..." contentClassName="..." footerClassName="..."
/>
```

1. **Số prop tăng vô hạn.** Mỗi yêu cầu mới = một prop mới.
2. **Không kiểm soát được cấu trúc.** Muốn action nằm *dưới* description? Thêm prop.
3. **Component biết quá nhiều** về mọi cách nó có thể được dùng.

### Bốn kỹ thuật giải quyết

| Kỹ thuật | Giải quyết | Có trong repo |
| --- | --- | --- |
| **Compound components** | Người dùng tự sắp xếp cấu trúc | `Select`, `Card`, `Table`, `Tabs`, `Avatar` |
| **Polymorphic (`render` prop)** | Đổi element gốc mà giữ hành vi | `Badge` (`useRender`), `SelectPrimitive.Icon` |
| **`data-slot` + variants** | Style từ ngoài, không cần prop className cho từng phần | Toàn bộ `components/ui/` |
| **Headless** | Tái dùng *hành vi*, không phải *giao diện* | `@base-ui/react` |

---

## 2. Compound Components

### 🧠 Compound component như một bộ LEGO có khớp riêng

Bạn bán bánh xe, thân xe, cửa — chúng có khớp nối **chỉ vừa với nhau**. Người dùng lắp theo ý họ,
nhưng không lắp sai được. "Khớp nối" đó là **Context ngầm** giữa các thành phần.

### 📄 Ví dụ trong repo — `Select`

```tsx
// components/discounts/create-discount-form.tsx
<Select name="discount_type" value={type} onValueChange={(v) => setType(v as DiscountType)}>
  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="fixed_amount">Fixed amount</SelectItem>
    <SelectItem value="percentage">Percentage</SelectItem>
  </SelectContent>
</Select>
```

**Điều KHÔNG có ở đây:** `SelectValue` không nhận `value`, `SelectItem` không nhận `isSelected`,
`SelectTrigger` không nhận `isOpen`, `SelectContent` không nhận `onClose`. Tất cả đi qua **Context bên
trong `Select`** (do base-ui cung cấp) — ứng dụng chính đáng nhất của Context (file `05`).

### Tự viết một compound component (React 19)

Để thấy "khớp nối" hoạt động thế nào, đây là một `Accordion` tối giản cho trang FAQ / mô tả sản phẩm:

```tsx
// components/ui/accordion.tsx
'use client'
import { createContext, use, useId, useState } from 'react'

type Ctx = { openId: string | null; toggle: (id: string) => void }
const AccordionContext = createContext<Ctx | null>(null)
const ItemContext = createContext<string | null>(null)

function useAccordion() {
  const ctx = use(AccordionContext)          // React 19: `use` đọc context, gọi được cả trong if
  if (!ctx) throw new Error('Accordion.* phải nằm trong <Accordion>')   // ✅ lỗi rõ khi lắp sai
  return ctx
}

export function Accordion({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id))
  // React 19: <Context value> thay cho <Context.Provider value>
  return <AccordionContext value={{ openId, toggle }}>{children}</AccordionContext>
}

export function AccordionItem({ children }: { children: React.ReactNode }) {
  return <ItemContext value={useId()}>{children}</ItemContext>
}

export function AccordionTrigger({ children, ref, onClick, ...props }: React.ComponentProps<'button'>) {
  // React 19: `ref` là prop thường — không cần forwardRef
  const { openId, toggle } = useAccordion()
  const id = use(ItemContext)!
  return (
    <button {...props} ref={ref} type="button" aria-expanded={openId === id} aria-controls={`${id}-panel`}
      // ❌ `onClick={() => toggle(id)} {...props}` → onClick của người dùng GHI ĐÈ toggle
      // ✅ tách onClick ra và gọi cả hai (đúng tinh thần mergeProps ở mục 3)
      onClick={(e) => { onClick?.(e); toggle(id) }}>
      {children}
    </button>
  )
}

export function AccordionPanel({ children }: { children: React.ReactNode }) {
  const { openId } = useAccordion()
  const id = use(ItemContext)!
  return <div id={`${id}-panel`} hidden={openId !== id}>{children}</div>
}
```

```tsx
<Accordion>
  <AccordionItem>
    <AccordionTrigger>Chính sách đổi trả</AccordionTrigger>
    <AccordionPanel>Đổi trong 7 ngày…</AccordionPanel>
  </AccordionItem>
  <AccordionItem>
    <AccordionTrigger>Phí vận chuyển <Badge>Mới</Badge></AccordionTrigger>
    <AccordionPanel>Miễn phí cho đơn từ 300.000đ</AccordionPanel>
  </AccordionItem>
</Accordion>
```

Không prop `items`, không `renderTitle`. Muốn chèn badge vào tiêu đề? Chỉ là JSX. (Thực tế: dùng
`Accordion` của base-ui — nó có keyboard nav đầy đủ. Ví dụ trên để hiểu cơ chế.)

### React 19 — ba thay đổi ảnh hưởng trực tiếp tới cách viết component thư viện

```tsx
// ❌ React 18
const SearchInput = forwardRef<HTMLInputElement, InputProps>((props, ref) => <input ref={ref} {...props} />)
<CartContext.Provider value={cart}>{children}</CartContext.Provider>

// ✅ React 19
function SearchInput({ ref, ...props }: React.ComponentProps<'input'>) {   // type đã gồm `ref`
  return <input ref={ref} {...props} />
}
<CartContext value={cart}>{children}</CartContext>
```

`forwardRef` và `<Context.Provider>` vẫn chạy nhưng React đã thông báo sẽ deprecate — code mới đừng dùng.
Thay đổi thứ ba: **ref callback trả về được hàm cleanup** (như effect), nên không cần `useEffect` +
`useRef` chỉ để gắn/gỡ listener lên một node:

```tsx
// Ảnh sản phẩm: ghi vị trí chuột vào CSS variable để CSS zoom theo; gỡ listener khi node bị gỡ
<img
  src={src}
  alt={name}
  ref={(node) => {
    if (!node) return
    const onMove = (e: PointerEvent) => node.style.setProperty('--x', `${e.offsetX}px`)
    node.addEventListener('pointermove', onMove)
    return () => node.removeEventListener('pointermove', onMove)   // ✅ React 19 gọi khi unmount
  }}
/>
```

(Khi có cleanup, React **không** gọi lại ref với `null` nữa. Và TypeScript sẽ báo lỗi với
`ref={(n) => (inputRef = n)}` vì arrow trả về giá trị — viết thành block `{ inputRef = n }`.)

### Vì sao không dùng prop `options`?

```tsx
<Select value={type} onChange={setType}
  options={[{ value: 'fixed_amount', label: 'Fixed amount' }, { value: 'percentage', label: 'Percentage' }]} />
```

| Yêu cầu | Với `options` | Với compound |
| --- | --- | --- |
| Item có icon | `options[].icon` + `renderIcon` | `<SelectItem><Icon/>Label</SelectItem>` |
| Nhóm có tiêu đề | Cấu trúc lồng + logic render | `<SelectGroup><SelectLabel>…` |
| Item bị disable | `options[].disabled` | `<SelectItem disabled>` |
| Dấu phân cách | `{ type: 'separator' }`?? | `<SelectSeparator />` |

📄 Repo **đã cần** một trong số đó — `components/products/create-product-form.tsx`:

```tsx
{PRODUCT_TYPES.map((t) => (
  <SelectItem key={t} value={t} disabled={!CREATABLE_TYPES.includes(t)}>
    {t}{CREATABLE_TYPES.includes(t) ? '' : ' (not available yet)'}
  </SelectItem>
))}
```

`disabled` + label động. Với API `options` cần ít nhất hai prop mới; với compound chỉ là JSX.

> **Nguyên tắc:** compound đánh đổi **độ dài** lấy **khả năng mở rộng mà không đổi API**.

### Khi nào KHÔNG dùng compound

```tsx
// ❌ Quá mức cho một cái badge
<Badge><BadgeIcon><Check /></BadgeIcon><BadgeLabel>Active</BadgeLabel></Badge>

// ✅ Vừa đủ — repo giữ Badge đơn giản đúng như vậy
<Badge><Check className="size-3" />Active</Badge>
```

**Ranh giới:** compound đáng dùng khi các phần có **quan hệ trạng thái** (trigger biết content đang mở)
hoặc **cấu trúc thay đổi theo ca dùng**. Nếu không, một component với `children` là đủ.

---

## 3. ⭐ Polymorphic Components — `render` prop

### Vấn đề

`<Button>` có 6 variant, 8 size, focus ring, disabled state. Giờ bạn cần **một link trông giống button**.

```tsx
// ❌ 1: <a> trong <button> — HTML không hợp lệ, a11y vỡ
<Button><a href="/seller">Seller Centre</a></Button>

// ❌ 2: copy class — sẽ lệch khi Button đổi
<a href="/seller" className="inline-flex shrink-0 items-center justify-center rounded-lg ...">

// ❌ 3: thêm prop `href` — giờ Button phải biết về routing
<Button href="/seller">Seller Centre</Button>
```

### 📄 Cách repo giải quyết: xuất `buttonVariants`

`components/ui/button.tsx` export cả hai: `export { Button, buttonVariants }`. Call site:

```tsx
// components/store/order-card.tsx
<Link href={`/orders/${order._id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>

// components/products/product-list.tsx — có class điều kiện
<Link
  href={`/seller/products?tab=${tab}&page=${pagination.page - 1}`}
  aria-disabled={!pagination.hasPreviousPage}
  className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasPreviousPage && 'pointer-events-none opacity-50')}
>
```

Đơn giản, không magic, type-safe qua `VariantProps`. **Hai giới hạn:** (1) chỉ lấy được **class**,
không lấy được hành vi của component; (2) phải tự nhớ `cn()` để giải quyết conflict Tailwind.

### 📄 Cách nâng cao: `useRender` + `mergeProps`

`components/ui/badge.tsx`:

```tsx
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

const badgeVariants = cva("group/badge inline-flex h-5 ... rounded-4xl ... text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
      secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
      outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
      // destructive, ghost, link ...
    },
  },
  defaultVariants: { variant: "default" },
})

function Badge({
  className,
  variant = "default",
  render,                                      // ⭐
  ...props                                     // gồm cả `ref` — React 19 không cần forwardRef
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",                    // ⭐ mặc định <span>
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: "badge", variant },
  })
}
```

```tsx
<Badge variant="secondary">{product.product_type}</Badge>                    // <span>
<Badge render={<Link href="/orders?status=pending" />}>pending</Badge>        // <a>, giữ style
<Badge variant="outline" render={<button type="button" onClick={filter} />}>Lọc</Badge>  // <button>
```

### `mergeProps` làm gì mà `{...props}` không làm được?

| Loại prop | `{...a, ...b}` | `mergeProps(a, b)` (base-ui) |
| --- | --- | --- |
| `className` | b **ghi đè** a → mất style gốc | **Nối** cả hai (chỉ nối chuỗi, không tailwind-merge → vẫn dùng `cn()` ở trong) |
| `style` | b ghi đè a | Merge từng key, b thắng khi trùng key |
| `onClick`, `onKeyDown`… | b ghi đè a → mất handler gốc | **Gọi cả hai**, phải → trái (b chạy trước, có thể `event.preventBaseUIHandler()`) |
| `ref` | b ghi đè a | ⚠️ **Không gộp** — muốn gộp nhiều ref, truyền mảng vào tham số `ref` của `useRender` |
| `id`, `href`, `disabled`… | b ghi đè a | b ghi đè a |

```tsx
<Badge variant="outline" className="mt-2" render={<Link href="/x" className="font-bold" />} />
// Spread thường: className = "font-bold" → mất TOÀN BỘ badgeVariants
// useRender/mergeProps: "font-bold group/badge inline-flex ... mt-2" → giữ hết
```

### `state` → `data-*` attribute

`useRender` biến `state` thành data attribute:

```html
<span data-slot="badge" data-variant="secondary" class="...">CLOTHING</span>
```

Kết hợp với variant `[a]:hover:bg-primary/80` — Tailwind arbitrary variant nghĩa là *"chỉ hover KHI
element này là `<a>`"*. Badge tĩnh không nên có hover (gây cảm giác bấm được); badge render thành link
thì nên có. Cùng component, hành vi khác nhau theo element gốc — một dòng CSS.

### So sánh bốn cách làm polymorphic

| Cách | Ví dụ | Ưu | Nhược |
| --- | --- | --- | --- |
| **Export variants** | `buttonVariants()` + `<Link>` | Đơn giản | Chỉ style; tự `cn()` |
| **`as` prop** | `<Badge as={Link} href="/x">` | Ngắn | Type generic phức tạp, khó infer |
| **`asChild`** (Radix) | `<Badge asChild><Link/></Badge>` | Quen thuộc | `cloneElement`; đúng một child |
| **`render` prop** (base-ui) | `<Badge render={<Link href="/x" />} />` | Props nằm trên JSX thật → TS infer tự nhiên; merge đúng | Cú pháp lạ lúc đầu |

### Áp dụng: badge trạng thái đơn hàng thành bộ lọc

📄 `components/store/order-card.tsx` hiện: `<Badge variant={statusVariant(order.order_status)}>`.
Khi cần "lọc đơn theo trạng thái":

```tsx
<Badge
  variant={statusVariant(order.order_status)}
  render={<Link href={`/orders?status=${order.order_status}`} />}
>
  {order.order_status}
</Badge>
```

Tự có hover (nhờ `[a]:hover:`), giữ màu theo variant, và là `<a>` thật (mở tab mới được, crawler đọc được).

---

## 4. ⭐ `data-slot` — biến CSS thành API công khai

Mọi component trong `components/ui/` tự đánh dấu: `data-slot="card"`, `"card-header"`, `"card-title"`,
`"card-footer"`, `"card-action"`... Nhìn qua tưởng để debug. Thực ra nó là **giao diện styling**.

### Ứng dụng 1 — Cha style con mà không cần prop

📄 `components/ui/card.tsx` (root, rút gọn):

```tsx
<div
  data-slot="card"
  data-size={size}
  className={cn(
    "group/card flex flex-col gap-(--card-spacing) py-(--card-spacing) rounded-2xl ...",
    "[--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)]",
    "has-data-[slot=card-footer]:pb-0",
    "*:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
    className,
  )}
/>
```

| Class | Nghĩa |
| --- | --- |
| `has-data-[slot=card-footer]:pb-0` | CSS `:has()` — *"nếu card có con `data-slot="card-footer"` thì bỏ padding dưới"*. Không cần prop `hasFooter` |
| `*:[img:first-child]:rounded-t-xl` | Con trực tiếp là `<img>` đầu tiên → bo góc trên khớp card |
| `[--card-spacing:--spacing(4)]` | Card khai báo CSS variable làm "token"; con dùng `px-(--card-spacing)`. `size="sm"` đổi biến → **mọi con tự đổi padding** |

```tsx
// Có footer → padding dưới tự = 0. Không useState, không Context, không prop.
<Card>
  <CardHeader><CardTitle>Giỏ hàng</CardTitle></CardHeader>
  <CardContent>…</CardContent>
  <CardFooter>Tổng: 100.000đ</CardFooter>
</Card>
```

### Ứng dụng 2 — `group/name` cho scoped parent state

```tsx
// card.tsx — CardTitle đọc size của Card cha
"font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm"
```

`group-data-[size=sm]/card:text-sm` = *"nếu group tên `card` có `data-size="sm"` → `text-sm`."*

**Vì sao phải đặt TÊN?** Group lồng nhau: `CardHeader` cũng là `group/card-header`. `CardTitle` nằm
trong cả hai, và tên chỉ rõ nó đọc group nào.

📄 `avatar.tsx` dùng mạnh hơn — `AvatarBadge` tự scale theo size của `Avatar` cha, và **ẩn icon** khi
avatar quá nhỏ:

```tsx
"group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
"group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
```

Làm bằng React cần Context + `use` ở mỗi con. Ở đây là 0 byte JavaScript.

### Ứng dụng 3 — Layout tự thích ứng + container query

📄 `CardHeader`:

```tsx
"group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing)",
"has-data-[slot=card-action]:grid-cols-[1fr_auto]",
```

- **`@container/card-header`** — con phản ứng theo **chiều rộng header**, không theo viewport (card trong
  sidebar hẹp khác card full-width dù viewport giống nhau).
- **`has-data-[slot=card-action]:grid-cols-[1fr_auto]`** — có `<CardAction>` thì header tự thành 2 cột;
  `CardAction` tự định vị bằng `col-start-2 row-span-2 row-start-1 self-start justify-self-end`.

```tsx
<CardHeader>
  <CardTitle>Địa chỉ giao hàng</CardTitle>
  <CardDescription>Nguyễn Văn A · 0901…</CardDescription>
  <CardAction><Button size="sm">Sửa</Button></CardAction>   {/* → header tự 2 cột */}
</CardHeader>
```

### ⚖️ Trade-off của `data-slot`

| Lợi ích | Cái giá |
| --- | --- |
| 0 byte JS cho layout logic; chạy cả khi JS chưa tải | Class string dài, khó đọc |
| Không prop explosion | Đòi hỏi hiểu sâu Tailwind arbitrary variants |
| Style từ ngoài mà không forward className từng phần | `data-slot` thành **API công khai** — đổi tên là breaking change |
| Container query → responsive cấp component | Debug "vì sao padding = 0?" phải tìm `:has()` ở cha |

Đúng cho **design system** (chi phí viết một lần, lợi ích ở hàng trăm call site). Đừng áp vào component
nghiệp vụ như `OrderCard` — nó chỉ dùng một cấu hình.

---

## 5. Headless: tách hành vi khỏi giao diện

### Vấn đề mà `@base-ui/react` giải quyết

Một `<Select>` **đúng** cần: keyboard (Arrow, Home/End, Enter, Escape, **typeahead**), ARIA (`listbox`,
`option`, `aria-selected`, `aria-activedescendant`), focus management (trả focus về trigger khi đóng),
positioning (flip/shift theo viewport), click outside, portal, scroll lock. **Không gì trong đó liên quan
tới việc select trông thế nào.** Headless library cho toàn bộ hành vi, không có style.

### 📄 Cách repo bọc nó — `components/ui/select.tsx`

```tsx
"use client"
import { Select as SelectPrimitive } from "@base-ui/react/select"

const Select = SelectPrimitive.Root          // ← re-export thẳng

function SelectTrigger({ className, size = "default", children, ...props }:
  SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn("flex w-fit items-center ... data-placeholder:text-muted-foreground data-[size=sm]:h-7 *:data-[slot=select-value]:line-clamp-1", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-muted-foreground" />} />
    </SelectPrimitive.Trigger>
  )
}
```

1. **Kế thừa type từ primitive** — `SelectPrimitive.Trigger.Props & { size?: … }`.
2. **`data-placeholder:`** — style theo data attribute mà **primitive tự set** khi chưa chọn gì.
3. **`*:data-[slot=select-value]:line-clamp-1`** — trigger style con `SelectValue` (mục 4).
4. **`render` cho slot Icon** — polymorphic theo chiều ngược: cung cấp element cho một slot.

`SelectContent` gói **bốn tầng primitive** (`Portal` → `Positioner` → `Popup` → `List`, kèm scroll
arrows) thành một component. Và dùng các **CSS variable mà primitive tính sẵn**:

```tsx
"max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) data-open:animate-in data-closed:animate-out"
```

`--available-height` (chiều cao còn lại tới mép viewport), `--anchor-width` (rộng bằng trigger),
`--transform-origin` (gốc animation theo hướng mở). Hợp đồng: **library tính toán, bạn dùng biến.**

### Tự viết một hook headless

Không phải lúc nào cũng cần library. Một disclosure (drawer/popover) đơn giản:

```tsx
// lib/hooks/use-disclosure.ts
'use client'
import { useEffect, useId, useState } from 'react'

export function useDisclosure({ closeOnEscape = true, lockScroll = false } = {}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape])

  useEffect(() => {
    if (!open || !lockScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open, lockScroll])

  return {
    open,
    close: () => setOpen(false),
    /** Spread lên nút mở */
    triggerProps: { 'aria-expanded': open, 'aria-controls': panelId, onClick: () => setOpen((o) => !o) },
    /** Spread lên panel */
    panelProps: { id: panelId, hidden: !open },
  }
}
```

📄 `components/seller/seller-mobile-nav.tsx` hiện tự làm `useState` + effect lock scroll, nhưng
**chưa có Escape để đóng** và **chưa có `aria-controls`**. Dùng hook:

```tsx
export function SellerMobileNav() {
  const pathname = usePathname()
  const { open, close, triggerProps } = useDisclosure({ lockScroll: true })
  return (
    <div className="md:hidden">
      <button type="button" aria-label="Open menu" {...triggerProps}><Menu className="size-5" /></button>
      {/* drawer giữ nguyên, dùng `open` và `close` */}
    </div>
  )
}
```

Được Escape + `aria-controls` miễn phí (a11y, xem file `23`). ⚠️ Nhưng drawer **thật** còn cần focus trap
và trả focus về trigger — đó là lúc nên dùng `Dialog`/`Drawer` của base-ui thay vì tự viết.

---

## 6. 🛠️ Bài tập: Headless Pagination cho repo

📄 Hai file có block phân trang gần như y hệt: `components/store/product-grid.tsx` (có hàm `pageHref(q,
page)` riêng) và `components/products/product-list.tsx` (build href inline
`` `/seller/products?tab=${tab}&page=${...}` ``). Cả hai dùng `<Link aria-disabled>` +
`pointer-events-none opacity-50` cho nút disabled.

⚠️ Và `TabLink` trong `product-list.tsx` build `/seller/products?tab=${tab}` — mất `page` (về trang 1 là
hành vi hợp lý, nhưng là do **quên** chứ không phải chủ ý), và **không có `aria-current`** → tab active
chỉ phân biệt bằng màu.

### Bước 1 — Hàm pure build href, đặt trong `lib/` để test được

```tsx
// lib/pagination/href.ts
/** Build URL phân trang, giữ các param khác. Bỏ `page` khi = 1 để URL sạch. */
export function pageHref(basePath: string, currentParams: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(currentParams)) if (v) params.set(k, v)
  if (page > 1) params.set('page', String(page))
  const s = params.toString()
  return s ? `${basePath}?${s}` : basePath
}
```

```tsx
// lib/pagination/__tests__/href.test.ts
import { describe, it, expect } from 'vitest'
import { pageHref } from '@/lib/pagination/href'

describe('pageHref', () => {
  it('bỏ page khi bằng 1', () => expect(pageHref('/', {}, 1)).toBe('/'))
  it('giữ các param khác', () => expect(pageHref('/', { q: 'áo' }, 2)).toBe('/?q=%C3%A1o&page=2'))
  it('giữ tab ở seller', () =>
    expect(pageHref('/seller/products', { tab: 'published' }, 3)).toBe('/seller/products?tab=published&page=3'))
  it('bỏ param rỗng', () => expect(pageHref('/', { q: '' }, 2)).toBe('/?page=2'))
})
```

### Bước 2 — `<Pagination>` dùng chung (Server Component, 0 byte JS)

```tsx
// components/ui/pagination.tsx — KHÔNG có 'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { pageHref } from '@/lib/pagination/href'
import type { Pagination as PaginationInfo } from '@/types/product'

// Khai báo NGOÀI Pagination — component định nghĩa trong thân component khác bị tạo mới mỗi render
function PageLink({ href, enabled, children }: { href: string; enabled: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}        // ✅ chặn cả keyboard, không chỉ chuột
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), !enabled && 'pointer-events-none opacity-50')}
    >
      {children}
    </Link>
  )
}

export function Pagination({ info, basePath, params = {}, className }: {
  info: PaginationInfo
  basePath: string
  params?: Record<string, string | undefined>
  className?: string
}) {
  if (info.totalPages <= 1) return null
  return (
    <nav aria-label="Phân trang" className={cn('flex items-center justify-between', className)}>
      <span className="text-sm text-muted-foreground">Trang {info.page} / {info.totalPages}</span>
      <div className="flex gap-2">
        <PageLink href={pageHref(basePath, params, info.page - 1)} enabled={info.hasPreviousPage}>Trước</PageLink>
        <PageLink href={pageHref(basePath, params, info.page + 1)} enabled={info.hasNextPage}>Sau</PageLink>
      </div>
    </nav>
  )
}
```

- **`<nav aria-label>`** — screen reader nhận diện vùng phân trang.
- **`tabIndex={-1}` khi disabled** — `pointer-events-none` chặn chuột nhưng **không** chặn Tab + Enter.
  Thiếu nó, người dùng keyboard tới được "trang 0". Bug này đang có ở cả hai file của repo.

### Bước 3 — Call site + sửa `TabLink`

```tsx
<Pagination info={pagination} basePath="/" params={{ q }} />                       // product-grid
<Pagination info={pagination} basePath="/seller/products" params={{ tab }} />      // product-list

function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      href={pageHref('/seller/products', { tab }, 1)}    // về trang 1 một cách TƯỜNG MINH
      aria-current={active ? 'page' : undefined}          // ✅ không chỉ dựa vào màu
      className={cn('inline-flex h-8 items-center rounded-md px-3 text-sm font-medium',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </Link>
  )
}
```

(`product-grid` có thêm class brand riêng — truyền qua `className` hoặc thêm variant, đừng thêm prop
`brandStyle`.)

---

## 7. When NOT to abstract

Lạm dụng composition tệ hơn không dùng.

### 📄 Ví dụ repo làm ĐÚNG khi không abstract — `components/products/attribute-fields.tsx`

```tsx
export function AttributeFields({ type, defaults }: { type: ProductType; defaults?: Record<string, unknown> }) {
  const dv = (k: string) => (defaults?.[k] != null ? String(defaults[k]) : undefined)
  if (type === 'CLOTHING') {
    // color/size là trục biến thể (SKU) nên nằm ở variant editor, không ở đây
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="brand" label="Brand" required defaultValue={dv('brand')} />
        <Field name="material" label="Material" defaultValue={dv('material')} />
      </div>
    )
  }
  if (type === 'ELECTRONICS') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="manufacturer" label="Manufacturer" required defaultValue={dv('manufacturer')} />
        <Field name="model" label="Model" defaultValue={dv('model')} />
      </div>
    )
  }
  return <p className="text-sm text-muted-foreground">This product type isn&apos;t available yet.</p>
}
```

Hai `if` và JSX viết tay — **lựa chọn đúng**: chỉ 2 loại, field rất khác nhau, đọc là hiểu luật nghiệp
vụ, thêm loại thứ 3 = thêm một `if`. Nếu abstract thành `FIELD_CONFIG[type].map(...)`, bạn bớt vài dòng
nhưng phải nhảy file để biết CLOTHING có field nào.

⚖️ File `11` đề xuất `ATTRIBUTE_SPECS` — hợp lý vì lý do **một nguồn sự thật cho luật validate** (Zod +
JSX), không phải để "code ngắn hơn".

| Loại trùng lặp | Ví dụ | Nên abstract? |
| --- | --- | --- |
| **Cấu trúc** (cùng shape, khác dữ liệu) | 2 block pagination | ✅ Có |
| **Tri thức** (cùng luật ở 2 nơi) | Luật attribute ở Zod + JSX | ✅ Có — vì tính đúng đắn |
| **Ngẫu nhiên** (trông giống, ý nghĩa khác) | 2 `if` trong `AttributeFields` | ❌ Không |

### Ba dấu hiệu abstraction sai

1. **Phải thêm prop cho mỗi ca dùng mới** (`showPageNumbers`, `maxVisiblePages`, `variant="compact"`…)
   → đang tiến tới prop explosion; tách component.
2. **Có "escape hatch" cho mọi thứ** (`renderItem`, `renderHeader`, `itemClassName`, `containerProps`)
   → người dùng nên tự viết component.
3. **Abstract từ MỘT ca dùng.** "Rule of three". Pagination có đúng hai ca — lý do abstract là **sửa bug
   a11y một lần thay vì hai lần**, không chỉ để DRY.

---

## 8. Best Practices

1. **Compound khi các phần có quan hệ trạng thái hoặc cấu trúc thay đổi theo ca dùng.** Throw lỗi rõ
   ràng khi sub-component nằm ngoài root.
2. **React 19:** `<Context value>` thay `<Context.Provider>`; `ref` là prop thường — đừng viết
   `forwardRef` mới (cả hai vẫn chạy nhưng sẽ bị deprecate); ref callback có thể trả cleanup.
3. **Export cả component và variants** (`export { Button, buttonVariants }`) — đường thoát cho element khác.
4. **Polymorphic thật → `render` prop + `mergeProps`.** Đừng `{...props}` để merge `className`/handler.
   Nhớ `mergeProps` **không** gộp `ref`.
5. **`data-slot` là API công khai.** Đặt tên cẩn thận, đừng đổi tuỳ ý.
6. **Đặt tên cho group (`group/card`)** — group không tên vỡ khi lồng nhau.
7. **Logic a11y phức tạp (select, dialog, combobox) → headless library.** Tự viết gần như chắc chắn thiếu.
8. **Tách hàm pure ra `lib/` để test.** `pageHref` là logic; `<Pagination>` là trình bày.
9. **`pointer-events-none` phải đi kèm `tabIndex={-1}`.**
10. **Chờ ca thứ ba trước khi abstract** — trừ khi abstract sửa được một bug ở nhiều chỗ.

---

## Tự kiểm tra

1. Kể ba yêu cầu mà API `options` không xử lý được nhưng compound component xử lý dễ dàng.
2. Viết lại `AccordionTrigger` theo kiểu React 18 — khác gì so với React 19 (ref, Provider, `use`)?
   Vì sao đặt `{...props}` *sau* `onClick` là bug?
3. `mergeProps` xử lý `className`, handler, `ref` khác `{...spread}` thế nào?
4. `[a]:hover:bg-primary/80` trong `badgeVariants` giải quyết vấn đề thiết kế gì?
5. `has-data-[slot=card-footer]:pb-0` làm gì? Nếu làm bằng React thì cần những gì?
6. Vì sao `group` phải có tên (`group/card`)?
7. `max-h-(--available-height)` đến từ đâu? Nó thể hiện hợp đồng gì?
8. Vì sao `pointer-events-none` một mình là một bug accessibility?
9. Phân biệt trùng lặp cấu trúc / tri thức / ngẫu nhiên. Cho ví dụ từ repo.

➡️ Tiếp theo: `18-custom-hooks-va-state-machines.md`
