# 10 — Cheatsheet ra quyết định & lỗi hay gặp

> Dùng file này khi bạn **đang viết code** và cần trả lời nhanh: *"tình huống này dùng gì?"*
> Mỗi dòng có link về file giải thích chi tiết — đừng dùng một công cụ mà bạn chưa đọc phần **When NOT to use** của nó.

---

## 1. "Tôi cần…" → dùng gì

### Dữ liệu & render

| Tôi cần… | Dùng | Đọc thêm |
| --- | --- | --- |
| Lấy dữ liệu để hiển thị trang | Server Component `async` + `await` | [06](./06-server-and-client-components.md) |
| Phần chậm không chặn phần nhanh | `<Suspense>` quanh Server Component async | [08](./08-nextjs-caching-and-rendering.md) |
| Click link phản hồi ngay khi trang đích chậm | `loading.tsx` | [08](./08-nextjs-caching-and-rendering.md) |
| Lấy 2 nguồn độc lập | `Promise.all` hoặc stream một nguồn qua Suspense | [08](./08-nextjs-caching-and-rendering.md) |
| Client Component cần dữ liệu từ server mà vẫn stream | Truyền **Promise** từ server, mở bằng `use()` | [04](./04-react19-use-and-new-apis.md) |
| Cache dữ liệu công khai giữa các request | `'use cache'` + `cacheLife` + `cacheTag` (cần `cacheComponents`) | [08](./08-nextjs-caching-and-rendering.md) |
| Đọc `id` trong `/products/[id]` | Server: `await params` · Client: `useParams()` | [09](./09-nextjs-client-hooks-and-routing.md) |
| Đọc `?q=` để lọc dữ liệu | `searchParams` trong `page.tsx` | [09](./09-nextjs-client-hooks-and-routing.md) |
| Đọc `?q=` để điều khiển UI client | `useSearchParams()` + `<Suspense>` | [09](./09-nextjs-client-hooks-and-routing.md) |

### Ghi dữ liệu (mutation)

| Tôi cần… | Dùng | Đọc thêm |
| --- | --- | --- |
| Form gửi lên server | Server Action + `<form action>` | [07](./07-nextjs-server-actions-and-mutations.md) |
| Hiện kết quả/lỗi của lần submit | `useActionState` | [03](./03-react19-actions-and-forms.md) |
| Nút submit tự disable khi đang gửi | Component con dùng `useFormStatus` (như `SubmitButton`) | [03](./03-react19-actions-and-forms.md) |
| Gọi action **không** từ form (chọn file, kéo-thả) | `useTransition` + `startTransition(async …)` | [02](./02-react18-hooks.md) |
| UI đổi ngay trước khi server trả lời | `useOptimistic` (chỉ khi tỷ lệ thành công cao) | [03](./03-react19-actions-and-forms.md) |
| Sau khi ghi, trang hiện tại thấy dữ liệu mới | `revalidatePath` / `updateTag` / `refresh()` trong action | [07](./07-nextjs-server-actions-and-mutations.md) |
| Sau khi ghi, chuyển trang | `redirect()` trong action — **ngoài `try/catch`** | [07](./07-nextjs-server-actions-and-mutations.md) |
| Webhook từ hệ thống ngoài | Route Handler + `revalidateTag(tag, 'max')` | [07](./07-nextjs-server-actions-and-mutations.md) |
| Ghi log/analytics không làm người dùng chờ | `after()` | [07](./07-nextjs-server-actions-and-mutations.md) |

### Hiệu năng & UX phía client

| Tôi cần… | Dùng | Đọc thêm |
| --- | --- | --- |
| Gõ input không lag dù danh sách nặng | `useDeferredValue` + `memo` | [02](./02-react18-hooks.md) |
| Chuyển tab nặng mà không đơ | `useTransition` | [02](./02-react18-hooks.md) |
| Ẩn tab mà giữ state (form gõ dở) | `<Activity mode="hidden">` | [05](./05-react19-2-activity-effect-event.md) |
| Effect đọc prop mới nhất mà không chạy lại | `useEffectEvent` | [05](./05-react19-2-activity-effect-event.md) |
| Id cho `label`/`aria-*` trong component tái sử dụng | `useId` | [02](./02-react18-hooks.md) |
| Đọc `navigator.onLine`, `matchMedia`, store ngoài | `useSyncExternalStore` | [02](./02-react18-hooks.md) |
| Đọc Context sau một `if` | `use(Context)` | [04](./04-react19-use-and-new-apis.md) |
| Truyền ref vào component tự viết | `ref` là prop thường (bỏ `forwardRef`) | [04](./04-react19-use-and-new-apis.md) |
| Chỉ báo đang chuyển trang trên một link | `useLinkStatus` (tạm) → `loading.tsx` (gốc) | [09](./09-nextjs-client-hooks-and-routing.md) |

---

## 2. Cây quyết định nhanh

### Server hay Client Component?

```
 Có cần state / effect / event handler / browser API / Context?
 ├─ Không → Server Component (mặc định, không viết gì)
 └─ Có    → Tách PHẦN NHỎ NHẤT cần tương tác ra file riêng với 'use client'
            Phần còn lại vẫn là Server Component, truyền nội dung vào qua children
```

### Trạng thái pending lấy từ đâu?

```
 Hành động đến từ <form>?
 ├─ Có
 │   ├─ Đọc ở component con của form (nút)  → useFormStatus().pending
 │   └─ Đọc ở component sở hữu form          → useActionState(...)[2]  (isPending)
 └─ Không (click, chọn file, kéo-thả)        → useTransition()[0]
 Điều hướng bằng <Link>?                     → useLinkStatus().pending
```

### Làm UI thấy dữ liệu mới sau khi ghi?

```
 Trong Server Action?
 ├─ Có
 │   ├─ Dữ liệu có cacheTag?         → updateTag(tag)             (thấy ngay)
 │   ├─ Biết path bị ảnh hưởng?      → revalidatePath(path)
 │   └─ Chỉ cần render lại trang này → refresh()
 └─ Không (Route Handler, webhook)   → revalidateTag(tag, 'max')  (stale-while-revalidate)
 Ở client, không gắn với action      → router.refresh()
```

### Có nên dùng `useOptimistic`?

```
 Server gần như luôn chấp nhận?          ── Không → dùng pending trung thực
   │ Có
 Kết quả có thể đoán đúng ở client?      ── Không (giá, tồn kho) → pending
   │ Có
 Nếu thất bại, người dùng có thấy bị lừa? ── Có (đặt hàng, thanh toán) → pending
   │ Không
 ✅ useOptimistic (thích, số lượng giỏ, bình luận, toggle publish)
```

---

## 3. Lỗi hay gặp — triệu chứng → nguyên nhân → cách sửa

| Triệu chứng | Nguyên nhân | Cách sửa | File |
| --- | --- | --- | --- |
| Đăng nhập thành công nhưng hiện toast "Could not sign you in" | `redirect()` nằm trong `try`, bị `catch` nuốt | Đưa `redirect()` ra ngoài `try`, hoặc `unstable_rethrow(e)` | [07](./07-nextjs-server-actions-and-mutations.md) |
| `useFormStatus().pending` luôn `false` | Gọi hook trong chính component render `<form>` | Tách nút ra component con | [03](./03-react19-actions-and-forms.md) |
| Validate lỗi xong, form trống trơn | React 19 tự reset form sau action | Trả `values` trong state + `defaultValue` | [03](./03-react19-actions-and-forms.md) |
| Action nhận `formData` là `undefined` / sai | Quên tham số đầu `prevState` khi dùng `useActionState` | Chữ ký `(prev, formData)` | [03](./03-react19-actions-and-forms.md) |
| API bị gọi 2 lần ở dev | Strict Mode mount → unmount → mount | Viết cleanup; tốt hơn: fetch ở Server Component | [01](./01-concurrent-rendering.md) |
| Vòng lặp render vô hạn với `use()` | Promise được tạo mới mỗi lần render | Tạo Promise ở server / cache nó | [04](./04-react19-use-and-new-apis.md) |
| Vòng lặp vô hạn với `useSyncExternalStore` | `getSnapshot` trả object mới mỗi lần | Trả giá trị ổn định | [02](./02-react18-hooks.md) |
| Build lỗi "useSearchParams() should be wrapped in a suspense boundary" | Thiếu `<Suspense>` | Bọc component trong `<Suspense>` | [09](./09-nextjs-client-hooks-and-routing.md) |
| "Functions cannot be passed directly to Client Components" | Truyền callback thường từ server sang client | Chuyển logic vào client, hoặc dùng Server Action | [06](./06-server-and-client-components.md) |
| Ô input gõ bị trễ / nhảy con trỏ | `setValue` của input bị bọc trong `startTransition` | Input là cập nhật khẩn cấp; chỉ phần suy ra mới là transition | [02](./02-react18-hooks.md) |
| `useDeferredValue` không cải thiện gì | Component con không `memo` | Bọc `memo` | [02](./02-react18-hooks.md) |
| Upload ảnh lỗi khi chọn nhiều file | Body Server Action > 1 MB mặc định | `experimental.serverActions.bodySizeLimit` | [07](./07-nextjs-server-actions-and-mutations.md) |
| Click link "không ăn" vài giây | Route đích động, không có `loading.tsx` | Thêm `loading.tsx` | [08](./08-nextjs-caching-and-rendering.md) |
| User A thấy dữ liệu của user B | Đọc cookie bên trong `'use cache'` | Đọc ngoài scope, truyền vào làm tham số | [08](./08-nextjs-caching-and-rendering.md) |
| Hydration mismatch | `Date.now()`, `Math.random()`, `typeof window` trong render; HTML lồng sai | Dời vào effect / dùng `useId` / sửa cấu trúc | [04](./04-react19-use-and-new-apis.md) |
| Secret lộ ra client | Module đọc `process.env.X` bị import vào Client Component | `import 'server-only'` ở module đó | [06](./06-server-and-client-components.md) |
| Hàm tiện ích bị gọi được từ ngoài | Export hàm thường từ file `'use server'` | Chỉ export action; tiện ích để ở `lib/` | [07](./07-nextjs-server-actions-and-mutations.md) |

---

## 4. Checklist khi viết một form mới trong repo

Theo khuôn của [login-form.tsx](../../components/auth/login-form.tsx) + [actions/auth.actions.ts](../../actions/auth.actions.ts):

- [ ] Schema Zod trong [lib/validations/](../../lib/validations/)
- [ ] Server Action trong [actions/](../../actions/) với chữ ký `(_prev: ActionState, formData: FormData): Promise<ActionState>`
- [ ] Action: kiểm tra phiên → validate → gọi `apiFetch` trong `try` → `return { ok: false, message }` khi lỗi
- [ ] `revalidatePath(...)` cho các trang bị ảnh hưởng
- [ ] `redirect(...)` (nếu có) **ngoài** `try/catch`; không tin URL redirect do client gửi
- [ ] Client Component: `useActionState(action, initialActionState)`
- [ ] Toast trong `useEffect([state])`
- [ ] Ngữ cảnh (id…) qua `<input type="hidden">`
- [ ] Nút là `<SubmitButton>` ([submit-button.tsx](../../components/auth/submit-button.tsx))
- [ ] Nếu form có nhiều field dễ gõ sai: trả `values` để không mất input khi lỗi
- [ ] Tỷ lệ thành công cao & kết quả đoán được? Cân nhắc `useOptimistic`

---

## 5. Cơ hội cải thiện trong repo (tổng hợp từ các file)

Không phải việc bắt buộc — là các điểm mà kiến thức trong bộ tài liệu này áp dụng trực tiếp được:

| # | Cơ hội | Lợi ích | Chi phí | File |
| --- | --- | --- | --- | --- |
| 1 | Thêm `loading.tsx` cho `/orders`, `/cart`, `/seller/products`, `/products/[id]` | Điều hướng phản hồi ngay | Rất thấp | [08](./08-nextjs-caching-and-rendering.md) |
| 2 | Thêm `error.tsx` (với `unstable_retry`) cho mỗi route group | Lưới an toàn khi lỗi bất ngờ | Thấp | [09](./09-nextjs-client-hooks-and-routing.md) |
| 3 | Stream bình luận qua `<Suspense>` ở trang sản phẩm | Bỏ waterfall, trang hiện sớm hơn | Thấp | [08](./08-nextjs-caching-and-rendering.md) |
| 4 | Đặt `serverActions.bodySizeLimit` | Upload nhiều ảnh không lỗi | Rất thấp | [07](./07-nextjs-server-actions-and-mutations.md) |
| 5 | Kiểm tra `redirect` trong `loginAction` là đường dẫn nội bộ | Chặn open redirect | Rất thấp | [07](./07-nextjs-server-actions-and-mutations.md) |
| 6 | `useOptimistic` cho số lượng giỏ hàng | Cảm giác tức thì trên mạng chậm | Trung bình | [03](./03-react19-actions-and-forms.md) |
| 7 | `refresh()` trong `verifyResetOtpAction` thay `router.refresh()` ở client | Bớt 1 round-trip | Thấp | [07](./07-nextjs-server-actions-and-mutations.md) |
| 8 | Bật `cacheComponents` + `publicFetch` cho dữ liệu sản phẩm công khai | Giảm tải backend | Cao (cần thiết kế tag) | [08](./08-nextjs-caching-and-rendering.md) |
| 9 | `getCart` bọc `cache()` — header và trang giỏ hàng dùng chung | Bớt 1 request/lần vào `/cart` | Rất thấp | [12](./12-security-and-data-access.md) |
| 10 | Page dùng `errorMessage(e, fallback)` thay vì `e.message` | Không lộ lỗi nội bộ (`ECONNREFUSED`, tên env) | Rất thấp | [12](./12-security-and-data-access.md) |
| 11 | `generateMetadata` cho trang sản phẩm + `robots.ts` chặn `/seller`, `/cart` | SEO, preview khi chia sẻ link | Thấp | [11](./11-nextjs-advanced-routing.md) |
| 12 | `requireUser()` / `requireShop()` trong DAL, gọi ở mọi action riêng tư | Không phụ thuộc duy nhất vào `proxy.ts` | Trung bình | [12](./12-security-and-data-access.md) |
| 13 | `next/image` với custom loader của dịch vụ ảnh | Ảnh nhẹ hơn, không CLS | Trung bình | [13](./13-performance-and-testing.md) |
| 14 | Test cho Server Action (validate / chưa đăng nhập / lỗi / revalidate) | Bắt bug "lưu rồi UI không đổi" | Trung bình | [13](./13-performance-and-testing.md) |

---

**Tiếp theo (mở rộng):** [11 — Routing nâng cao](./11-nextjs-advanced-routing.md) · **Về đầu:** [README — Lộ trình đọc](./README.md)
