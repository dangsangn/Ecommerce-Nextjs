# React 18 → 19.2 & Next.js App Router — Bộ tài liệu mentoring

> Bộ tài liệu này giải thích **các khái niệm và hook mới** của React từ bản 18 trở đi, và cách Next.js (App Router, tới bản 16) xây dựng trên chúng.
> Mục tiêu không phải liệt kê API, mà giúp bạn **ra quyết định**: dùng cái gì, khi nào, và phải trả giá gì.
>
> Phiên bản của repo này (xem [package.json](../../package.json)): **React 19.2.4**, **Next.js 16.2.10**.
> Mọi ví dụ "trong repo" đều trỏ tới file thật để bạn mở ra đối chiếu.

---

## Vì sao cần cả một bộ tài liệu?

Từ React 18 tới nay, React không chỉ "thêm vài hook". Nó thay đổi **cách nghĩ về render**:

| Thời kỳ | Câu hỏi trung tâm | Câu trả lời của React |
| --- | --- | --- |
| React ≤ 17 | "Làm sao vẽ UI từ state?" | Render đồng bộ, một lần là xong |
| **React 18** | "Làm sao UI không bị đơ khi render nặng?" | **Concurrent rendering**: render có thể bị ngắt, có ưu tiên |
| **React 19** | "Làm sao gửi dữ liệu lên server mà không viết 50 dòng boilerplate?" | **Actions**: async function là công dân hạng nhất |
| **React 19.2** | "Làm sao giữ UI ẩn mà không mất state, và effect không bị chạy lại vô lý?" | **`<Activity>`**, **`useEffectEvent`** |
| **Next.js App Router** | "Code nào chạy ở server, code nào ở client?" | **Server Components**, **Server Actions**, **cache có chủ đích** |

Nếu chỉ học thuộc từng hook, bạn sẽ dùng đúng cú pháp nhưng sai chỗ. Đọc theo thứ tự dưới đây, mỗi file xây trên file trước.

---

## Lộ trình đọc

```
 Nền tảng                    Hook React                         Next.js
 ─────────                   ──────────                         ───────
 01 Concurrent  ──►  02 Hook React 18  ──►  03 Actions & Form  ──►  06 Server/Client Components
 Rendering           (transition, defer,     (useActionState,        │
                      id, external store)     useFormStatus,         ▼
                                              useOptimistic)    07 Server Actions & Mutation
                                 │                                   │
                                 ▼                                   ▼
                     04 use() & API React 19              08 Caching (Next 16, use cache)
                                 │                                   │
                                 ▼                                   ▼
                     05 React 19.2 (Activity,             09 Hook & routing của Next
                        useEffectEvent, ViewTransition)              │
                                                                     ▼
                                                    10 Cheatsheet ra quyết định
                                                                     │
                     Mở rộng — "phải biết khi làm thật"              ▼
        11 Routing nâng cao ──► 12 Bảo mật & Data Access ──► 13 Hiệu năng & Test ──► 14 Tips & Tricks
```

| # | File | Đọc khi bạn muốn hiểu… |
| --- | --- | --- |
| 01 | [01-concurrent-rendering.md](./01-concurrent-rendering.md) | Tại sao React 18 là bước ngoặt; batching, ưu tiên render, Strict Mode chạy effect 2 lần |
| 02 | [02-react18-hooks.md](./02-react18-hooks.md) | `useTransition`, `startTransition`, `useDeferredValue`, `useId`, `useSyncExternalStore`, `useInsertionEffect` |
| 03 | [03-react19-actions-and-forms.md](./03-react19-actions-and-forms.md) | Actions, `<form action>`, `useActionState`, `useFormStatus`, `useOptimistic` |
| 04 | [04-react19-use-and-new-apis.md](./04-react19-use-and-new-apis.md) | `use()`, `ref` là prop, `<Context>` làm provider, metadata trong component, preload tài nguyên, React Compiler |
| 05 | [05-react19-2-activity-effect-event.md](./05-react19-2-activity-effect-event.md) | `<Activity>`, `useEffectEvent`, `<ViewTransition>`, `cacheSignal` |
| 06 | [06-server-and-client-components.md](./06-server-and-client-components.md) | RSC, `'use client'`, ranh giới server/client, cái gì truyền qua được |
| 07 | [07-nextjs-server-actions-and-mutations.md](./07-nextjs-server-actions-and-mutations.md) | `'use server'`, `revalidatePath`, `updateTag`, `refresh`, `redirect` ném lỗi, `after` |
| 08 | [08-nextjs-caching-and-rendering.md](./08-nextjs-caching-and-rendering.md) | Streaming, `loading.tsx`, Cache Components, `'use cache'`, `cacheLife`, `cacheTag`, PPR |
| 09 | [09-nextjs-client-hooks-and-routing.md](./09-nextjs-client-hooks-and-routing.md) | `useRouter`, `useSearchParams`, `useParams`, `useLinkStatus`, async `params`, `proxy.ts`, error boundary |
| 10 | [10-decision-cheatsheet.md](./10-decision-cheatsheet.md) | "Tôi gặp tình huống X thì dùng gì?" + lỗi hay gặp |
| 11 | [11-nextjs-advanced-routing.md](./11-nextjs-advanced-routing.md) | Layout vs template, route group, parallel & intercepting routes (modal có URL), Route Handlers, Metadata/SEO |
| 12 | [12-security-and-data-access.md](./12-security-and-data-access.md) | `cache()` của React, Data Access Layer, DTO, env vars, taint, Server Action an toàn, `forbidden`/`unauthorized` |
| 13 | [13-performance-and-testing.md](./13-performance-and-testing.md) | Prefetch, router cache, `next/image`, `next/font`, `next/script`, bundle, test Server Action / Client Component / E2E |
| 14 | [14-tips-and-tricks.md](./14-tips-and-tricks.md) | 20 mẹo thực chiến: `formAction`, `.bind`, `key` reset, `Suspense key`, preload pattern, debug |

> **Mẹo:** nếu bạn đang cần sửa một form trong repo ngay bây giờ, đọc 03 → 07 là đủ. Nếu cần hiểu tại sao trang chậm hoặc dữ liệu cũ, đọc 08 và 13. Trước khi viết action/page có dữ liệu riêng tư, đọc 12.

---

## Mốc phiên bản (để biết thứ gì "mới" so với cái gì)

| Phiên bản | Thời điểm | Điểm chính |
| --- | --- | --- |
| React 18.0 | 03/2022 | `createRoot`, concurrent rendering, automatic batching, `useTransition`, `useDeferredValue`, `useId`, `useSyncExternalStore`, Suspense trên server (streaming SSR) |
| Next.js 13 | 10/2022 | App Router (`app/`), React Server Components |
| Next.js 14 | 10/2023 | Server Actions ổn định |
| Next.js 15 | 10/2024 | `params`/`cookies()` thành async, mặc định **không** cache `fetch` (chạy trên React 19 RC) |
| React 19.0 | 12/2024 | Actions, `useActionState`, `useFormStatus`, `useOptimistic`, `use`, `ref` là prop, metadata/stylesheet trong component, RSC & Server Functions ổn định |
| React 19.1 | 03/2025 | Owner Stack (debug), cải thiện Suspense |
| React 19.2 | 10/2025 | `<Activity>`, `useEffectEvent`, `cacheSignal`, Performance Tracks |
| Next.js 16 | 10/2025 | Turbopack mặc định, `middleware` → **`proxy.ts`**, Cache Components (`'use cache'`), `updateTag`, `refresh`, React Compiler ổn định, async API bắt buộc |

---

## Repo này đang dùng gì? (bản đồ nhanh)

| Khái niệm | Có trong repo? | Ví dụ |
| --- | --- | --- |
| `useActionState` | ✅ dùng rất nhiều — khuôn chuẩn của mọi form | [components/auth/login-form.tsx](../../components/auth/login-form.tsx) |
| `useFormStatus` | ✅ | [components/auth/submit-button.tsx](../../components/auth/submit-button.tsx) |
| `useTransition` | ✅ | [components/products/image-manager.tsx](../../components/products/image-manager.tsx) |
| Server Actions + `revalidatePath` | ✅ | [actions/cart.actions.ts](../../actions/cart.actions.ts) |
| `Suspense` quanh `useSearchParams` | ✅ | [app/(seller)/seller/page.tsx](<../../app/(seller)/seller/page.tsx>) |
| Async `params` / `searchParams` | ✅ | [app/(store)/products/[id]/page.tsx](<../../app/(store)/products/[id]/page.tsx>) |
| `proxy.ts` (thay middleware) | ✅ | [proxy.ts](../../proxy.ts) |
| `useOptimistic` | ❌ chưa — ứng viên tốt: giỏ hàng, bình luận | xem 03 |
| `use()`, `<Activity>`, `useEffectEvent` | ❌ chưa | xem 04, 05 |
| `'use cache'` / Cache Components | ❌ chưa bật (`cacheComponents` không có trong [next.config.ts](../../next.config.ts)) | xem 08 |
| React Compiler | ❌ chưa bật | xem 04 |
| Route groups `(store)`, `(seller)`, `(auth)` | ✅ | xem 11 |
| `cache()` của React chống gọi trùng | ❌ chưa — `/cart` bị gọi 2 lần/request | xem 12 |
| `generateMetadata` cho trang sản phẩm | ❌ chưa — cả site dùng chung title "E-Commerce Seller" | xem 11 |
| `loading.tsx` / `error.tsx` | ❌ chưa có file nào | xem 08, 09, 13 |
| `next/image` | ❌ dùng `<img>` (10 file) | xem 13 |
| Unit test hàm thuần trong `lib/` | ✅ 15 file test | xem 13 |

"Chưa dùng" không có nghĩa "nên dùng". Mỗi file có mục **When NOT to use** để bạn tự đánh giá.

---

## Quy ước trong bộ tài liệu

- Mỗi khái niệm trả lời 5 câu: **Là gì? Tại sao tồn tại? Khi nào dùng? Khi nào KHÔNG dùng? Đánh đổi gì?**
- Ví dụ đi từ **cơ bản** → **thực tế** (thường lấy bối cảnh e-commerce của repo).
- Code ví dụ minh họa là TypeScript, giả định `'use client'` khi có hook trạng thái.
- 🧠 = mô hình tư duy, ⚠️ = cạm bẫy hay gặp, ✅ = khuyến nghị.
