# 17. Composition nâng cao — Compound, Polymorphic, Headless

> **Mục tiêu:** thiết kế được API component ở mức library. Hiểu compound component, polymorphic
> component qua `render` prop, và cách `data-slot` biến CSS thành một API công khai.
> Repo này dùng `@base-ui/react` — một thư viện headless hiện đại — nên có sẵn material rất tốt.

---

## 1. Overview

### Vấn đề: prop explosion

Cách thiết kế component "tự nhiên" là thêm prop cho mọi biến thể:

```tsx
// ❌ Sáu tháng sau
<Card
  title="Orders"
  description="Your recent orders"
  showHeader
  headerAlign="between"
  action={<Button>New</Button>}
  actionPosition="header-right"
  footer={<Total />}
  footerVariant="muted"
  padding="sm"
  bordered
  hoverable
  headerClassName="..."
  contentClassName="..."
  footerClassName="..."
/>
```

Ba vấn đề không thể tránh:

1. **Số prop tăng vô hạn.** Mỗi yêu cầu mới = một prop mới. Không có điểm dừng.
2. **Không kiểm soát được thứ tự và cấu trúc.** Muốn action nằm *dưới* description? Cần thêm prop.
3. **Component biết quá nhiều.** Nó phải hiểu mọi cách nó có thể được dùng.

### Bốn kỹ thuật giải quyết

| Kỹ thuật | Giải quyết | Có trong repo |
| --- | --- | --- |
| **Compound components** | Người dùng tự sắp xếp cấu trúc | `Select`, `Card`, `Table`, `Tabs`, `Avatar` |
| **Polymorphic (`render` prop)** | Đổi element gốc mà giữ hành vi | `Badge` (`useRender`), `SelectIcon` |
| **`data-slot` + variants** | Style được từ ngoài mà không cần prop className cho từng phần | Toàn bộ `components/ui/` |
| **Headless (tách logic khỏi UI)** | Tái dùng *hành vi*, không phải *giao diện* | `@base-ui/react` |

---

## 2. Compound Components

### Mental Model

### 🧠 Compound component như một bộ LEGO có khớp riêng

Bạn không bán "một chiếc xe". Bạn bán bánh xe, thân xe, cửa — và chúng có khớp nối **chỉ vừa với nhau**.
Người dùng lắp theo ý họ, nhưng không lắp sai được.

"Khớp nối" đó là **Context ngầm** giữa các thành phần.

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

**Hãy để ý điều gì KHÔNG có ở đây:**

- `SelectValue` không nhận prop `value` — nó tự biết giá trị đang chọn
- `SelectItem` không nhận `isSelected` — nó tự biết mình có được chọn không
- `SelectTrigger` không nhận `isOpen` — nó tự biết popup đang mở
- `SelectContent` không nhận `onClose` — nó tự đóng khi chọn xong

Tất cả đi qua **Context bên trong `Select`** (do `@base-ui/react` cung cấp). Đây là ứng dụng chính đáng
nhất của Context (nhớ lại file `05`, mục 12): dữ liệu phải đi qua nhiều tầng DOM mà prop drilling
sẽ rất tệ.

### Vì sao không dùng prop `options`?

```tsx
// Cách "đơn giản" — và giới hạn của nó
<Select
  value={type}
  onChange={setType}
  options={[
    { value: 'fixed_amount', label: 'Fixed amount' },
    { value: 'percentage', label: 'Percentage' },
  ]}
/>
```

Nhìn gọn hơn. Nhưng thử làm các việc sau:

| Yêu cầu | Với `options` | Với compound |
| --- | --- | --- |
| Item có icon | Thêm `options[].icon` + prop `renderIcon` | `<SelectItem><Icon/>Label</SelectItem>` |
| Nhóm item có tiêu đề | Thêm cấu trúc lồng vào `options` + logic render | `<SelectGroup><SelectLabel>…` |
| Một item bị disable | Thêm `options[].disabled` | `<SelectItem disabled>` |
| Dấu phân cách | Thêm `{ type: 'separator' }` vào options?? | `<SelectSeparator />` |
| Item có badge "mới" | Thêm prop render function | `<SelectItem>Label <Badge>Mới</Badge></SelectItem>` |

📄 Và repo **đã cần** một trong những cái đó — `components/products/create-product-form.tsx`:

```tsx
<Select name="product_type" value={type} onValueChange={(v) => setType(v as ProductType)}>
  <SelectTrigger className="w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {PRODUCT_TYPES.map((t) => (
      <SelectItem key={t} value={t} disabled={!CREATABLE_TYPES.includes(t)}>
        {t}{CREATABLE_TYPES.includes(t) ? '' : ' (not available yet)'}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

`disabled` + label động ("(not available yet)"). Với API `options`, việc này cần ít nhất hai prop mới.
Với compound, nó chỉ là JSX bình thường.

> **Nguyên tắc:** compound component đánh đổi **độ dài** lấy **khả năng mở rộng vô hạn mà không đổi
> API**. Với component dùng ở nhiều nơi với yêu cầu khác nhau, đó là đánh đổi luôn đúng.

### Khi nào KHÔNG dùng compound

```tsx
// ❌ Quá mức cho một cái badge
<Badge>
  <BadgeIcon><Check /></BadgeIcon>
  <BadgeLabel>Active</BadgeLabel>
</Badge>

// ✅ Vừa đủ
<Badge><Check className="size-3" />Active</Badge>
```

📄 Repo giữ `Badge` đơn giản — chỉ một component, nhận `children` và `variant`. Đúng, vì badge không
có cấu trúc nội bộ cần sắp xếp.

**Ranh giới:** compound đáng dùng khi các phần có **quan hệ trạng thái** với nhau (trigger biết
content đang mở) hoặc **thứ tự/cấu trúc thay đổi theo ca dùng**. Nếu không, một component với
`children` là đủ.

---

## 3. ⭐ Polymorphic Components — `render` prop

### Vấn đề

Bạn có `<Button>` với 6 variant, 8 size, focus ring, transition, disabled state, icon spacing.
Giờ bạn cần **một cái link trông giống button**.

Ba cách sai:

```tsx
// ❌ Cách 1: nhét <a> vào <button> — HTML không hợp lệ, a11y vỡ
<Button><a href="/seller">Seller Centre</a></Button>

// ❌ Cách 2: copy toàn bộ class — trùng lặp, và sẽ lệch khi Button đổi
<a href="/seller" className="inline-flex shrink-0 items-center justify-center rounded-lg ...">

// ❌ Cách 3: thêm prop `href` vào Button — giờ Button phải biết về routing
<Button href="/seller">Seller Centre</Button>
```

### 📄 Cách repo giải quyết: xuất `buttonVariants`

`components/ui/button.tsx` export **cả hai**:

```tsx
export { Button, buttonVariants }
```

Và call site dùng `buttonVariants` với `<Link>`:

```tsx
// components/store/store-header.tsx
<Link href="/seller" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
  <Store className="size-4" />
  Seller Centre
</Link>
```

```tsx
// components/products/product-list.tsx — có thêm class điều kiện
<Link
  href={`/seller/products?tab=${tab}&page=${pagination.page - 1}`}
  aria-disabled={!pagination.hasPreviousPage}
  className={cn(
    buttonVariants({ variant: 'outline' }),
    !pagination.hasPreviousPage && 'pointer-events-none opacity-50',
  )}
>
  Previous
</Link>
```

**Đây là một giải pháp tốt và thực dụng.** Ưu điểm: đơn giản, không magic, type-safe qua `VariantProps`.

**Nhưng nó có hai giới hạn:**

1. **Bạn chỉ lấy được class, không lấy được hành vi.** `Button` của base-ui có xử lý keyboard, focus
   management, `data-pressed` state. `<Link className={buttonVariants()}>` chỉ có style.
2. **Bạn phải nhớ dùng `cn()`** để merge class thêm vào. Quên thì Tailwind conflict không được giải quyết.

### 📄 Cách nâng cao: `useRender` + `mergeProps`

`components/ui/badge.tsx` dùng đúng kỹ thuật này:

```tsx
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all ...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive: "bg-destructive/10 text-destructive ... [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Badge({
  className,
  variant = "default",
  render,                                      // ⭐ prop này
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",                    // ⭐ mặc định là <span>
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  })
}
```

**Cách dùng:**

```tsx
// Mặc định: render ra <span>
<Badge variant="secondary">{product.product_type}</Badge>

// Polymorphic: render ra <a>, GIỮ NGUYÊN mọi style và props của Badge
<Badge render={<Link href="/orders?status=pending" />}>pending</Badge>

// Hoặc thành <button>
<Badge variant="outline" render={<button type="button" onClick={filter} />}>
  Lọc theo trạng thái
</Badge>
```

### `mergeProps` làm gì mà `{...props}` không làm được?

Đây là phần cốt lõi. Khi bạn merge props từ hai nguồn, có **bốn** loại xung đột và mỗi loại cần một
chiến lược khác nhau:

| Loại prop | `{...a, ...b}` làm gì | `mergeProps` làm gì |
| --- | --- | --- |
| `className` | b **ghi đè** a → mất style gốc | **Nối** cả hai |
| `style` | b **ghi đè** a → mất style gốc | **Merge** từng key |
| `onClick`, `onKeyDown`… | b **ghi đè** a → mất handler gốc | **Gọi cả hai**, theo thứ tự |
| `ref` | b ghi đè a → mất ref gốc | **Compose** cả hai |
| `id`, `href`, `disabled`… | b ghi đè a (thường đúng) | b ghi đè a |

Ví dụ cụ thể vì sao điều này quan trọng:

```tsx
// Nếu Badge dùng {...props} thông thường và bạn viết:
<Badge render={<button onClick={handleFilter} />}>Lọc</Badge>

// Với spread thường: onClick nội bộ của Badge (nếu có) BỊ MẤT
// Với mergeProps: cả hai onClick đều chạy
```

Và với `className`:

```tsx
<Badge variant="outline" className="mt-2" render={<Link href="/x" className="font-bold" />} />

// Spread thường: className cuối = "font-bold" → mất TOÀN BỘ badgeVariants
// mergeProps: className = "group/badge inline-flex ... border-border text-foreground mt-2 font-bold"
```

### `state` và `data-*` attribute

```tsx
state: { slot: "badge", variant },
```

`useRender` biến `state` thành **data attribute** trên element được render:

```html
<span data-slot="badge" data-variant="secondary" class="...">CLOTHING</span>
```

Điều này mở ra hai khả năng:

**(1) Style từ component cha** (xem mục 4).

**(2) Style dựa trên element thật.** Để ý các variant của `badgeVariants`:

```tsx
default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
```

`[a]:hover:...` là một Tailwind arbitrary variant: *"chỉ áp dụng hover style KHI element này là một
`<a>`"*.

**Đây là chi tiết thiết kế rất tinh tế.** Một badge tĩnh không nên có hover effect — nó gây cảm giác
"bấm được" trong khi không phải. Nhưng một badge được render thành link thì **nên** có. Cùng một
component, hành vi hover khác nhau tuỳ element gốc — và tất cả trong một dòng CSS.

### So sánh ba cách làm polymorphic

| Cách | Ví dụ | Ưu | Nhược |
| --- | --- | --- | --- |
| **Export variants** | `buttonVariants()` + `<Link>` | Đơn giản, không magic, dễ hiểu | Chỉ có style, không có hành vi; phải tự `cn()` |
| **`as` prop** | `<Badge as={Link} href="/x">` | Ngắn gọn | Type khó (generic phức tạp); props của `as` khó infer |
| **`render` prop** | `<Badge render={<Link href="/x" />} />` | Type tự nhiên (props nằm trên JSX thật); merge đúng | Cú pháp lạ lúc đầu |
| **`asChild`** (Radix) | `<Badge asChild><Link/></Badge>` | Quen thuộc | Phải `cloneElement`; yêu cầu đúng một child |

`render` prop (base-ui) là hướng hiện đại nhất: props của element đích được viết **trên chính element
đó**, nên TypeScript infer chính xác không cần generic gymnastics.

### ⚠️ Áp dụng vào repo: `Badge` cho order status

📄 `components/store/order-card.tsx`:

```tsx
<Badge variant={statusVariant(order.order_status)}>{order.order_status}</Badge>
```

Đây là badge tĩnh — hợp lý. **Nhưng** nếu sau này thêm chức năng "lọc đơn theo trạng thái", `render`
prop cho bạn nó miễn phí:

```tsx
<Badge
  variant={statusVariant(order.order_status)}
  render={<Link href={`/orders?status=${order.order_status}`} />}
>
  {order.order_status}
</Badge>
```

Tự động có hover state (nhờ `[a]:hover:`), giữ nguyên màu theo variant, và là `<a>` thật (accessible,
mở tab mới được, crawler đọc được).

---

## 4. ⭐ `data-slot` — biến CSS thành API công khai

Đây là pattern tinh vi nhất trong `components/ui/` và ít được giải thích nhất.

### Mọi component đều đánh dấu chính nó

```tsx
// card.tsx
<div data-slot="card" data-size={size} className={...} />
<div data-slot="card-header" className={...} />
<div data-slot="card-title" className={...} />
<div data-slot="card-content" className={...} />
<div data-slot="card-footer" className={...} />
<div data-slot="card-action" className={...} />
```

Nhìn qua tưởng chỉ để debug. Thực ra nó là **giao diện styling**.

### Ứng dụng 1 — Cha style con mà không cần prop

📄 `components/ui/card.tsx`:

```tsx
function Card({ className, size = "default", ...props }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}
```

Hãy giải mã ba selector quan trọng:

**`has-data-[slot=card-footer]:pb-0`**

Dịch: *"NẾU trong card này có một element với `data-slot="card-footer"`, thì bỏ padding-bottom."*

Đây là CSS `:has()` — một **parent selector**. Card tự điều chỉnh padding **dựa trên việc nó có footer
hay không**, mà không cần ai truyền prop `hasFooter`.

```tsx
// Không footer → card có padding dưới
<Card>
  <CardHeader><CardTitle>Items</CardTitle></CardHeader>
  <CardContent>...</CardContent>
</Card>

// Có footer → padding dưới tự động = 0 (vì footer đã có padding riêng)
<Card>
  <CardHeader><CardTitle>Items</CardTitle></CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>Total: 100.000đ</CardFooter>
</Card>
```

**Không có `useState`, không có Context, không có prop.** Chỉ CSS. Đây là loại logic mà trước đây bắt
buộc phải làm bằng JavaScript.

**`*:[img:first-child]:rounded-t-xl`**

Dịch: *"con trực tiếp nào là `<img>` và ở vị trí đầu → bo góc trên."*

Cho phép bạn viết `<Card><img src="..." />...</Card>` và ảnh tự bo góc khớp với card.

**`[--card-spacing:--spacing(4)]` + `data-[size=sm]:[--card-spacing:--spacing(3)]`**

Card khai báo một **CSS custom property** làm "token" của riêng nó, rồi các con dùng
`px-(--card-spacing)`:

```tsx
function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn("... px-(--card-spacing) ...", className)} {...props} />
}
function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />
}
```

Đổi `size="sm"` trên `Card` → biến CSS đổi → **mọi con tự động đổi padding**. Không truyền prop nào.

### Ứng dụng 2 — `group/name` cho scoped parent state

📄 `card.tsx`:

```tsx
// Card đặt tên group
className="group/card ... data-[size=sm]:..."

// CardTitle đọc state của group đó
function CardTitle({ className, ...props }) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}
```

`group-data-[size=sm]/card:text-sm` = *"nếu group tên `card` có `data-size="sm"`, dùng `text-sm`."*

**Vì sao phải đặt TÊN cho group (`/card`)?** Vì group có thể lồng nhau:

```tsx
<Card size="sm">                 {/* group/card */}
  <CardHeader>                    {/* group/card-header */}
    <CardTitle />                 {/* đọc group/card, KHÔNG phải group/card-header */}
```

📄 `avatar.tsx` cho thấy pattern này ở mức phức tạp hơn:

```tsx
// Avatar đặt group + data-size
className="group/avatar relative flex size-8 ... data-[size=lg]:size-10 data-[size=sm]:size-6"

// AvatarBadge đọc size của avatar cha để tự scale
className={cn(
  "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary ...",
  "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
  "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
  "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
  className
)}
```

`AvatarBadge` **tự biết** phải to bao nhiêu dựa vào size của `Avatar` cha. Với avatar `sm`, nó còn
**ẩn luôn icon bên trong** (`[&>svg]:hidden`) vì quá nhỏ để nhìn thấy.

Nếu làm bằng React, việc này cần Context + `useContext` ở mỗi con. Ở đây là 0 byte JavaScript.

### Ứng dụng 3 — Container query

📄 `card.tsx`:

```tsx
function CardHeader({ className, ...props }) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}
```

Hai điều đáng chú ý:

**`@container/card-header`** — khai báo container query. Con của nó có thể phản ứng theo **chiều rộng
của header**, không phải viewport. Đây là cách làm responsive component thật sự (một card trong sidebar
hẹp khác một card full-width, dù viewport giống nhau).

**`has-data-[slot=card-action]:grid-cols-[1fr_auto]`** — grid layout tự đổi khi có `CardAction`:

```tsx
// Không có action → 1 cột
<CardHeader>
  <CardTitle>Items</CardTitle>
  <CardDescription>3 sản phẩm</CardDescription>
</CardHeader>

// Có action → 2 cột (title/desc bên trái, action bên phải)
<CardHeader>
  <CardTitle>Items</CardTitle>
  <CardDescription>3 sản phẩm</CardDescription>
  <CardAction><Button size="sm">Sửa</Button></CardAction>
</CardHeader>
```

Và `CardAction` tự định vị:

```tsx
className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
```

**Toàn bộ layout logic này là CSS.** Không có prop, không có state, không có JS.

### ⚠️ Trade-off thật của pattern `data-slot`

| Lợi ích | Cái giá |
| --- | --- |
| 0 byte JavaScript cho layout logic | **Class string dài và khó đọc** (xem `button.tsx`: một dòng 700 ký tự) |
| Không prop explosion — component tự thích ứng | Đòi hỏi hiểu sâu Tailwind arbitrary variants |
| Style từ ngoài mà không cần forward className cho từng phần | `data-slot` trở thành **API công khai** — đổi tên là breaking change |
| Hoạt động cả khi JS chưa tải | Khó debug: "vì sao padding này = 0?" phải đi tìm `:has()` ở component cha |
| Container query → responsive thật ở cấp component | `:has()` cần browser mới (Safari 15.4+, Chrome 105+) |

**Vì sao đánh đổi này đúng cho một design system:** class string dài là **chi phí một lần** khi viết
primitive. Còn lợi ích (không prop explosion, 0 JS) áp dụng ở **mọi** call site — và trong repo này
có hàng trăm.

Nhưng đừng áp pattern này vào component nghiệp vụ. `OrderCard` không cần `data-slot` — nó chỉ dùng
một lần với một cấu hình.

---

## 5. Headless: tách hành vi khỏi giao diện

### Vấn đề mà `@base-ui/react` giải quyết

Viết một `<Select>` **đúng** cần:

- Keyboard: Arrow up/down, Home/End, Enter, Escape, Tab, và **typeahead** (gõ "per" để nhảy tới
  "percentage")
- ARIA: `role="listbox"`, `role="option"`, `aria-selected`, `aria-expanded`, `aria-activedescendant`
- Focus management: focus vào popup khi mở, trả focus về trigger khi đóng
- Positioning: flip khi không đủ chỗ dưới, shift khi tràn ngang, theo scroll
- Click outside để đóng, nhưng không đóng khi click vào scrollbar
- Portal để không bị `overflow: hidden` của cha cắt
- Scroll lock, và scroll arrow khi list dài

**Đó là khoảng 2.000 dòng logic, và không có gì trong đó liên quan tới việc select của bạn trông thế
nào.**

Headless library cung cấp **toàn bộ hành vi đó, không có style nào**. Bạn cung cấp style.

### 📄 Cách repo bọc nó

`components/ui/select.tsx`:

```tsx
"use client"
import { Select as SelectPrimitive } from "@base-ui/react/select"

const Select = SelectPrimitive.Root          // ← re-export thẳng, không cần bọc

function SelectTrigger({ className, size = "default", children, ...props }: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn("flex w-fit items-center justify-between ... data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 *:data-[slot=select-value]:line-clamp-1 ...", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />}
      />
    </SelectPrimitive.Trigger>
  )
}
```

**Bốn kỹ thuật trong đoạn này:**

**(1) Kế thừa type từ primitive.** `SelectPrimitive.Trigger.Props & { size?: ... }` — bạn được toàn bộ
prop của primitive, cộng thêm prop riêng. Không phải khai báo lại gì.

**(2) `data-placeholder:text-muted-foreground`** — style theo **data attribute mà primitive tự set**.
Base-ui thêm `data-placeholder` khi chưa chọn gì. Bạn không cần biết state đó, chỉ cần style nó.

**(3) `*:data-[slot=select-value]:line-clamp-1`** — trigger style con `SelectValue` của nó (pattern
`data-slot` ở mục 4).

**(4) `render` prop để thay icon** — chính pattern polymorphic ở mục 3, nhưng dùng theo hướng ngược:
thay vì đổi element gốc của Badge, ta cung cấp element cho slot Icon.

📄 Và `SelectContent` cho thấy cách bọc một cấu trúc nhiều tầng thành một component:

```tsx
function SelectContent({ className, children, side = "bottom", sideOffset = 4, align = "center", alignOffset = 0, alignItemWithTrigger = true, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side} sideOffset={sideOffset} align={align}
        alignOffset={alignOffset} alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) ... data-[side=bottom]:slide-in-from-top-2 ... data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out ...", className)}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}
```

Người dùng viết `<SelectContent>` và nhận được Portal + Positioner + Popup + scroll arrows.
**Bốn tầng primitive được gói thành một tầng API.**

Chú ý các biến CSS mà primitive cung cấp:
- `max-h-(--available-height)` — chiều cao còn lại tới cạnh viewport
- `w-(--anchor-width)` — rộng bằng trigger
- `origin-(--transform-origin)` — điểm gốc cho animation, đúng theo hướng popup mở

Đây là hợp đồng giữa headless library và style của bạn: **nó tính toán, bạn dùng biến.**

### Tự viết một hook headless

Không phải lúc nào cũng cần một library. Nhiều hành vi tự viết được:

```tsx
// lib/hooks/use-disclosure.ts
'use client'
import { useCallback, useEffect, useId, useState } from 'react'

/**
 * Headless disclosure (drawer / accordion / popover).
 * Trả về props đã có sẵn ARIA — bạn chỉ việc spread và style.
 */
export function useDisclosure(options: { closeOnEscape?: boolean; lockScroll?: boolean } = {}) {
  const { closeOnEscape = true, lockScroll = false } = options
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])

  // Escape để đóng
  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape, close])

  // Lock scroll — cùng pattern lưu/khôi phục như seller-mobile-nav
  useEffect(() => {
    if (!open || !lockScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, lockScroll])

  return {
    open,
    setOpen,
    close,
    toggle,
    /** Spread lên nút mở/đóng */
    triggerProps: {
      'aria-expanded': open,
      'aria-controls': panelId,
      onClick: toggle,
    } as const,
    /** Spread lên panel */
    panelProps: {
      id: panelId,
      hidden: !open,
    } as const,
  }
}
```

📄 Áp vào `components/seller/seller-mobile-nav.tsx` — component hiện tại tự làm hết:

```tsx
export function SellerMobileNav() {
  const pathname = usePathname()
  const { open, close, triggerProps } = useDisclosure({ lockScroll: true, closeOnEscape: true })

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3">
        <button type="button" aria-label="Open menu" {...triggerProps} className="text-muted-foreground hover:text-foreground">
          <Menu className="size-5" />
        </button>
        <Link href="/seller" className="text-base font-semibold">
          SHOP <span className="font-normal text-muted-foreground">Seller Centre</span>
        </Link>
      </div>
      {/* ...phần drawer giữ nguyên, dùng `open` và `close`... */}
    </div>
  )
}
```

**Được thêm mà không viết code:** Escape để đóng (component hiện tại **chưa có** — một vấn đề
accessibility thật, xem file `23`), và `aria-controls` nối trigger với panel.

---

## 6. 🛠️ Bài tập: Headless Pagination cho repo

Đây là một trùng lặp thật trong repo. Hai file có block phân trang gần như y hệt:

📄 `components/store/product-grid.tsx`:

```tsx
function pageHref(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const s = params.toString()
  return s ? `/?${s}` : '/'
}

// ...
{pagination.totalPages > 1 ? (
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
    <div className="flex gap-2">
      <Link href={pageHref(q, pagination.page - 1)} aria-disabled={!pagination.hasPreviousPage}
        className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasPreviousPage && 'pointer-events-none opacity-50')}>
        Previous
      </Link>
      <Link href={pageHref(q, pagination.page + 1)} aria-disabled={!pagination.hasNextPage}
        className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasNextPage && 'pointer-events-none opacity-50')}>
        Next
      </Link>
    </div>
  </div>
) : null}
```

📄 `components/products/product-list.tsx` — cùng cấu trúc, chỉ khác cách build href:

```tsx
{pagination.totalPages > 1 ? (
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
    <div className="flex gap-2">
      <Link href={`/seller/products?tab=${tab}&page=${pagination.page - 1}`} aria-disabled={!pagination.hasPreviousPage}
        className={cn(buttonVariants({ variant: 'outline' }), !pagination.hasPreviousPage && 'pointer-events-none opacity-50')}>
        Previous
      </Link>
      {/* ... */}
```

⚠️ **Và bản `product-list` có một bug:** `TabLink` build href là `/seller/products?tab=${tab}` —
**mất param `page`**. Bấm sang tab khác từ trang 3 → về trang 1 (đúng), nhưng nếu bạn muốn giữ page
thì logic đang không nhất quán với nút Previous/Next (những nút này giữ `tab`).

### Thiết kế: tách "cái gì" khỏi "trông thế nào"

**Bước 1 — Hàm pure build href, đặt trong `lib/` để test được:**

```tsx
// lib/pagination/href.ts
/**
 * Build URL phân trang, giữ nguyên các param hiện có.
 * Bỏ `page` khi = 1 để URL sạch (`/` chứ không phải `/?page=1`).
 */
export function pageHref(
  basePath: string,
  currentParams: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(currentParams)) {
    if (v) params.set(k, v)
  }
  if (page > 1) params.set('page', String(page))
  else params.delete('page')
  const s = params.toString()
  return s ? `${basePath}?${s}` : basePath
}
```

```tsx
// lib/pagination/__tests__/href.test.ts
import { describe, it, expect } from 'vitest'
import { pageHref } from '@/lib/pagination/href'

describe('pageHref', () => {
  it('bỏ page khi bằng 1', () => {
    expect(pageHref('/', {}, 1)).toBe('/')
  })
  it('giữ các param khác', () => {
    expect(pageHref('/', { q: 'áo' }, 2)).toBe('/?q=%C3%A1o&page=2')
  })
  it('giữ tab khi đổi trang ở seller', () => {
    expect(pageHref('/seller/products', { tab: 'published' }, 3))
      .toBe('/seller/products?tab=published&page=3')
  })
  it('bỏ param rỗng', () => {
    expect(pageHref('/', { q: '', page: undefined }, 2)).toBe('/?page=2')
  })
})
```

**Bước 2 — Component Pagination dùng chung (Server Component, 0 byte JS):**

```tsx
// components/ui/pagination.tsx  — KHÔNG có 'use client'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { pageHref } from '@/lib/pagination/href'

export interface PaginationInfo {
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export function Pagination({
  info,
  basePath,
  params = {},
  className,
}: {
  info: PaginationInfo
  basePath: string
  params?: Record<string, string | undefined>
  className?: string
}) {
  if (info.totalPages <= 1) return null

  const linkClass = (enabled: boolean) =>
    cn(buttonVariants({ variant: 'outline', size: 'sm' }), !enabled && 'pointer-events-none opacity-50')

  return (
    <nav aria-label="Phân trang" className={cn('flex items-center justify-between', className)}>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Trang {info.page} / {info.totalPages}
      </span>
      <div className="flex gap-2">
        <Link
          href={pageHref(basePath, params, info.page - 1)}
          aria-disabled={!info.hasPreviousPage}
          tabIndex={info.hasPreviousPage ? undefined : -1}
          className={linkClass(info.hasPreviousPage)}
        >
          <ChevronLeft className="size-4" />
          Trước
        </Link>
        <Link
          href={pageHref(basePath, params, info.page + 1)}
          aria-disabled={!info.hasNextPage}
          tabIndex={info.hasNextPage ? undefined : -1}
          className={linkClass(info.hasNextPage)}
        >
          Sau
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </nav>
  )
}
```

**Ba cải thiện so với code hiện tại:**

- **`<nav aria-label>`** — screen reader nhận diện được đây là vùng phân trang
- **`tabIndex={-1}` khi disabled** — `pointer-events-none` chặn chuột nhưng **không** chặn keyboard.
  Không có `tabIndex={-1}`, người dùng Tab vào được một link "disabled" và Enter đưa họ tới trang 0.
  Đây là bug accessibility đang tồn tại trong repo.
- **`aria-live="polite"`** — thông báo "Trang 2 / 5" khi đổi trang

**Bước 3 — Call site gọn lại:**

```tsx
// components/store/product-grid.tsx
<Pagination info={pagination} basePath="/" params={{ q }} />
```

```tsx
// components/products/product-list.tsx
<Pagination info={pagination} basePath="/seller/products" params={{ tab }} />
```

**Bước 4 — Sửa luôn bug `TabLink` bằng cùng hàm:**

```tsx
function TabLink({ tab, current, children }: { tab: Tab; current: Tab; children: React.ReactNode }) {
  const active = tab === current
  return (
    <Link
      // Đổi tab → về trang 1 một cách TƯỜNG MINH, không phải do quên param
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

Thêm `aria-current="page"` — trước đó tab active chỉ được phân biệt bằng **màu**, screen reader không
biết tab nào đang chọn.

**Kết quả:** xoá ~40 dòng trùng lặp, thêm test cho logic href, sửa 3 vấn đề a11y, và sửa 1 bug.

---

## 7. When NOT to abstract

Đây là mục quan trọng nhất của chương, vì lạm dụng composition tệ hơn không dùng.

### 📄 Ví dụ repo làm ĐÚNG khi không abstract

`components/products/attribute-fields.tsx`:

```tsx
function Field({ name, label, required, defaultValue }: { name: string; label: string; required?: boolean; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? '' : ' (optional)'}</Label>
      <Input id={name} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}

export function AttributeFields({ type, defaults }: { type: ProductType; defaults?: Record<string, unknown> }) {
  const dv = (k: string) => (defaults?.[k] != null ? String(defaults[k]) : undefined)
  if (type === 'CLOTHING') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="brand" label="Brand" required defaultValue={dv('brand')} />
        <Field name="color" label="Color" required defaultValue={dv('color')} />
        <Field name="size" label="Size" required defaultValue={dv('size')} />
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

Đây là **hai `if` và JSX viết tay**. Không schema-driven, không config object, không render function.
Và nó là **lựa chọn đúng**, vì:

- Chỉ có 2 loại sản phẩm
- Field của mỗi loại rất khác nhau
- Đọc là hiểu ngay: "CLOTHING có brand/color/size, ELECTRONICS có manufacturer/model"
- Thêm loại thứ 3 = thêm một `if`, 8 dòng

Nếu abstract nó:

```tsx
// ❌ "Linh hoạt" hơn, nhưng khó đọc hơn và không đọc được luật nghiệp vụ
const FIELD_CONFIG: Record<ProductType, FieldSpec[]> = { ... }
export function AttributeFields({ type, defaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(FIELD_CONFIG[type] ?? []).map(spec => <Field key={spec.name} {...spec} defaultValue={dv(spec.name)} />)}
    </div>
  )
}
```

Bạn được gì? Ít hơn 10 dòng. Bạn mất gì? Phải nhảy sang file khác để biết CLOTHING có field nào, và
lớp `grid sm:grid-cols-2` giờ cố định cho mọi loại.

⚖️ **Nhớ lại file `11`:** tôi đã đề xuất `ATTRIBUTE_SPECS` để loại bỏ trùng lặp giữa Zod schema và JSX.
Đó vẫn là một đề xuất hợp lý — nhưng **lý do** là để có **một nguồn sự thật cho luật validate**,
không phải để "code ngắn hơn". Nếu chỉ có JSX (không có schema song song), thì viết tay là đúng.

**Đây là điểm phân biệt hai loại trùng lặp:**

| Loại | Ví dụ | Nên abstract? |
| --- | --- | --- |
| **Trùng lặp cấu trúc** (cùng shape, khác dữ liệu) | 2 block pagination | ✅ Có — abstract được sạch |
| **Trùng lặp tri thức** (cùng luật ở 2 nơi) | Luật attribute ở Zod + JSX | ✅ Có — nhưng vì tính đúng đắn |
| **Trùng lặp ngẫu nhiên** (trông giống, ý nghĩa khác) | 2 `if` trong `AttributeFields` | ❌ Không |

### Ba dấu hiệu abstraction sai

**(1) Bạn phải thêm prop để hỗ trợ ca dùng thứ hai.**
Nếu `<Pagination>` cần thêm `showPageNumbers`, rồi `maxVisiblePages`, rồi `variant="compact"` — bạn
đang tiến tới prop explosion. Lúc đó tách thành hai component.

**(2) Abstraction có prop "escape hatch" cho mọi thứ.**
`renderItem`, `renderHeader`, `renderFooter`, `itemClassName`, `containerProps`... Nếu người dùng phải
cung cấp mọi phần, họ nên tự viết component.

**(3) Bạn abstract từ MỘT ca dùng.**
Quy tắc "rule of three": chờ đến ca thứ ba mới abstract. Với hai ca, bạn không biết đâu là phần biến
đổi thật. Pagination trong repo có **đúng hai** ca — nên nó ở ranh giới, và lý do abstract nó là
**để sửa bug a11y một lần thay vì hai lần**, không chỉ để DRY.

---

## 8. Trade-offs tổng hợp

| Pattern | Lợi ích | Cái giá |
| --- | --- | --- |
| **Compound** | Mở rộng vô hạn không đổi API; người dùng kiểm soát cấu trúc | Dài dòng hơn; cần Context (hoặc library); dùng sai thứ tự thì vỡ ngầm |
| **`render` prop** | Đổi element mà giữ style + hành vi; type tự nhiên | Cú pháp lạ; cần `mergeProps` để đúng |
| **Export variants** (`buttonVariants`) | Đơn giản, không magic | Chỉ style, không hành vi; phải tự nhớ `cn()` |
| **`data-slot` + `:has()`** | 0 JS cho layout logic; không prop explosion | Class string rất dài; `data-slot` thành public API; browser mới |
| **`group/name`** | Cha điều khiển con không cần Context | Chỉ style được, không logic được |
| **Headless library** | A11y + keyboard + positioning đúng, miễn phí | Thêm dependency; phải học API của nó; bundle size |
| **Custom hook headless** | Không dependency; đúng nhu cầu | Bạn tự chịu trách nhiệm a11y — dễ làm thiếu |

---

## 9. Best Practices

1. **Compound khi các phần có quan hệ trạng thái hoặc cấu trúc thay đổi theo ca dùng.**
   Một component + `children` là đủ cho phần còn lại.

2. **Export cả component và variants.** `export { Button, buttonVariants }` cho bạn đường thoát khi
   cần style một element khác — repo làm đúng.

3. **Dùng `render` prop + `mergeProps` khi cần polymorphic thật.** Đừng dùng `{...props}` để merge
   `className`/`style`/handler — nó ghi đè thay vì gộp.

4. **`data-slot` là API công khai.** Đặt tên cẩn thận, đừng đổi tuỳ ý. Ghi lại danh sách slot.

5. **Đặt tên cho group (`group/card`)** — group không tên sẽ vỡ khi lồng nhau.

6. **Với logic có a11y phức tạp (select, dialog, combobox), dùng headless library.** Tự viết gần như
   chắc chắn sẽ thiếu keyboard nav hoặc ARIA. Repo dùng `@base-ui/react` — đó là quyết định đúng.

7. **Tách hàm pure ra `lib/` để test được.** `pageHref` là logic; `<Pagination>` là trình bày.

8. **Chờ ca thứ ba trước khi abstract** — trừ khi việc abstract sửa được một bug ở nhiều chỗ.

9. **`pointer-events-none` phải đi kèm `tabIndex={-1}`.** Chặn chuột không chặn keyboard.

10. **Đừng abstract `AttributeFields`-style code chỉ để ngắn hơn.** Hai `if` đọc được là tài sản, không
    phải nợ.

---

## Tự kiểm tra

1. Kể ba yêu cầu mà API `options` không xử lý được nhưng compound component xử lý được dễ dàng.
2. `mergeProps` xử lý bốn loại prop khác `{...spread}` như thế nào? Vì sao mỗi loại cần chiến lược riêng?
3. `[a]:hover:bg-primary/80` trong `badgeVariants` giải quyết vấn đề thiết kế gì?
4. `has-data-[slot=card-footer]:pb-0` làm gì? Nếu làm bằng React thì cần những gì?
5. Vì sao `group` phải có tên (`group/card`)?
6. `max-h-(--available-height)` đến từ đâu? Nó thể hiện hợp đồng gì giữa headless library và style?
7. Vì sao `pointer-events-none` một mình là một bug accessibility?
8. Ba dấu hiệu cho biết một abstraction là sai?
9. Phân biệt "trùng lặp cấu trúc", "trùng lặp tri thức", và "trùng lặp ngẫu nhiên". Cho ví dụ từ repo.
10. `AttributeFields` viết tay hai `if` — vì sao đó là lựa chọn đúng, dù file `11` lại đề xuất abstract nó?

➡️ Tiếp theo: `18-custom-hooks-va-state-machines.md`
