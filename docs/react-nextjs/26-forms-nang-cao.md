# 26. Forms nâng cao

> **Mục tiêu:** giải quyết bốn bài toán form mà Server Actions **một mình không làm được**:
> field array (biến thể sản phẩm), upload có progress, autosave, và wizard sống qua refresh.
> Kèm khung quyết định: khi nào cần react-hook-form.

---

## 1. Overview

### Server Actions giải quyết được 80% form — và bạn nên dừng ở đó

📄 Repo có 13 form, và **12 trong số đó** được Server Actions xử lý hoàn hảo:

| Form | Vì sao Server Action đủ |
| --- | --- |
| `login`, `signup`, `verify-otp` | Vài field, submit một lần, không validate live |
| `add-to-cart`, `cancel-order` | Một hidden input + một nút |
| `edit-product-form` | Uncontrolled input, submit một lần |
| `create-discount-form` | Có conditional field nhưng vẫn submit một lần |
| `discount-code-lookup` | Một input, kết quả render inline |

**Đừng thêm react-hook-form vào những form này.** Bạn sẽ thêm ~15KB bundle, mất progressive
enhancement (file `11`), và không được gì.

### Bốn giới hạn thật của Server Actions

| Giới hạn | Vì sao | Giải pháp |
| --- | --- | --- |
| **Không có upload progress** | `<form action>` POST không expose progress event | Route handler + XHR, hoặc presigned URL |
| **Field array phức tạp** | `FormData` phẳng; thêm/xoá dòng cần state client | `useState` + naming convention, hoặc RHF |
| **Validate live theo từng ký tự** | Action chỉ chạy khi submit | Chia sẻ Zod schema, validate ở client |
| **State sống qua refresh** | State client mất khi F5 | Lưu vào URL, localStorage, hoặc server draft |

Chương này giải quyết cả bốn.

---

## 2. Khung quyết định: Server Action vs react-hook-form

```
Form của bạn có cần một trong những thứ sau?
├─ Validate hiển thị NGAY khi gõ (không chờ submit)
├─ Field array thêm/xoá động (>3 dòng, có validate từng dòng)
├─ Phụ thuộc phức tạp giữa field (A đổi → tính lại B, C, D)
├─ Upload có progress bar
├─ Autosave / draft
│
├─ KHÔNG → ✅ Server Action + uncontrolled input. DỪNG LẠI.
│
└─ CÓ → Cân nhắc:
   ├─ Chỉ 1-2 nhu cầu, form nhỏ → useState/useReducer + Server Action
   └─ Nhiều nhu cầu, form lớn (>10 field) → react-hook-form + Server Action
```

**Điểm quan trọng:** react-hook-form và Server Action **không loại trừ nhau**. Pattern tốt nhất là
dùng RHF cho UX ở client, rồi gọi Server Action để submit:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productDetailsSchema, type ProductDetailsInput } from '@/lib/validations/product'

export function ProductForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  const form = useForm<ProductDetailsInput>({
    resolver: zodResolver(productDetailsSchema),      // ⭐ CÙNG schema server dùng
    mode: 'onBlur',
  })

  return (
    <form
      // RHF validate trước; chỉ submit khi hợp lệ
      onSubmit={form.handleSubmit(async (data) => {
        const fd = new FormData()
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) fd.append(k, String(v))
        }
        await action(fd)                                // ⭐ Server Action vẫn validate lại
      })}
    >
      {/* ... */}
    </form>
  )
}
```

⚠️ **Server Action PHẢI validate lại**, bất kể client đã validate. Client validation là **UX**;
server validation là **bảo mật** (file `11`, `24`). Kẻ tấn công gọi action trực tiếp, bỏ qua RHF hoàn toàn.

**Lợi ích của việc chia sẻ Zod schema:** một nguồn sự thật cho luật validate.
📄 `lib/validations/product.ts` đã sẵn sàng cho việc này — nó là schema pure, dùng được ở cả hai phía
(file `08`: shared module).

---

## 3. ⭐ Field Array — biến thể sản phẩm

### Bài toán thật của repo

📄 Hiện tại `create-product-form.tsx` chỉ tạo **một** sản phẩm với một giá, một số lượng:

```tsx
<Input id="product_price" name="product_price" type="number" step="0.01" min="0" required />
<Input id="product_quantity" name="product_quantity" type="number" min="0" required />
```

Nhưng một cửa hàng quần áo thật cần: *Áo thun trắng size S (50 cái, 199k), size M (30 cái, 199k),
size L (20 cái, 219k)*.

Đây là **field array** — và `FormData` phẳng không mô hình hoá được trực tiếp.

### Giải pháp: naming convention + state cho danh sách

**Bước 1 — Component quản lý danh sách biến thể:**

```tsx
// components/products/variant-fields.tsx
'use client'
import { useState, useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface VariantDraft {
  /** ID cục bộ chỉ để làm React key — KHÔNG gửi lên server (file 15) */
  localId: string
  size: string
  color: string
  price: string
  quantity: string
}

function emptyVariant(seq: number): VariantDraft {
  // Dùng counter, KHÔNG dùng Math.random()/Date.now() — chúng gây hydration mismatch (file 13)
  return { localId: `v${seq}`, size: '', color: '', price: '', quantity: '' }
}

export function VariantFields({ defaults }: { defaults?: VariantDraft[] }) {
  const [variants, setVariants] = useState<VariantDraft[]>(
    () => defaults ?? [emptyVariant(0)],
  )
  const [seq, setSeq] = useState(variants.length)
  const groupId = useId()

  const add = () => {
    setVariants((v) => [...v, emptyVariant(seq)])
    setSeq((s) => s + 1)
  }

  const remove = (localId: string) =>
    setVariants((v) => (v.length === 1 ? v : v.filter((x) => x.localId !== localId)))

  const patch = (localId: string, field: keyof Omit<VariantDraft, 'localId'>, value: string) =>
    setVariants((v) => v.map((x) => (x.localId === localId ? { ...x, [field]: value } : x)))

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Biến thể sản phẩm</legend>

      {/* ⭐ Gửi cả mảng dưới dạng MỘT field JSON — đơn giản hơn naming convention */}
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          variants.map(({ localId, ...rest }) => rest),   // bỏ localId
        )}
      />

      <ul className="space-y-3">
        {variants.map((v, i) => (
          <li key={v.localId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor={`${groupId}-${v.localId}-size`} className="text-xs">Size</Label>
              <Input
                id={`${groupId}-${v.localId}-size`}
                value={v.size}
                onChange={(e) => patch(v.localId, 'size', e.target.value)}
                placeholder="M"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${groupId}-${v.localId}-color`} className="text-xs">Màu</Label>
              <Input
                id={`${groupId}-${v.localId}-color`}
                value={v.color}
                onChange={(e) => patch(v.localId, 'color', e.target.value)}
                placeholder="Trắng"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${groupId}-${v.localId}-price`} className="text-xs">Giá</Label>
              <Input
                id={`${groupId}-${v.localId}-price`}
                type="number"
                min="0"
                value={v.price}
                onChange={(e) => patch(v.localId, 'price', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${groupId}-${v.localId}-qty`} className="text-xs">Số lượng</Label>
              <Input
                id={`${groupId}-${v.localId}-qty`}
                type="number"
                min="0"
                value={v.quantity}
                onChange={(e) => patch(v.localId, 'quantity', e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(v.localId)}
                disabled={variants.length === 1}
                aria-label={`Xoá biến thể ${i + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" />
        Thêm biến thể
      </Button>
    </fieldset>
  )
}
```

**Bốn quyết định thiết kế đáng chú ý:**

**(1) `localId` từ counter, không phải `Math.random()`/`Date.now()`.** Nhớ file `13`: những hàm đó gây
hydration mismatch. Counter là xác định.

**(2) Gửi cả mảng dưới dạng một JSON string** thay vì naming convention (`variants[0][size]`).
📄 Repo đã dùng pattern này ở `create-product-form.tsx`:

```tsx
<input type="hidden" name="images" value={JSON.stringify(uploadResult.images)} />
```

và `checkout-wizard.tsx`:

```tsx
<input type="hidden" name="shop_order_ids" value={JSON.stringify(shopOrderIds)} />
```

⚖️ **Trade-off:** JSON mất progressive enhancement cho phần thêm/xoá dòng (cần JS). Nhưng field array
**vốn đã cần JS** — không có JS thì không có nút "Thêm". Nên đây không phải mất mát thật.

**(3) `disabled={variants.length === 1}`** — luôn còn ít nhất một biến thể. Luật này cũng phải có ở
server (đừng tin client).

**(4) `useId` cho prefix, `localId` cho từng dòng** — nhớ file `05` và `23`: mỗi input cần `id` duy nhất
để `<Label htmlFor>` hoạt động.

**Bước 2 — Zod schema cho array:**

```tsx
// lib/validations/product.ts
export const variantSchema = z.object({
  size: z.string().trim().min(1, 'Nhập size'),
  color: z.string().trim().min(1, 'Nhập màu'),
  price: z.coerce.number().positive('Giá phải lớn hơn 0'),
  quantity: z.coerce.number().int().min(0, 'Số lượng không được âm'),
})

export const variantsSchema = z
  .array(variantSchema)
  .min(1, 'Cần ít nhất một biến thể')
  .max(50, 'Tối đa 50 biến thể')
  // Chặn trùng lặp size+color — luật nghiệp vụ, không thể biểu diễn ở từng field
  .refine(
    (list) => new Set(list.map((v) => `${v.size.toLowerCase()}|${v.color.toLowerCase()}`)).size === list.length,
    { message: 'Có biến thể trùng size và màu' },
  )

export type VariantInput = z.infer<typeof variantSchema>
```

`.refine` cho luật cross-item (nhớ file `11`: cùng kỹ thuật `create-discount-form` dùng cho
ngày bắt đầu/kết thúc).

**Bước 3 — Parse trong Server Action:**

```tsx
// actions/product.actions.ts
import { variantsSchema } from '@/lib/validations/product'

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productDetailsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }

  // ⭐ Parse JSON rồi validate — hai bước, mỗi bước có lỗi riêng
  let rawVariants: unknown
  try {
    rawVariants = JSON.parse(String(formData.get('variants') ?? '[]'))
  } catch {
    return { ok: false, message: 'Dữ liệu biến thể không đọc được. Vui lòng thử lại.' }
  }

  const variants = variantsSchema.safeParse(rawVariants)
  if (!variants.success) {
    return { ok: false, message: variants.error.issues[0].message }
  }

  // ...phần còn lại
  await apiFetch('/product', { auth: true, body: { ...details, variants: variants.data } })
}
```

**Chú ý hai bước riêng biệt:** `JSON.parse` có thể throw (dữ liệu bị cắt, bị sửa); `safeParse` xử lý
dữ liệu sai hình dạng. Gộp chúng lại làm bạn không phân biệt được hai loại lỗi.

📄 Repo đã làm đúng pattern này ở `order.actions.ts`:

```tsx
let shopOrderIds: ShopOrderItem[]
try {
  shopOrderIds = JSON.parse(String(formData.get('shop_order_ids') ?? '[]'))
} catch {
  return { ok: false, message: 'Your cart could not be read. Please try again.' }
}
if (!Array.isArray(shopOrderIds) || shopOrderIds.length === 0)
  return { ok: false, message: 'Your cart is empty' }
```

⚠️ Nhưng nó chỉ kiểm `Array.isArray` — **không validate nội dung**. Một `shop_order_ids` như
`[{"shopId":"x","item_products":[{"productId":"y","quantity":-999,"price":0}]}]` đi qua.
Đây là chỗ nên thêm Zod schema (nhớ file `24`: mọi input từ client là thù địch).

---

## 4. ⭐ Upload có progress — giới hạn thật của Server Actions

### Vì sao Server Action không làm được

`<form action={serverAction}>` submit qua `fetch` nội bộ của React. Bạn **không có** handle tới
`XMLHttpRequest.upload.onprogress`, và `fetch` (streaming request body) chưa được hỗ trợ đủ rộng để
đo progress đáng tin cậy.

📄 Hệ quả trong repo — `components/products/image-uploader.tsx`:

```tsx
const [state, formAction] = useActionState(prepareImagesAction, initial)
// ...
<SubmitButton>Upload images</SubmitButton>
```

Người dùng chọn 5 ảnh, mỗi ảnh 4MB. Bấm Upload. Nút hiện "Processing…" **trong 30 giây** mà không có
chỉ báo nào. Họ không biết còn 10% hay 90%, và rất có thể bấm lại hoặc đóng tab.

### Giải pháp A — Route handler + XHR (đơn giản, giữ ảnh qua BFF)

**Bước 1 — Route handler nhận upload:**

```tsx
// app/api/seller/products/images/route.ts
import { apiFetch } from '@/lib/api/server-client'
import { requireRole, AuthError } from '@/lib/auth/require'
import { ApiError } from '@/lib/api/http'
import type { PreparedImages } from '@/types/product'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_FILES = 8
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export async function POST(request: Request) {
  try {
    await requireRole('shop')
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: 403 })
    throw e
  }

  const incoming = await request.formData()
  const files = incoming.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)

  // Validate — giống hệt Server Action (file 11)
  if (files.length === 0) return Response.json({ error: 'Chọn ít nhất một ảnh' }, { status: 400 })
  if (files.length > MAX_FILES) return Response.json({ error: `Tối đa ${MAX_FILES} ảnh` }, { status: 400 })
  for (const f of files) {
    if (!ALLOWED.has(f.type)) return Response.json({ error: `${f.name}: chỉ nhận JPEG/PNG/WebP/AVIF` }, { status: 400 })
    if (f.size > MAX_FILE_BYTES) return Response.json({ error: `${f.name}: vượt quá 5MB` }, { status: 400 })
  }

  const upload = new FormData()
  for (const f of files) upload.append('images', f)

  try {
    const data = await apiFetch<PreparedImages>('/product/upload/prepare', { multipart: upload, auth: true })
    return Response.json(data)
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[upload] unexpected', e)
    return Response.json({ error: 'Tải ảnh thất bại' }, { status: 500 })
  }
}
```

**Bước 2 — Hook upload với progress:**

```tsx
// lib/hooks/use-upload.ts
'use client'
import { useCallback, useRef, useState } from 'react'

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Upload file với progress. Dùng XMLHttpRequest vì đó là API DUY NHẤT
 * expose upload progress một cách đáng tin cậy trên mọi browser.
 */
export function useUpload<T>(url: string) {
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const upload = useCallback(
    (formData: FormData) =>
      new Promise<T | null>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        setState({ status: 'uploading', progress: 0 })

        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return
          setState({ status: 'uploading', progress: Math.round((e.loaded / e.total) * 100) })
        })

        xhr.addEventListener('load', () => {
          let body: unknown = null
          try { body = JSON.parse(xhr.responseText) } catch { /* để null */ }

          if (xhr.status >= 200 && xhr.status < 300) {
            setState({ status: 'success' })
            resolve(body as T)
          } else {
            const message =
              (body && typeof body === 'object' && 'error' in body && String((body as { error: unknown }).error)) ||
              `Tải lên thất bại (${xhr.status})`
            setState({ status: 'error', message })
            resolve(null)
          }
        })

        xhr.addEventListener('error', () => {
          setState({ status: 'error', message: 'Lỗi mạng khi tải lên' })
          resolve(null)
        })

        xhr.addEventListener('abort', () => {
          setState({ status: 'idle' })
          resolve(null)
        })

        xhr.open('POST', url)
        xhr.send(formData)
      }),
    [url],
  )

  const cancel = useCallback(() => xhrRef.current?.abort(), [])

  return { state, upload, cancel }
}
```

**Bước 3 — Component:**

```tsx
// components/products/image-uploader.tsx (viết lại)
'use client'
import { useUpload } from '@/lib/hooks/use-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PreparedImages } from '@/types/product'

export function ImageUploader({ onPrepared }: { onPrepared: (data: PreparedImages) => void }) {
  const { state, upload, cancel } = useUpload<PreparedImages>('/api/seller/products/images')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = await upload(new FormData(e.currentTarget))
    if (data) onPrepared(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="images">Ảnh sản phẩm</Label>
        <Input id="images" name="images" type="file" accept="image/*" multiple required />
        <p className="text-xs text-muted-foreground">Tối đa 8 ảnh, mỗi ảnh dưới 5MB.</p>
      </div>

      {state.status === 'uploading' ? (
        <div className="space-y-2">
          {/* progressbar có ARIA đầy đủ (file 23) */}
          <div
            role="progressbar"
            aria-valuenow={state.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tiến trình tải ảnh"
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span aria-live="polite">Đang tải… {state.progress}%</span>
            <Button type="button" variant="ghost" size="xs" onClick={cancel}>Huỷ</Button>
          </div>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <Button type="submit" disabled={state.status === 'uploading'}>
        {state.status === 'uploading' ? 'Đang tải…' : 'Tải ảnh lên'}
      </Button>
    </form>
  )
}
```

**Bốn cải thiện so với bản gốc:**

| | Bản gốc | Bản mới |
| --- | --- | --- |
| Progress | ❌ Không | ✅ % + progressbar |
| Huỷ giữa chừng | ❌ Không | ✅ `xhr.abort()` |
| Validate file | ❌ Không | ✅ MIME + size + count |
| Đẩy state lên cha | Qua `useEffect` (anti-pattern, file `03`) | Trực tiếp từ `await upload()` |

**Điểm cuối đáng chú ý:** vấn đề "đẩy dữ liệu lên cha bằng effect" ở file `03` **tự biến mất**.
Vì `upload()` trả Promise, bạn gọi `onPrepared(data)` ngay trong handler — không cần effect, không có
bản sao state.

⚖️ **Trade-off của giải pháp A:** ảnh đi qua BFF → tốn băng thông và memory của Next.js server. Với
ảnh nhỏ và traffic thấp thì ổn. Với 5 ảnh × 5MB × nhiều người dùng đồng thời → serverless function
có thể hết memory.

### Giải pháp B — Presigned URL (upload trực tiếp lên storage)

Với ảnh lớn hoặc traffic cao, đây là kiến trúc đúng:

```
1. Client → BFF:      "tôi muốn upload 3 ảnh, đây là type và size"
2. BFF → Storage:     xin presigned URL (có hạn, giới hạn size/type)
3. BFF → Client:      trả về 3 URL
4. Client → Storage:  upload TRỰC TIẾP (không qua BFF) — có progress
5. Client → BFF:      "xong rồi, đây là 3 public_id"
6. BFF → Backend:     lưu metadata
```

```tsx
// app/api/seller/uploads/sign/route.ts
import { z } from 'zod'
import { requireRole, AuthError } from '@/lib/auth/require'
import { apiFetch } from '@/lib/api/server-client'

export const runtime = 'nodejs'

const bodySchema = z.object({
  files: z
    .array(
      z.object({
        // ⭐ Validate Ở BƯỚC XIN URL — presigned URL sẽ enforce nó ở storage
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
        size: z.number().int().positive().max(5 * 1024 * 1024),
      }),
    )
    .min(1)
    .max(8),
})

export async function POST(request: Request) {
  try {
    await requireRole('shop')
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: 403 })
    throw e
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 })
  }

  // Backend sinh presigned URL (nó giữ credential của storage)
  const signed = await apiFetch<{ uploads: { uploadUrl: string; publicId: string }[] }>(
    '/product/upload/sign',
    { auth: true, body: parsed.data },
  )
  return Response.json(signed)
}
```

**Vì sao đây là kiến trúc tốt hơn:**

| | Qua BFF (giải pháp A) | Presigned URL (giải pháp B) |
| --- | --- | --- |
| Băng thông BFF | 100% dung lượng ảnh | ~0 (chỉ metadata) |
| Memory BFF | Giữ cả file trong RAM | Không giữ gì |
| Giới hạn size | Bị giới hạn body của serverless (thường 4.5MB) | Chỉ giới hạn của storage |
| Progress | ✅ | ✅ |
| Độ phức tạp | Thấp | Cao hơn (3 round-trip, cần backend hỗ trợ) |
| Bảo mật | BFF validate mọi thứ | Presigned URL phải enforce type + size |

⚠️ **Điểm bảo mật quan trọng của presigned URL:** URL phải được sinh với **ràng buộc** content-type và
max-size, và **thời hạn ngắn** (5-15 phút). Nếu không, kẻ tấn công lấy URL rồi upload một file 10GB
hoặc một file `.html` chứa script (stored XSS qua storage domain).

**Ngưỡng chọn:** ảnh < 5MB và traffic thấp → giải pháp A. Ngược lại → B.

---

## 5. Autosave / Draft

📄 `create-product-form.tsx` có một vấn đề UX thật: người dùng điền 10 field, upload 5 ảnh, rồi
**tab bị đóng** → mất hết.

### Cấp 1 — localStorage (đơn giản, per-device)

```tsx
// lib/hooks/use-form-draft.ts
'use client'
import { useEffect, useRef, useCallback } from 'react'

/**
 * Tự lưu giá trị form vào localStorage, và khôi phục khi mount.
 *
 * Dùng `defaultValue` (uncontrolled) nên KHÔNG re-render mỗi ký tự —
 * đọc trực tiếp từ DOM qua FormData (file 02).
 */
export function useFormDraft(key: string, options: { debounceMs?: number } = {}) {
  const { debounceMs = 800 } = options
  const formRef = useRef<HTMLFormElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Khôi phục khi mount
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    let saved: Record<string, string> | null = null
    try {
      const raw = localStorage.getItem(key)
      saved = raw ? (JSON.parse(raw) as Record<string, string>) : null
    } catch {
      // localStorage bị chặn (private mode) hoặc JSON hỏng — bỏ qua
    }
    if (!saved) return
    for (const [name, value] of Object.entries(saved)) {
      const el = form.elements.namedItem(name)
      // KHÔNG khôi phục input file (không thể) và hidden (do server điền)
      if (el instanceof HTMLInputElement && el.type !== 'file' && el.type !== 'hidden') el.value = value
      else if (el instanceof HTMLTextAreaElement) el.value = value
    }
  }, [key])

  // Lưu khi thay đổi (debounce)
  const onChange = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const form = formRef.current
      if (!form) return
      const data: Record<string, string> = {}
      for (const [k, v] of new FormData(form).entries()) {
        if (typeof v === 'string' && v !== '') data[k] = v      // bỏ File
      }
      try {
        localStorage.setItem(key, JSON.stringify(data))
      } catch {
        // Quota exceeded — bỏ qua, autosave là tính năng "nice to have"
      }
    }, debounceMs)
  }, [key, debounceMs])

  const clear = useCallback(() => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }, [key])

  // Dọn timer khi unmount
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { formRef, onChange, clear }
}
```

```tsx
// Dùng trong create-product-form.tsx
const { formRef, onChange, clear } = useFormDraft('draft:new-product')
const [state, formAction] = useActionState(createProductAction, initialActionState)

useActionToast(state, { onSuccess: clear })       // xoá draft khi tạo thành công

return (
  <form ref={formRef} action={formAction} onChange={onChange}>
    {/* ... */}
  </form>
)
```

**Ba chi tiết quan trọng:**

**(1) `onChange` trên `<form>`, không trên từng input.** Event bubble lên — một handler cho cả form.

**(2) Bỏ input `file` và `hidden`.** File không serialize được vào localStorage; hidden do server điền
(`productId`, `thumbUrl`) nên khôi phục chúng sẽ tạo dữ liệu không nhất quán.

**(3) Mọi truy cập `localStorage` bọc `try/catch`.** Nó throw trong private mode Safari và khi hết
quota. Autosave lỗi **không được** làm vỡ form.

⚠️ **Giới hạn:** localStorage là **per-device**. Người dùng đổi máy là mất.

### Cấp 2 — Server draft (đồng bộ mọi thiết bị)

```tsx
// actions/product.actions.ts
export async function saveProductDraftAction(formData: FormData): Promise<void> {
  const draft = Object.fromEntries(
    Array.from(formData.entries()).filter(([, v]) => typeof v === 'string'),
  )
  try {
    await apiFetch('/product/draft', { method: 'PUT', auth: true, body: draft })
  } catch {
    // Autosave thất bại im lặng — KHÔNG làm người dùng lo lắng vì một tính năng phụ
  }
}
```

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { saveProductDraftAction } from '@/actions/product.actions'

export function AutoSaveDraft({ formRef }: { formRef: React.RefObject<HTMLFormElement | null> }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const form = formRef.current
    if (!form) return

    const onInput = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void saveProductDraftAction(new FormData(form))
      }, 2000)                                    // debounce dài hơn — mỗi lần là một request
    }

    form.addEventListener('input', onInput)
    return () => {
      form.removeEventListener('input', onInput)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [formRef])

  return null                                     // effect component (file 03)
}
```

⚖️ **Trade-off:** debounce 2 giây với người gõ liên tục = một request mỗi 2 giây. Với 100 seller đang
soạn sản phẩm = 50 req/s chỉ cho autosave. **Cần rate limit ở backend** (file `24`), và cân nhắc
debounce dài hơn (5-10 giây) hoặc chỉ save khi blur khỏi field.

---

## 6. Wizard sống qua refresh

📄 `checkout-wizard.tsx` mất hết state khi F5 — người dùng phải điền lại địa chỉ.

### Giải pháp: step trong URL, dữ liệu trong sessionStorage

Nhớ file `02`: **state có ý nghĩa với người dùng thì thuộc về URL.**

```tsx
// components/store/checkout-wizard.tsx (kết hợp với FSM ở file 18)
'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const STEP_ORDER = ['review', 'shipping', 'confirm'] as const
type Step = (typeof STEP_ORDER)[number]

function parseStep(raw: string | null): Step {
  return STEP_ORDER.includes(raw as Step) ? (raw as Step) : 'review'
}

export function CheckoutWizard({ shopOrderIds, review, lines }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const step = parseStep(params.get('step'))

  const goTo = (next: Step) => {
    const sp = new URLSearchParams(params)
    sp.set('step', next)
    // push (không replace) → nút Back của browser lùi bước, đúng như người dùng mong đợi
    router.push(`/checkout?${sp}`)
  }
  // ...
}
```

**Ba lợi ích ngay lập tức** (giống bảng so sánh ở file `02`):

- ✅ F5 giữ nguyên bước
- ✅ Nút Back lùi một bước, không rời trang checkout
- ✅ Share link được (dù ít dùng ở checkout)

⚠️ **Bắt buộc bọc `<Suspense>`** vì dùng `useSearchParams` (file `06`):

```tsx
// app/(store)/checkout/page.tsx
<Suspense fallback={<CheckoutSkeleton />}>
  <CheckoutWizard shopOrderIds={shopOrderIds} review={review.checkout_order} lines={lines} />
</Suspense>
```

**Còn dữ liệu địa chỉ?** Nó **không** nên vào URL (dữ liệu cá nhân trong URL → lọt vào log server,
history browser, referrer header). Dùng `sessionStorage`:

```tsx
// lib/hooks/use-session-state.ts
'use client'
import { useState, useEffect, useCallback } from 'react'

/**
 * State đồng bộ với sessionStorage — sống qua refresh, mất khi đóng tab.
 * Phù hợp cho dữ liệu tạm không nên vào URL (địa chỉ, thông tin thanh toán).
 */
export function useSessionState<T>(key: string, initial: T) {
  // Lần render đầu LUÔN trả `initial` → khớp SSR, không hydration mismatch (file 13)
  const [value, setValue] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  // Đọc sessionStorage SAU khi mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) setValue(JSON.parse(raw) as T)
    } catch {
      // private mode hoặc JSON hỏng
    }
    setHydrated(true)
  }, [key])

  // Ghi khi đổi — chỉ sau khi đã hydrate, để không ghi đè giá trị đã lưu bằng `initial`
  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // quota
    }
  }, [key, value, hydrated])

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(key) } catch { /* ignore */ }
  }, [key])

  return [value, setValue, { hydrated, clear }] as const
}
```

⚠️ **Chi tiết `hydrated` là quan trọng nhất ở đây.** Không có nó:

```
1. Render đầu: value = initial (rỗng)
2. Effect ghi: sessionStorage = rỗng          ← XOÁ dữ liệu đã lưu!
3. Effect đọc: đọc được rỗng
```

Thứ tự effect làm bạn mất dữ liệu. Cờ `hydrated` bảo đảm chỉ **ghi sau khi đã đọc**.

Và lý do `useState(initial)` thay vì đọc `sessionStorage` trong initializer: nhớ file `13` —
`sessionStorage` không tồn tại trên server, và đọc nó trong render đầu tạo hydration mismatch.

---

## 7. Validate live mà không cần react-hook-form

Nếu bạn chỉ cần validate live cho **vài** field, chia sẻ Zod schema là đủ:

```tsx
// lib/hooks/use-field-validation.ts
'use client'
import { useState, useCallback } from 'react'
import type { ZodType } from 'zod'

/**
 * Validate một field bằng CHÍNH schema server dùng.
 * Client validation là UX; server vẫn validate lại (bảo mật).
 */
export function useFieldValidation<T>(schema: ZodType<T>) {
  const [error, setError] = useState<string | null>(null)

  const validate = useCallback(
    (value: unknown) => {
      const result = schema.safeParse(value)
      setError(result.success ? null : (result.error.issues[0]?.message ?? 'Giá trị không hợp lệ'))
      return result.success
    },
    [schema],
  )

  return { error, validate, clear: useCallback(() => setError(null), []) }
}
```

```tsx
// Dùng trong create-discount-form.tsx cho field percentage
import { z } from 'zod'
import { useId } from 'react'

const percentSchema = z.coerce.number().min(0).max(100, 'Phần trăm phải từ 0 đến 100')

function DiscountValueField({ type }: { type: DiscountType }) {
  const id = useId()
  const errorId = `${id}-error`
  const { error, validate, clear } = useFieldValidation(percentSchema)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Giá trị</Label>
      <Input
        id={id}
        name="discount_value"
        type="number"
        step="0.01"
        min="0"
        required
        // Validate khi blur, không khi gõ — gõ "5" trên đường tới "50"
        // không nên hiện lỗi ngay
        onBlur={(e) => { if (type === 'percentage') validate(e.target.value) }}
        onChange={clear}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {type === 'percentage' ? '0–100 (phần trăm)' : 'Số tiền giảm'}
        </p>
      )}
    </div>
  )
}
```

**Ba chi tiết UX/a11y:**

**(1) `onBlur` không `onChange` cho validate.** Gõ `"5"` trên đường tới `"50"` sẽ hợp lệ, nhưng gõ
`"1"` trên đường tới `"150"` thì hợp lệ rồi thành không hợp lệ. Validate khi rời field ít gây khó chịu hơn.

**(2) `onChange={clear}`** — xoá lỗi ngay khi người dùng bắt đầu sửa. Không có nó, lỗi cũ nằm đó trong
khi họ đang sửa.

**(3) `aria-describedby` nối input với message lỗi** (file `23`). Screen reader đọc lỗi khi focus vào
input, không chỉ khi lỗi xuất hiện.

---

## 8. Trade-offs

| Kỹ thuật | Lợi ích | Cái giá |
| --- | --- | --- |
| **Server Action thuần** | Ít code nhất; progressive enhancement | Không progress, không validate live |
| **react-hook-form + Server Action** | UX tốt nhất cho form lớn | +~15KB; mất progressive enhancement; hai chỗ validate |
| **Field array qua JSON hidden input** | Đơn giản, khớp pattern repo đang dùng | Cần JS; phải parse + validate hai bước |
| **Upload qua BFF + XHR** | Đơn giản; BFF validate được tất cả | Băng thông + memory BFF; giới hạn body size |
| **Presigned URL** | BFF không tốn băng thông; file lớn được | 3 round-trip; cần backend hỗ trợ; presigned phải ràng buộc type/size |
| **localStorage draft** | Đơn giản; không tốn request | Per-device; không lưu được file |
| **Server draft** | Đồng bộ mọi thiết bị | Nhiều request; cần rate limit; cần endpoint mới |
| **Step trong URL** | F5-safe, Back button đúng | Cần `<Suspense>`; không đặt dữ liệu cá nhân vào URL |
| **`sessionStorage` cho dữ liệu tạm** | Sống qua refresh, không vào URL | Cần cờ `hydrated` — dễ làm sai và mất dữ liệu |

---

## 9. Best Practices

1. **Mặc định Server Action + uncontrolled input.** Chỉ nâng cấp khi có nhu cầu cụ thể trong 4 nhóm
   ở mục 1.

2. **Chia sẻ Zod schema giữa client và server.** Một nguồn sự thật cho luật validate.

3. **Server LUÔN validate lại**, bất kể client đã validate. Client là UX, server là bảo mật.

4. **Field array: gửi JSON qua một hidden input.** Khớp pattern repo đang dùng (`images`,
   `shop_order_ids`), và parse hai bước (JSON.parse riêng, Zod riêng).

5. **Validate nội dung JSON, không chỉ `Array.isArray`.** 📄 `order.actions.ts` đang thiếu bước này.

6. **`localId` từ counter, không `Math.random()`/`Date.now()`** — chúng gây hydration mismatch.

7. **Upload cần progress → route handler + XHR.** Server Action không làm được, và đó là giới hạn kiến
   trúc, không phải thiếu sót.

8. **File lớn / traffic cao → presigned URL với ràng buộc type + size + thời hạn ngắn.**

9. **Mọi truy cập `localStorage`/`sessionStorage` bọc `try/catch`.** Chúng throw trong private mode.

10. **`sessionStorage` cần cờ `hydrated`** để không ghi đè dữ liệu đã lưu bằng giá trị khởi tạo.

11. **Validate live dùng `onBlur`, xoá lỗi ở `onChange`.** Và nối bằng `aria-describedby`.

12. **Bước wizard vào URL; dữ liệu cá nhân KHÔNG vào URL.**

---

## Tự kiểm tra

1. Bốn giới hạn thật của Server Actions? Giải pháp cho từng cái?
2. Vì sao react-hook-form và Server Action không loại trừ nhau?
3. Vì sao server phải validate lại dù client đã validate bằng cùng schema?
4. Vì sao `localId` không được dùng `Math.random()`?
5. Vì sao `JSON.parse` và `safeParse` phải là hai bước riêng?
6. Chỉ ra chỗ `order.actions.ts` validate chưa đủ.
7. Vì sao Server Action không báo được upload progress? API nào làm được?
8. So sánh upload qua BFF và presigned URL — ngưỡng chọn?
9. Rủi ro bảo mật của presigned URL nếu thiếu ràng buộc?
10. Vì sao `useSessionState` cần cờ `hydrated`? Không có nó thì sao?
11. Vì sao validate `onBlur` tốt hơn `onChange`?

➡️ Tiếp theo: `27-i18n-va-formatting.md`
