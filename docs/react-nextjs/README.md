# Ôn tập React (18 → 19) & Next.js App Router

Bộ tài liệu này được viết để **ôn lại kiến thức một cách có hệ thống**, không phải để tra API.
**24 chương**, chia bốn phần: nền tảng React → App Router → tổng hợp → nâng cao.
Toàn bộ ví dụ được lấy từ chính source code của repo này (`app/`, `components/`, `actions/`, `lib/`, `proxy.ts`).

## Repo này đang chạy gì?

| Thành phần | Phiên bản | Ghi chú |
| --- | --- | --- |
| React / React DOM | `19.2.4` | Có đầy đủ nền tảng React 18 + toàn bộ tính năng React 19 |
| Next.js | `16.2.10` | App Router, Server Components, `proxy.ts` |
| TypeScript | `^5` | `strict: true` |
| Zod | `^4` | Validate input trong Server Actions |
| Vitest | `^4` | Test cho các hàm pure trong `lib/` |

Vì repo dùng React 19, tài liệu sẽ đi theo trình tự **React 18 giới thiệu gì → React 19 hoàn thiện nó thế nào**.
Đây là cách đúng để hiểu, vì gần như mọi tính năng "hot" của React 19 (Server Components, Actions,
`useOptimistic`) chỉ hoạt động được *nhờ* nền tảng concurrent rendering mà React 18 đặt xuống.

---

## Lộ trình đọc

### Phần A — Nền tảng React

| # | File | Bạn sẽ trả lời được câu hỏi gì |
| --- | --- | --- |
| 01 | `01-react-18-concurrent-rendering.md` | React 18 thực sự thay đổi điều gì? Vì sao render cần bị "ngắt được"? |
| 02 | `02-state-va-render-model.md` | State thực chất là gì? Khi nào lift state, khi nào không? |
| 03 | `03-useEffect-dung-va-sai.md` | `useEffect` sinh ra để làm gì, và 80% cách dùng phổ biến sai ở đâu? |
| 04 | `04-memo-usememo-usecallback.md` | Memo hoá có đáng không? Vì sao repo này gần như không cần? |
| 05 | `05-ref-context-va-hook-con-lai.md` | `useRef`, `useId`, `useSyncExternalStore`, Context, và ref-as-prop của React 19 |
| 06 | `06-suspense-va-streaming.md` | Suspense là gì? Vì sao `<Suspense>` trong `seller/page.tsx` là *bắt buộc*? |
| 07 | `07-transitions-va-useoptimistic.md` | Transition, `useDeferredValue`, `useOptimistic` — và cách áp vào giỏ hàng của repo |

### Phần B — Next.js App Router

| # | File | Bạn sẽ trả lời được câu hỏi gì |
| --- | --- | --- |
| 08 | `08-server-vs-client-components.md` | Ranh giới server/client nằm ở đâu? Cái gì được phép đi qua? |
| 09 | `09-routing-layout-route-groups.md` | Route group, nested layout, `params`/`searchParams` async |
| 10 | `10-data-fetching-caching.md` | `no-store`, `revalidatePath`, tags, dynamic vs static |
| 11 | `11-server-actions-va-forms.md` | `'use server'`, `useActionState`, `useFormStatus`, progressive enhancement |
| 12 | `12-proxy-middleware-va-auth.md` | `proxy.ts` (Node.js runtime), cookie/session, refresh token |
| 13 | `13-render-pipeline-va-hydration.md` | Một request đi qua những gì? Hydration mismatch từ đâu ra? |

### Phần C — Tổng hợp

| # | File | Nội dung |
| --- | --- | --- |
| 14 | `14-kien-truc-testing-checklist.md` | Vì sao `lib/` test được dễ, kiến trúc tầng, checklist review |

### Phần D — Nâng cao (advanced)

> Phần A–C cho bạn nền tảng để **làm việc**. Phần D cho bạn chiều sâu để **ra quyết định kiến trúc**
> và **giải thích được vì sao**. Đọc sau khi đã nắm A–C.

| # | File | Bạn sẽ trả lời được câu hỏi gì |
| --- | --- | --- |
| 15 | `15-react-internals-fiber-hooks-lanes.md` | Fiber là gì? Vì sao hook không gọi trong `if`? Vì sao `key` reset state? Lane hoạt động ra sao? |
| 16 | `16-error-boundaries-va-resilience.md` | Error boundary **không** bắt được gì? Phân loại lỗi thành hành động UI |
| 17 | `17-composition-headless-polymorphic.md` | Compound component, `render` prop + `mergeProps`, `data-slot` như API, headless |
| 18 | `18-custom-hooks-va-state-machines.md` | Thiết kế hook ở mức library; viết lại checkout thành FSM test được |
| 19 | `19-parallel-va-intercepting-routes.md` | Modal có URL riêng (share được); dashboard nhiều vùng lỗi độc lập |
| 20 | `20-route-handlers-streaming-realtime.md` | Khi nào cần `route.ts`; streaming; SSE theo dõi đơn hàng; webhook thanh toán |
| 21 | `21-typescript-nang-cao-cho-react.md` | Branded types chặn bug ID; discriminated union; validate response bằng Zod |
| 22 | `22-bundle-va-performance-engineering.md` | Đo cái gì thực sự ship; barrel file; `next/dynamic`; Web Vitals thật |
| 23 | `23-accessibility-engineering.md` | Focus trap, live region, `aria-current` — và 8 vấn đề a11y thật trong repo |
| 24 | `24-security-nang-cao.md` | CSRF trên Server Actions, IDOR, path traversal, CSP + nonce, taint API |

---

## Cách đọc hiệu quả

1. **Đọc tuần tự phần A trước.** Phần B giả định bạn đã hiểu concurrent rendering và Suspense.
2. **Mở song song file source được trích dẫn.** Mỗi đoạn code trong tài liệu đều ghi rõ đường dẫn thật.
3. **Chú ý các mục "Khi nào KHÔNG dùng".** Đây là phần phân biệt người biết API với người biết ra quyết định.
4. **Các mục ⚠️ là vấn đề thật đang tồn tại trong repo này** — dùng chúng như bài tập refactor.
5. **Phần D đọc sau, nhưng file `15` có thể đọc ngay sau `07`** — nó giải thích *vì sao* mọi quy tắc ở
   phần A là đúng, nên đọc sớm giúp phần A "dính" hơn.

### Lộ trình gợi ý theo mục tiêu

| Mục tiêu | Đọc |
| --- | --- |
| **Ôn nhanh để phỏng vấn** | `01` → `02` → `03` → `08` → `11` → `15` → `10` |
| **Nâng cấp repo này lên production-ready** | `14` (checklist) → `24` (security) → `23` (a11y) → `22` (perf) → `06` + `09` |
| **Hiểu sâu để thiết kế kiến trúc** | `15` → `18` → `17` → `21` → `08` → `19` |

## Quy ước trong tài liệu

- 🧠 **Mental model** — cách nghĩ trực giác, đọc trước khi xem code
- 📄 **Trong repo** — code thật, có đường dẫn file
- ⚠️ **Cạm bẫy / nợ kỹ thuật** — sai lầm thường gặp hoặc vấn đề đang có trong repo
- ⚖️ **Trade-off** — cái giá phải trả khi chọn giải pháp này
