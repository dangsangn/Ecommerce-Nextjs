# 03. `useEffect` — dùng đúng và dùng sai

> **Mục tiêu:** hiểu `useEffect` sinh ra để làm *một* việc, nhận ra 5 kiểu lạm dụng phổ biến nhất,
> và biết đánh giá một cách công bằng các effect đang có trong repo này.

---

## 1. Overview

### `useEffect` KHÔNG phải "lifecycle hook"

Đây là ngộ nhận tốn kém nhất trong React. Rất nhiều người học React sau khi biết class component nghĩ rằng:

```tsx
useEffect(() => {...}, [])        // ≈ componentDidMount
useEffect(() => {...}, [x])       // ≈ componentDidUpdate
useEffect(() => {... return fn }) // ≈ componentWillUnmount
```

Cách nghĩ này **hoạt động được trong nhiều trường hợp**, nên nó rất khó bỏ. Nhưng nó dẫn tới sai
lầm ngay khi gặp StrictMode, concurrent rendering, hoặc Suspense — vì trong những bối cảnh đó,
"mount" và "update" không còn là chuỗi tuyến tính nữa.

### Định nghĩa đúng

> **`useEffect` dùng để đồng bộ component của bạn với một hệ thống BÊN NGOÀI React.**

Từ khoá là **"bên ngoài"**. "Hệ thống bên ngoài" nghĩa là bất cứ thứ gì React không quản lý:

| Hệ thống bên ngoài | Ví dụ |
| --- | --- |
| DOM API trực tiếp | `document.title`, `document.body.style`, `IntersectionObserver` |
| Sự kiện của browser | `window.addEventListener('resize')`, `matchMedia` |
| Kết nối mạng có trạng thái | WebSocket, EventSource, polling |
| Thư viện bên thứ ba | map (Leaflet, Mapbox), chart (D3), video player |
| Timer | `setInterval`, `setTimeout` |
| Storage | `localStorage`, `IndexedDB` |

Nếu việc bạn đang làm **không** đồng bộ với một trong những thứ trên → **rất có thể bạn không cần `useEffect`.**

### Vì sao ranh giới này quan trọng

Vì effect chạy **sau khi commit**, tức là **sau khi người dùng đã thấy UI**. Mọi thứ bạn làm trong
effect đều là "sửa lại sau khi đã vẽ". Điều đó có ba hệ quả:

1. **Có một khung hình (frame) mà UI ở trạng thái sai** — người dùng có thể thấy nhấp nháy
2. **Một lần render bổ sung** nếu effect gọi `setState`
3. **Thứ tự thực thi khó đoán hơn** — effect của con chạy trước effect của cha

---

## 2. Mental Model

### 🧠 Effect như một sợi dây đồng bộ hai chiều

Hãy hình dung component của bạn ở trong "thế giới React" và hệ thống bên ngoài ở "thế giới bên ngoài".
`useEffect` là sợi dây nối hai bên:

```
   ┌─────────────────┐                    ┌──────────────────────┐
   │  THẾ GIỚI REACT │                    │  THẾ GIỚI BÊN NGOÀI  │
   │                 │                    │                      │
   │   open = true   │ ══ setup() ══════▶ │ body.overflow=hidden │
   │                 │                    │                      │
   │   open = false  │ ══ cleanup() ════▶ │ body.overflow=prev   │
   └─────────────────┘                    └──────────────────────┘
```

Từ hình này suy ra hai điều:

**(a) Mỗi `setup` phải có `cleanup` "hoàn tác" nó.** Nếu sợi dây bị cắt (component unmount, hoặc
dependency đổi), thế giới bên ngoài phải trở về đúng trạng thái trước khi nối dây. Không có cleanup =
rò rỉ (listener chồng chất, WebSocket không đóng, timer chạy mãi).

**(b) Dependency array KHÔNG phải "khi nào chạy" — nó là "effect này đọc những giá trị nào".**

Đây là cách nghĩ đúng và nó giải phóng bạn khỏi việc "chỉnh" dependency array. Bạn không *chọn*
dependency; bạn **liệt kê** những giá trị mà thân effect đọc. Nếu bạn muốn effect chạy ít hơn, bạn
phải **thay đổi thân effect** (hoặc dùng `useEffectEvent`), không phải xoá dependency.

⚠️ **Xoá một dependency để "effect đừng chạy lại" là cách tạo bug im lặng.** Effect sẽ tiếp tục
dùng giá trị cũ (stale closure) mãi mãi.

---

## 3. How It Works — vòng đời một effect

```
                        Component render
                              │
                              ▼
                       React commit DOM
                              │
                              ▼
                    ┌── useLayoutEffect ──┐  ← ĐỒNG BỘ, chặn paint
                    └─────────┬───────────┘
                              ▼
                      Browser paint 🖼️
                              │
                              ▼
                    ┌───── useEffect ─────┐  ← BẤT ĐỒNG BỘ, sau paint
                    └─────────────────────┘

Khi dependency đổi (hoặc unmount):
        cleanup của lần trước  ──▶  setup của lần này
```

Điểm cần khắc vào đầu: **cleanup của lần trước luôn chạy TRƯỚC setup của lần sau.** Không bao giờ có
hai "setup" hoạt động đồng thời. Đây là lý do pattern lưu-và-khôi-phục trong repo hoạt động đúng.

---

## 4. Practical Examples — mổ xẻ các effect thật trong repo

### ✅ Ví dụ tốt #1 — đồng bộ với `document.body`

📄 `components/seller/seller-mobile-nav.tsx`:

```tsx
// Lock body scroll while the drawer is open.
useEffect(() => {
  if (!open) return
  const prev = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  return () => {
    document.body.style.overflow = prev
  }
}, [open])
```

**Vì sao đây là `useEffect` đúng nghĩa:**

| Tiêu chí | Đánh giá |
| --- | --- |
| Có hệ thống bên ngoài? | ✅ `document.body.style` — React không quản lý nó |
| Có cleanup hoàn tác? | ✅ Khôi phục `prev`, không hardcode |
| Dependency đầy đủ? | ✅ Thân effect chỉ đọc `open` |
| Idempotent (chịu được StrictMode)? | ✅ setup→cleanup→setup cho kết quả giống setup một lần |
| Có `setState` bên trong? | ✅ Không → không có render thừa |

Đây là mẫu chuẩn. Nếu bạn cần viết một effect, hãy so nó với đoạn này.

### ⚖️ Ví dụ cần bàn #2 — toast từ `useActionState`

Đây là pattern xuất hiện ở **17 file** (19 lời gọi `useEffect`) trong repo. 📄 `components/auth/login-form.tsx`:

```tsx
const [state, formAction] = useActionState(loginAction, initialActionState)

useEffect(() => {
  if (state.message) toast.error(state.message)
}, [state])
```

📄 Và biến thể đầy đủ hơn, `components/store/cancel-order-button.tsx`:

```tsx
const [state, formAction] = useActionState(cancelOrderAction, initialActionState)
useEffect(() => {
  if (state.ok && state.message) toast.success(state.message)
  else if (!state.ok && state.message) toast.error(state.message)
}, [state])
```

**Đánh giá công bằng:**

Về lý thuyết, đây là "phản ứng với một *sự kiện* bằng effect" — thường là dấu hiệu sai, vì toast là
hệ quả của việc *người dùng submit form*, không phải việc *đồng bộ với hệ thống bên ngoài*. Sách vở
sẽ nói: hãy toast trong event handler.

**Nhưng ở đây nó là lựa chọn hợp lý**, vì `useActionState` không cho bạn một callback "khi xong".
Kết quả của action **đến dưới dạng state**, và cách duy nhất để phản ứng với state mới là effect.
Đây là một escape hatch có lý do.

Nó hoạt động đúng vì `useActionState` trả về **object mới** sau mỗi lần chạy action, nên
`[state]` luôn thay đổi reference → effect luôn chạy → toast luôn hiện, kể cả khi cùng một lỗi
lặp lại hai lần liên tiếp.

**Nhưng có hai vấn đề thật:**

**⚠️ Vấn đề 1 — trùng lặp 17 chỗ.** Cùng một đoạn 3–4 dòng được copy khắp `components/`. Đây là nợ kỹ
thuật rõ ràng. Trích một custom hook:

```tsx
// lib/hooks/use-action-toast.ts
'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import type { ActionState } from '@/actions/state'

/**
 * Toast kết quả của một Server Action. Chạy lại mỗi khi `state` là object mới
 * (useActionState luôn trả object mới sau mỗi lần chạy), nên lỗi lặp lại vẫn toast.
 */
export function useActionToast(state: ActionState) {
  useEffect(() => {
    if (!state.message) return
    if (state.ok) toast.success(state.message)
    else toast.error(state.message)
  }, [state])
}
```

Sau đó `cancel-order-button.tsx` gọn còn:

```tsx
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState(cancelOrderAction, initialActionState)
  useActionToast(state)

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" variant="outline" size="sm">Cancel order</Button>
    </form>
  )
}
```

Custom hook không phải để "tái sử dụng logic" một cách chung chung — nó để **đặt tên cho một khái niệm**.
`useActionToast` nói rõ ý định; `useEffect(...)` thì không.

**⚠️ Vấn đề 2 — có khi không cần effect chút nào.**

📄 So sánh với `components/discounts/discount-code-lookup.tsx` — file duy nhất trong repo dùng
`useActionState` mà **không có `useEffect`**:

```tsx
const [state, formAction] = useActionState(lookupDiscountByCodeAction, initial)
return (
  <Card>
    ...
    {state.ok && state.data ? (
      <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">{state.data.discount_name}</p>
        <p className="text-muted-foreground">
          {state.data.discount_type === 'percentage'
            ? `${state.data.discount_value}% off`
            : `${state.data.discount_value} off`}
        </p>
      </div>
    ) : null}
    {!state.ok && state.message ? (
      <p className="text-sm text-destructive">{state.message}</p>
    ) : null}
  </Card>
)
```

**Đây là cách render kết quả action đúng nhất: suy ra UI trực tiếp từ state.** Không effect, không
render thừa, không cần lo về reference identity.

Khi nào chọn cách nào?

| | Render inline (như `discount-code-lookup`) | Toast qua effect |
| --- | --- | --- |
| Lỗi validate của form | ✅ Nên dùng — người dùng cần thấy lỗi cạnh field | ❌ Toast biến mất, người dùng phải nhớ |
| Kết quả tra cứu, dữ liệu trả về | ✅ Nên dùng | ❌ Không phù hợp |
| Xác nhận thành công của hành động ngắn ("Đã thêm vào giỏ") | ⚠️ Chiếm chỗ trên layout | ✅ Nên dùng |
| Thông báo cho hành động rồi điều hướng đi | ❌ Component unmount mất | ✅ Nên dùng (xem `welcome-toast`) |

📄 Theo tiêu chí này, `login-form.tsx` và `signup-form.tsx` **nên render lỗi inline** thay vì toast —
lỗi "Sai mật khẩu" nên nằm cạnh ô mật khẩu:

```tsx
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(loginAction, initialActionState)
  // Không cần useEffect nữa
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      {/* ...các field... */}
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      ) : null}
      <SubmitButton>Sign in</SubmitButton>
    </form>
  )
}
```

`role="alert"` để screen reader đọc lỗi ra — điều mà toast làm không đáng tin cậy.

### ❌ Ví dụ sai #3 — dùng effect để "đẩy" state lên cha

📄 `components/products/image-uploader.tsx`:

```tsx
const initial = { ok: false as boolean, data: undefined as PreparedImages | undefined }

export function ImageUploader({ onPrepared }: { onPrepared: (data: PreparedImages) => void }) {
  const [state, formAction] = useActionState(prepareImagesAction, initial)

  useEffect(() => {
    if (state.ok && state.data) onPrepared(state.data)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state, onPrepared])
```

Và ở cha, `components/products/create-product-form.tsx`:

```tsx
const [uploadResult, setUploadResult] = useState<PreparedImages | null>(null)
...
<ImageUploader onPrepared={setUploadResult} />
```

**Vấn đề: cùng một dữ liệu được lưu ở HAI nơi.**

```
prepareImagesAction trả về PreparedImages
        │
        ├──▶ state.data      (trong useActionState của ImageUploader)
        │
        └──▶ uploadResult    (trong useState của CreateProductForm)  ← bản sao
             ↑
        được đồng bộ bằng useEffect
```

Hệ quả cụ thể:

1. **Một lần render thừa mỗi lần upload**: `state` đổi → render `ImageUploader` → effect chạy →
   `setUploadResult` → render `CreateProductForm` **và toàn bộ cây con**.
2. **Có một khung hình mà hai nơi lệch nhau**: `state.data` đã có nhưng `uploadResult` vẫn `null`,
   nên `<fieldset disabled>` vẫn đang khoá dù ảnh đã upload xong.
3. **`onPrepared` trong dependency array là một quả bom hẹn giờ.** Hiện tại nó là `setUploadResult`
   (React bảo đảm setter có identity ổn định) nên effect không chạy lại vô hạn. Nhưng nếu ai đó đổi
   thành `onPrepared={(d) => setUploadResult(d)}` — một arrow function mới mỗi lần render — thì:
   effect chạy → setState → render → `onPrepared` mới → effect chạy lại → **vòng lặp vô hạn**.

**Cách sửa: nâng `useActionState` lên component cha.** Chỉ còn một nguồn sự thật:

```tsx
// create-product-form.tsx
export function CreateProductForm() {
  const [type, setType] = useState<ProductType>('CLOTHING')
  const [uploadState, uploadAction] = useActionState(prepareImagesAction, prepareInitial)
  const [state, formAction] = useActionState(createProductAction, initialActionState)

  // Nguồn sự thật DUY NHẤT, suy ra trực tiếp — không effect, không bản sao
  const prepared = uploadState.ok ? uploadState.data : undefined

  useActionToast(state)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>1. Images</CardTitle></CardHeader>
        <CardContent>
          {/* ImageUploader nhận action + state, không tự giữ state */}
          <ImageUploader action={uploadAction} state={uploadState} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Details</CardTitle></CardHeader>
        <CardContent>
          <form action={formAction}>
            <fieldset disabled={!prepared} className="space-y-4 disabled:opacity-60">
              {prepared ? (
                <>
                  <input type="hidden" name="productId" value={prepared.productId} />
                  <input type="hidden" name="thumbUrl" value={prepared.thumb.url} />
                  <input type="hidden" name="thumbPublicId" value={prepared.thumb.public_id} />
                  <input type="hidden" name="images" value={JSON.stringify(prepared.images)} />
                </>
              ) : null}
              {/* ...phần còn lại giữ nguyên... */}
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

`ImageUploader` trở thành component "thuần trình bày" — nhận `action` và `state`, chỉ render.
Không effect, không bản sao state, không nguy cơ vòng lặp.

> **Quy tắc rút ra:** nếu bạn đang dùng `useEffect` để đưa dữ liệu từ con lên cha, hãy hỏi:
> *"tại sao dữ liệu này lại sinh ra ở con?"* Thường câu trả lời là nó nên sinh ra ở cha ngay từ đầu.

### ⚖️ Ví dụ tinh tế #4 — phản ứng với URL

📄 `components/seller/welcome-toast.tsx`:

```tsx
// Shows the "You're now a shop" toast after the upgrade redirect, then strips
// the ?welcome=1 flag so it doesn't fire again on refresh.
export function WelcomeToast() {
  const router = useRouter()
  const params = useSearchParams()
  const welcome = params.get('welcome')

  useEffect(() => {
    if (welcome !== '1') return
    toast.success("You're now a shop — welcome to Seller Centre")
    router.replace('/seller')
  }, [welcome, router])

  return null
}
```

**Đây là một effect chính đáng**, dù nhìn hơi lạ. Lý do:

Server Action `upgradeToShopAction` gọi `redirect('/seller?welcome=1')`. Khi redirect xảy ra,
component `UpgradeShopForm` **bị unmount** — nó không thể tự toast được. Comment trong
`actions/user.actions.ts` nói rõ điều này:

```
// Send the new seller straight to their dashboard. `?welcome=1` triggers the
// success toast there (the form unmounts on redirect, so it can't toast itself).
```

Nên thông báo phải được **truyền qua URL** và một component ở trang đích đọc nó. Đó chính là
"đồng bộ với hệ thống bên ngoài" — hệ thống ngoài đây là **URL của browser**.

**Chi tiết đúng đắn:** `router.replace('/seller')` xoá `?welcome=1` ngay sau khi toast, nên refresh
không toast lại. Và effect có guard `if (welcome !== '1') return` nên khi `welcome` thành `null`,
effect chạy lại nhưng không làm gì.

**Component trả về `null`** — nó không render gì, chỉ tồn tại để chạy một effect. Đây là pattern hợp
lệ và được đặt tên rõ: một "effect component".

⚠️ **Điểm cần biết:** component này bắt buộc phải nằm trong `<Suspense>`:

📄 `app/(seller)/seller/page.tsx`:

```tsx
<Suspense fallback={null}>
  <WelcomeToast />
</Suspense>
```

Lý do nằm ở `useSearchParams()`, và sẽ được giải thích đầy đủ ở file `06-suspense-va-streaming.md`.

### ❌ Ví dụ sai #5 — hai effect gần như giống hệt

📄 `components/products/edit-product-form.tsx`:

```tsx
const [detailsState, detailsAction] = useActionState(updateProductAction, initialActionState)
const [imagesState, imagesAction] = useActionState(addProductImagesAction, initialActionState)

useEffect(() => {
  if (detailsState.ok && detailsState.message) toast.success(detailsState.message)
  else if (!detailsState.ok && detailsState.message) toast.error(detailsState.message)
}, [detailsState])

useEffect(() => {
  if (imagesState.ok && imagesState.message) toast.success(imagesState.message)
  else if (!imagesState.ok && imagesState.message) toast.error(imagesState.message)
}, [imagesState])
```

Với `useActionToast` từ mục #2, 10 dòng này thành 2 dòng:

```tsx
useActionToast(detailsState)
useActionToast(imagesState)
```

Đây cũng là minh chứng cho việc **custom hook gọi được nhiều lần trong cùng component** — mỗi lần gọi
tạo một effect độc lập với state riêng. Đây là hệ quả trực tiếp của cách React lưu hook theo thứ tự gọi.

---

## 5. Năm kiểu lạm dụng `useEffect` — bảng tra nhanh

| # | Dấu hiệu bạn đang lạm dụng | Cách làm đúng |
| --- | --- | --- |
| 1 | `useEffect(() => setB(f(a)), [a])` — tính state từ state | Tính trực tiếp trong render: `const b = f(a)` |
| 2 | `useEffect(() => { fetch(url).then(setData) }, [url])` | Server Component (`async function Page()`), hoặc `use()` + Suspense |
| 3 | `useEffect(() => setX(prop), [prop])` — reset state khi prop đổi | Dùng `key` trên component |
| 4 | `useEffect(() => onSomething(data), [data])` — đẩy dữ liệu lên cha | Đưa state lên cha ngay từ đầu |
| 5 | `useEffect(() => { if (justSubmitted) toast(...) })` — phản ứng với sự kiện | Xử lý trong event handler; nếu là action → render inline hoặc custom hook có tên |

📄 Repo này mắc **#4** ở `image-uploader.tsx`, và có 17 chỗ ở dạng nhẹ của **#5**.
Nó **không** mắc #1, #2, #3 — một điểm cộng đáng kể so với phần lớn codebase React.

Lý do nó không mắc #2 rất đáng chú ý: **không có một `useEffect` nào fetch data trong toàn bộ repo.**
Mọi thứ fetch nằm trong Server Component hoặc Server Action. Đó là lợi ích lớn nhất của App Router.

---

## 6. Fetch trong effect — nếu buộc phải làm

Có lúc bạn *thật sự* cần fetch ở client (dữ liệu phụ thuộc tương tác nhanh, polling, dữ liệu chỉ có
ở client). Khi đó phải xử lý **race condition** — vấn đề mà 90% code `useEffect` + `fetch` bỏ qua:

```tsx
// ❌ SAI: response về không đúng thứ tự → hiển thị dữ liệu của query cũ
useEffect(() => {
  fetch(`/api/search?q=${query}`)
    .then(r => r.json())
    .then(setResults)
}, [query])
```

Người dùng gõ "ao" rồi "aoth". Request "ao" chậm hơn, về sau → `setResults` ghi đè kết quả của "aoth".
UI hiện kết quả sai và **không có lỗi nào được log**.

```tsx
// ✅ ĐÚNG: cleanup hủy request cũ
useEffect(() => {
  const controller = new AbortController()
  let cancelled = false

  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then(r => r.json())
    .then(data => { if (!cancelled) setResults(data) })
    .catch(e => { if (e.name !== 'AbortError') setError(e) })

  return () => {
    cancelled = true
    controller.abort()
  }
}, [query])
```

Có **hai** lớp bảo vệ, và cần cả hai: `abort()` để không tốn băng thông, và cờ `cancelled` để chắc
chắn không `setState` sau khi effect đã cleanup (vì `abort` không bảo đảm reject kịp trong mọi runtime).

📄 **Repo này dùng cùng kỹ thuật `AbortController`, nhưng ở phía server** —
`actions/user.actions.ts`:

```tsx
const AVATAR_TIMEOUT_MS = 10_000

export async function updateAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get('avatar')
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: 'Choose an image to upload' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS)
  try {
    await apiFetch('/user/me/avatar', {
      method: 'PATCH',
      multipart: formData,
      auth: true,
      signal: controller.signal,
    })
  } catch (e) {
    // The backend endpoint currently never sends a response (missing .send(res)),
    // so this abort/timeout is the expected path today. See STATUS §6.
    if (e instanceof DOMException && e.name === 'AbortError')
      return { ok: false, message: 'Avatar upload is temporarily unavailable' }
    return { ok: false, message: errorMessage(e, 'Could not update your avatar') }
  } finally {
    clearTimeout(timer)
  }
  ...
```

Đáng học hai điều ở đây:

- **`finally { clearTimeout(timer) }`** — dọn timer trên mọi đường ra (thành công, lỗi, abort).
  Cùng nguyên tắc cleanup như effect, chỉ khác bối cảnh.
- **Comment giải thích *vì sao*, không phải *cái gì*.** Comment nói backend đang thiếu `.send(res)` —
  đó là thông tin không đọc được từ code, và là loại comment duy nhất đáng viết.

---

## 7. `useEffectEvent` — giải pháp cho bài toán dependency (React 19.2)

Có một tình huống mà dependency array thực sự bó tay: effect cần **đọc** một giá trị mới nhất
nhưng **không nên chạy lại** khi giá trị đó đổi.

```tsx
// Vấn đề: muốn log theo `theme` hiện tại, nhưng KHÔNG muốn reconnect khi đổi theme
function ChatRoom({ roomId, theme }) {
  useEffect(() => {
    const conn = createConnection(roomId)
    conn.on('connected', () => showToast('Connected!', theme))
    conn.connect()
    return () => conn.disconnect()
  }, [roomId, theme])   // ❌ đổi theme → ngắt và nối lại kết nối!
}
```

Bỏ `theme` khỏi array thì lint báo lỗi và `theme` bị stale. `useEffectEvent` tách phần "đọc giá trị
mới nhất" ra khỏi phần "đồng bộ":

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, theme }) {
  // Không reactive: luôn thấy giá trị MỚI NHẤT, và không cần vào dependency array
  const onConnected = useEffectEvent(() => {
    showToast('Connected!', theme)
  })

  useEffect(() => {
    const conn = createConnection(roomId)
    conn.on('connected', onConnected)
    conn.connect()
    return () => conn.disconnect()
  }, [roomId])   // ✅ chỉ roomId là reactive
}
```

**Cách phân biệt:** một giá trị là **reactive** nếu việc nó đổi *nên* làm effect đồng bộ lại
(→ vào dependency array). Nó là **event-like** nếu effect chỉ cần biết giá trị mới nhất *khi có
việc gì xảy ra* (→ bọc trong `useEffectEvent`).

Repo này chưa cần đến nó (không có effect nào phức tạp đến vậy), nhưng đây là công cụ bạn sẽ cần khi
làm việc với WebSocket, analytics, hoặc thư viện bên thứ ba.

---

## 8. Trade-offs

| Lợi ích của `useEffect` | Cái giá |
| --- | --- |
| Cửa thoát hiểm duy nhất để nói chuyện với thế giới ngoài React | Chạy *sau* paint → có khung hình UI ở trạng thái trung gian |
| Cleanup tự động theo vòng đời → không rò rỉ nếu viết đúng | Rất dễ viết thiếu cleanup, và bug rò rỉ thường im lặng |
| Dependency array cho phép kiểm soát chi tiết | Cũng là nguồn bug lớn nhất: thiếu dep → stale, thừa dep → chạy quá nhiều |
| Chạy sau paint → không chặn hiển thị | Nếu effect `setState` thì có 2 lần render cho 1 lần cập nhật |

**Vì sao effect vẫn cần thiết dù nhiều cạm bẫy:** vì thế giới bên ngoài React tồn tại và không thể
mô hình hoá bằng render pure. Vấn đề không phải bản thân `useEffect` — mà là nó **quá tiện** nên bị
dùng cho những việc có giải pháp tốt hơn.

---

## 9. Best Practices

1. **Trước khi viết `useEffect`, hỏi: "hệ thống bên ngoài nào tôi đang đồng bộ?"**
   Không trả lời được → bạn không cần effect.

2. **Luôn viết cleanup, và luôn khôi phục giá trị trước đó.**
   `seller-mobile-nav.tsx` là mẫu chuẩn.

3. **Đừng bao giờ xoá dependency để effect chạy ít hơn.** Thay vào đó: chia nhỏ effect, dùng
   `useEffectEvent`, hoặc chuyển giá trị vào ref nếu nó thật sự không reactive.

4. **Đặt tên cho effect bằng custom hook.** `useActionToast(state)` nói được ý định;
   `useEffect(() => {...}, [state])` thì không. Đây là lợi ích chính của custom hook — không phải DRY.

5. **Ưu tiên render inline hơn toast cho lỗi validate.** Toast phù hợp với xác nhận ngắn hoặc thông
   báo xuyên trang; lỗi form cần ở lại trên màn hình, cạnh field, có `role="alert"`.

6. **Trong App Router, đừng fetch trong effect.** Mặc định là Server Component. Chỉ fetch ở client
   khi dữ liệu phụ thuộc trạng thái chỉ có ở client.

7. **Đừng đẩy dữ liệu lên cha bằng effect.** Nếu cha cần dữ liệu, hãy để state sinh ra ở cha.

---

## Tự kiểm tra

1. Điền vào chỗ trống: "`useEffect` dùng để ______ component với ______".
2. Dependency array trả lời câu hỏi nào? (không phải "khi nào chạy")
3. `image-uploader.tsx` có bao nhiêu nguồn sự thật cho dữ liệu ảnh đã upload? Vấn đề gì phát sinh?
4. Vì sao `welcome-toast.tsx` phải toast qua URL thay vì toast ngay trong `upgrade-shop-form.tsx`?
5. Viết một effect fetch có xử lý race condition. Vì sao cần *cả* `abort()` *và* cờ `cancelled`?
6. Khi nào một giá trị nên vào dependency array, khi nào nên bọc `useEffectEvent`?

➡️ Tiếp theo: `04-memo-usememo-usecallback.md`
