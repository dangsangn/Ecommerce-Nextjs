# 31. Lộ trình Senior — 6 tháng, cụ thể

> **Mục tiêu:** biến 30 chương kiến thức thành **năng lực đã kiểm chứng**.
> Đây không phải chương kiến thức — nó là kế hoạch hành động, với repo này làm sân luyện.
>
> ⚠️ **Cảnh báo trung thực:** đọc file này không làm bạn thành senior. **Làm** những gì trong nó thì có.
> Và ngay cả vậy, 6 tháng là mốc để *đo lại*, không phải mốc để *tốt nghiệp*.

---

## 1. "Senior" thực sự là gì

### Định nghĩa của các công ty rất khác nhau

Một số nơi: senior = 5 năm kinh nghiệm + ship được feature. Nơi khác: senior = tự dẫn dắt một dự án
đa người, ra quyết định kiến trúc, và nâng trình cả team. **Cùng một chức danh, khác nhau gấp 3 lần
về kỳ vọng.**

Nên đừng đo mình theo chức danh. Đo theo **năng lực cụ thể**.

### Định nghĩa dùng được

> **Senior là người mà khi bạn giao một vấn đề mơ hồ, bạn không phải theo dõi họ nữa.**

Bóc tách ra thành năm năng lực:

| # | Năng lực | Biểu hiện cụ thể |
| --- | --- | --- |
| 1 | **Chiều sâu kỹ thuật** | Biết *vì sao*, không chỉ *thế nào*. Debug được thứ chưa từng gặp. |
| 2 | **Chiều rộng** | Đọc được code backend, hiểu DB/network/browser đủ để không đoán |
| 3 | **Phán đoán** | Quyết định đúng khi thông tin thiếu. Biết khi nào *không* làm gì. |
| 4 | **Giao tiếp & ảnh hưởng** | Viết design doc thuyết phục. Review code dạy được người khác. |
| 5 | **Giao hàng** | Chia nhỏ việc, ước lượng gần đúng, ship đều đặn, không để lại đống nợ. |

**Bộ 30 chương phủ mạnh #1, một phần #2, và không phủ #3–#5.** Đó là lý do có file này.

---

## 2. Tự đánh giá — bảng chấm điểm dùng được

Chấm mỗi dòng 0–3. Trung thực với chính mình; điểm cao giả không giúp gì.

- **0** = chưa từng làm
- **1** = biết lý thuyết, chưa làm
- **2** = đã làm 1-2 lần, cần tra lại
- **3** = làm được mà không cần tra, và giải thích được cho người khác

### Trục 1 — Chiều sâu kỹ thuật (tối đa 30)

| | Năng lực | Điểm |
| --- | --- | --- |
| 1 | Giải thích được vì sao render phải pure, ở mức Fiber | ___ |
| 2 | Nhìn một `useEffect` và nói được nó đúng hay sai, và vì sao | ___ |
| 3 | Quyết định được Server hay Client Component mà không đoán | ___ |
| 4 | Đặt được `<Suspense>` đúng chỗ, giải thích được lý do | ___ |
| 5 | Debug được hydration mismatch từ đầu đến cuối | ___ |
| 6 | Thiết kế được chiến lược cache + invalidation cho một tính năng mới | ___ |
| 7 | Viết được Server Action an toàn (validate + authz + revalidate đủ) | ___ |
| 8 | Dùng type để **chặn** một class bug, không chỉ để annotate | ___ |
| 9 | Tìm được nguyên nhân một trang chậm, có số liệu | ___ |
| 10 | Dùng bàn phím + screen reader để tự tìm bug a11y | ___ |

### Trục 2 — Chiều rộng (tối đa 24)

| | Năng lực | Điểm |
| --- | --- | --- |
| 11 | Giải thích event loop: macrotask vs microtask, và ví dụ thật | ___ |
| 12 | Giải thích rendering pipeline: layout/paint/composite | ___ |
| 13 | Biết vì sao `transform` rẻ hơn `top`, chứng minh bằng DevTools | ___ |
| 14 | Đọc được flame chart trong Chrome Performance | ___ |
| 15 | Tìm được memory leak bằng heap snapshot | ___ |
| 16 | Giải thích được HTTP/2 multiplexing và ảnh hưởng tới bundling | ___ |
| 17 | Đọc được code backend đủ để biết một endpoint làm gì | ___ |
| 18 | Nhận ra N+1 query khi đọc code hoặc log | ___ |

### Trục 3 — Phán đoán (tối đa 18)

| | Năng lực | Điểm |
| --- | --- | --- |
| 19 | Quyết định **không** làm một việc, và giải thích được | ___ |
| 20 | Ước lượng một task trong sai số 50% | ___ |
| 21 | Nhận ra khi một abstraction là quá sớm | ___ |
| 22 | Chọn được giải pháp "đủ tốt" thay vì "đúng nhất" khi có deadline | ___ |
| 23 | **Không đồng ý với một khuyến nghị trong 30 file này, và đúng** | ___ |
| 24 | Biết khi nào phải hỏi thay vì tự quyết | ___ |

### Trục 4 — Giao tiếp & ảnh hưởng (tối đa 18)

| | Năng lực | Điểm |
| --- | --- | --- |
| 25 | Viết được design doc mà người khác đọc và đồng ý (hoặc phản biện đúng chỗ) | ___ |
| 26 | Review code theo cách người nhận **học được**, không chỉ sửa | ___ |
| 27 | Giải thích trade-off kỹ thuật cho người không phải dev | ___ |
| 28 | Nói "không" hoặc "chưa" với PM mà vẫn giữ được quan hệ | ___ |
| 29 | Viết commit message / PR description mà 6 tháng sau đọc còn hiểu | ___ |
| 30 | Mentor được một người qua một task khó | ___ |

### Trục 5 — Giao hàng (tối đa 18)

| | Năng lực | Điểm |
| --- | --- | --- |
| 31 | Chia một tính năng lớn thành các PR nhỏ, mỗi cái deploy được | ___ |
| 32 | Ship được thứ gì đó ra production tuần này | ___ |
| 33 | Đã từng gây sự cố production và xử lý nó | ___ |
| 34 | Viết được test đủ để dám refactor | ___ |
| 35 | Dọn dẹp sau khi ship (xoá flag, xoá code cũ, cập nhật doc) | ___ |
| 36 | Biết khi nào dừng polish và ship | ___ |

### Đọc kết quả

| Tổng (max 108) | Vị trí | Nên làm gì |
| --- | --- | --- |
| < 40 | Mid-level, đang xây nền | Tập trung trục 1 + 5. Ship nhiều, đọc ít hơn. |
| 40–65 | Mid-senior | **Đây là chỗ phần lớn người đọc xong 30 file sẽ ở.** Trục 3 và 4 là điểm nghẽn. |
| 65–85 | Senior | Chọn hướng chuyên sâu (perf / a11y / architecture / DX) |
| > 85 | Senior+ / Staff-track | Đo bằng ảnh hưởng lên team, không phải kỹ năng cá nhân |

⚠️ **Chú ý phân bố điểm, không chỉ tổng.** 30/30 trục 1 và 3/18 trục 4 **không** phải senior — đó là
"kỹ thuật viên giỏi". Senior cần **đều**, vì công việc thật đòi hỏi cả năm trục cùng lúc.

---

## 3. Khoảng cách kiến thức → phán đoán

Đây là phần quan trọng nhất của chương.

### Vì sao đọc không tạo ra phán đoán

Mọi bảng "Trade-offs" và mục "When NOT to Use" trong 30 file là **phán đoán của tôi**, đã được đóng gói
sẵn. Bạn đọc và tiếp nhận. Nhưng phán đoán thật đòi hỏi ba thứ mà đọc không cho:

| Thành phần | Đọc cho được? | Cách có được |
| --- | --- | --- |
| **Biết các lựa chọn** | ✅ Có | 30 file này |
| **Biết cái giá thật của mỗi lựa chọn** | ⚠️ Một phần | Phải tự trả giá đó ít nhất một lần |
| **Biết ngữ cảnh nào nghiêng về đâu** | ❌ Không | Nhiều lần quyết định + thấy hậu quả |

Ví dụ cụ thể: tôi viết "branded types đáng dùng khi có ≥3 loại ID đi cạnh nhau" (file `21`).
Đó là một **heuristic tôi tin**, không phải chân lý. Cái giá thật gồm:

- 4 giờ migration (tôi đã ước lượng)
- Một khái niệm mới team phải học (tôi không biết team bạn)
- Xung đột với code bên thứ ba cần `as` cast (tôi không biết bạn dùng lib nào)
- Junior có thể `as ProductId` bừa để "cho compile" — làm mất hết lợi ích (tôi không lường được)

**Chỉ khi bạn tự làm mới biết cái nào trong 4 cái trên là vấn đề thật ở ngữ cảnh của bạn.**

### 🛠️ Bài tập số 1 — quan trọng nhất trong file này

**Tìm một khuyến nghị trong 30 file mà bạn KHÔNG đồng ý, và viết ra lý do.**

Dưới đây là 8 chỗ mà người có kinh nghiệm **hoàn toàn có thể phản biện đúng**. Tôi liệt kê chúng ra
vì đây là những chỗ tôi đưa ra khuyến nghị dựa trên heuristic chung, không phải chân lý:

| # | Khuyến nghị của tôi | Phản biện hợp lý |
| --- | --- | --- |
| 1 | Branded types cho ID (file `21`) | "Team 3 junior + deadline 2 tuần → thêm khái niệm mới là rủi ro lớn hơn bug ID." |
| 2 | FSM cho `checkout-wizard` (file `18`) | "Wizard 3 bước, 4 state. `useState` đọc trong 30 giây. FSM là 200 dòng + một file mới. Over-engineering." |
| 3 | `useOptimistic` cho giỏ hàng (file `07`) | "API là dạng delta (`oldQuantity`). Tôi vừa làm race condition dễ xảy ra hơn. **Sửa backend trước** mới đúng thứ tự." |
| 4 | Parallel routes cho modal (file `19`) | "8 file mới + 2 convention khó nhớ, cho một tính năng 'nice to have'. Lợi ích không xứng." |
| 5 | Zod validate mọi response (file `21`) | "30 dòng schema/type × 6 type = 180 dòng phải bảo trì song song với backend. Chỉ làm cho `Order` là đủ." |
| 6 | Lỗi inline thay toast (file `03`, `23`) | "Với hành động một-bước như 'Thêm vào giỏ', toast **tốt hơn** — nó không đẩy layout, và người dùng đang nhìn chỗ khác." |
| 7 | Server draft autosave (file `26`) | "Debounce 2s = 30 req/phút/người soạn. localStorage đủ 95% trường hợp với 0 chi phí server." |
| 8 | Defensive vs fail-fast (file `16`) | "Ở production, một order hiện thiếu sản phẩm còn tốt hơn một trang lỗi. Defensive **luôn** đúng ở tầng render." |

**Cách làm bài tập:**

1. Chọn **hai** trong tám cái trên (hoặc tìm cái khác)
2. Viết 200 từ: bạn không đồng ý ở điểm nào, và ở **ngữ cảnh nào** phản biện của bạn đúng
3. **Quan trọng:** cũng viết ngữ cảnh nào khuyến nghị của tôi đúng

Bước 3 là chỗ phân biệt "phản biện" với "phán đoán". Người mới thấy một câu trả lời đúng.
Senior thấy **điều kiện** làm mỗi câu trả lời đúng.

**Nếu bạn làm được bài tập này cho 2 mục, bạn đã có điểm 2–3 ở dòng #23 của bảng tự đánh giá.**

---

## 4. Lộ trình 24 tuần

### Nguyên tắc thiết kế lộ trình này

- **Mỗi tuần có một sản phẩm cụ thể** (PR đã merge, doc đã viết, số đã đo). Không có tuần nào chỉ "đọc".
- **Sửa trước, học sau.** Tháng 1-2 dùng kiến thức đã có. Tháng 3-4 mới bổ sung chiều rộng.
- **Trục 3-4-5 được luyện xen kẽ**, không dồn cuối.
- **Repo này là sân luyện**, nhưng nếu bạn có dự án ở công ty thì ưu tiên nó — ngữ cảnh thật giá trị hơn.

### Giai đoạn 1 (Tuần 1–8) — Biến kiến thức thành kỹ năng

| Tuần | Việc | Sản phẩm | Trục luyện |
| --- | --- | --- | --- |
| **1** | Sprint 1 + 5: 13 quick win ([file 14](14-kien-truc-testing-checklist.md) #1,2,4,5,26,32,33,35,37,38,43,56,60,61) | 3-4 PR nhỏ đã merge | 5 |
| **2** | Chạy `pnpm build`, ghi lại **mọi** số: bundle size, Lighthouse (LCP/CLS/TTFB/INP), waterfall `apiFetch` | Một file `docs/baseline-2026-08.md` | 1, 5 |
| **3–4** | **#54: E2E luồng mua hàng** + 3 keyboard test ([file 29](29-testing-e2e-va-tich-hop.md)) | CI xanh với 6 E2E test | 5 |
| **5** | **Hỏi backend 6 câu** (file 14, mục "Cần xác nhận"). Viết thành một message rõ ràng, không phải 6 câu rời rạc. | Một tin nhắn/issue + câu trả lời | **4** |
| **6–7** | Security sprint: #25 (path traversal), #29 (rate limit), #3 (validate file) | 3 PR + test cho từng cái | 1, 5 |
| **8** | A11y sprint: #27 (focus trap), #28 (`tabIndex`), #2 (`lang="vi"`), #33 (skip link). **Đo lại Lighthouse a11y.** | PR + số trước/sau | 1, 5 |

**Mốc cuối giai đoạn 1:** bạn có lưới an toàn (E2E), đã sửa mọi lỗ hổng đã biết, và có **số liệu**
chứng minh cải thiện. Đây là lúc đầu tiên bạn nói được "tôi đã làm X, kết quả đo được là Y".

### Giai đoạn 2 (Tuần 9–16) — Chiều rộng

Mỗi chủ đề có **bài tập xác minh** — không đọc rồi tin là đã hiểu.

| Tuần | Chủ đề | Bài tập xác minh |
| --- | --- | --- |
| **9** | **Event loop**: call stack, macrotask, microtask, `queueMicrotask` | Dự đoán thứ tự output của một đoạn có `setTimeout` + `Promise.then` + `await` **trước khi** chạy. Sai thì tìm hiểu lại. |
| **10** | **Rendering pipeline**: style → layout → paint → composite | Trong DevTools Performance, tìm một layout thrashing thật. Sửa nó. Đo lại. |
| **11** | **CSS layout**: containing block, stacking context, flex/grid algorithm | Giải thích được vì sao `position: sticky` của bạn không hoạt động (dựng một ca hỏng rồi tự chẩn đoán) |
| **12** | **Memory**: heap snapshot, detached node, closure leak | Tạo một leak cố ý trong repo (listener không cleanup), tìm nó bằng heap snapshot, sửa |
| **13** | **Network**: HTTP/1.1 vs 2 vs 3, TLS handshake, CDN, `Cache-Control` | Đo waterfall của `/` bằng DevTools Network. Giải thích **từng** request: vì sao nó tồn tại, có song song không |
| **14** | **DB cơ bản**: index, N+1, `EXPLAIN` | Đọc code `E-Commerce-NodeJS`. Tìm một query không có index hoặc một N+1. Báo cho backend team. |
| **15–16** | Áp dụng: **#42 FSM checkout** + **#44 Zod ở ranh giới** | 2 PR lớn + test. Đây là lúc kiểm chứng bài tập số 1 (bạn có còn đồng ý với tôi không?) |

⚠️ **Tuần 14 là tuần quan trọng nhất của giai đoạn 2.** Đọc code backend là kỹ năng senior FE thường
thiếu nhất — và nó thay đổi hoàn toàn cách bạn thiết kế frontend. Bạn sẽ hiểu vì sao
`PATCH /cart/quantity` nhận cả `oldQuantity` (nó tính delta để cập nhật tồn kho), và từ đó tự đánh giá
lại khuyến nghị `useOptimistic` của tôi.

### Giai đoạn 3 (Tuần 17–24) — Phán đoán & ảnh hưởng

| Tuần | Việc | Sản phẩm | Trục |
| --- | --- | --- | --- |
| **17–18** | **Viết một design doc thật** cho order tracking realtime ([file 20](20-route-handlers-streaming-realtime.md)). Mẫu ở mục 6 dưới. | Doc 2-3 trang, đưa cho ít nhất 1 người đọc | **4** |
| **19** | **Bài tập số 1** (mục 3): phản biện 2 khuyến nghị của tôi | 400 từ, tự lưu lại | **3** |
| **20** | **Review code người khác.** Nếu không có ai — review 5 commit cũ của chính bạn với con mắt hiện tại. | 5 review comment dạy được điều gì | **4** |
| **21–22** | Production readiness: #50 (validate env), #51 (Docker standalone), #52 (health check), #55 (structured log). **Deploy thật lên một VPS/Fly.io/Railway.** | App chạy ở URL thật | 2, 5 |
| **23** | **Bài tập ước lượng:** trước khi làm #53 (upload progress), viết ra ước lượng giờ. Làm. So sánh. Phân tích chênh lệch. | Một ghi chú "ước lượng vs thực tế" | **3** |
| **24** | **Tự đánh giá lại bảng ở mục 2.** So với lần đầu. Chọn hướng chuyên sâu. | Bảng điểm mới + kế hoạch 6 tháng tiếp | 3 |

**Mốc cuối:** bạn có một app đã deploy, một design doc, một bản phản biện có lý, và dữ liệu về khả năng
ước lượng của chính mình.

---

## 5. Chiều rộng — học gì và vì sao

Mỗi mục dưới đây **nối trực tiếp** với một chương trong bộ tài liệu. Đây không phải danh sách chung —
nó là những chỗ mà 30 chương **dựa vào** mà chưa giải thích.

### 5.1 Event loop — nền của file `15`

**Vì sao cần:** file `15` nói scheduler dùng `MessageChannel` vì `setTimeout` bị clamp 4ms.
Nếu bạn không hiểu macrotask/microtask, câu đó chỉ là một sự thật phải nhớ.

**Bài kiểm tra — dự đoán output trước khi chạy:**

```js
console.log('1')
setTimeout(() => console.log('2'), 0)
Promise.resolve().then(() => console.log('3'))
queueMicrotask(() => console.log('4'))
;(async () => {
  console.log('5')
  await null
  console.log('6')
})()
console.log('7')
```

<details>
<summary>Đáp án</summary>

`1, 5, 7, 3, 4, 6, 2`

- Sync: `1`, `5` (phần trước `await`), `7`
- Microtask theo thứ tự đăng ký: `3` (Promise.then), `4` (queueMicrotask), `6` (sau `await`)
- Macrotask: `2`

Nếu bạn sai, đây là chỗ cần học — nó ảnh hưởng tới cách bạn hiểu `useEffect` timing, `flushSync`,
và vì sao `await` trong Server Component không chặn cả server.
</details>

### 5.2 Rendering pipeline — nền của file `13` và `22`

**Vì sao cần:** file `22` nói CLS do ảnh thiếu `width`/`height`. Hiểu pipeline giải thích **vì sao**:
không có kích thước → browser phải **layout lại** khi ảnh về → mọi thứ dưới nó dịch chuyển.

**Bài tập:** trong DevTools Performance, tạo và tìm một layout thrashing:

```js
// Tạo thrashing cố ý: đọc → ghi → đọc → ghi (forced synchronous layout)
const els = document.querySelectorAll('.product-card')
els.forEach((el) => {
  const h = el.offsetHeight        // ĐỌC → buộc layout
  el.style.height = `${h + 1}px`   // GHI → invalidate layout
})
// → N lần layout thay vì 1

// Sửa: đọc hết trước, ghi hết sau
const heights = [...els].map((el) => el.offsetHeight)   // đọc hết
els.forEach((el, i) => { el.style.height = `${heights[i] + 1}px` })   // ghi hết
```

Chạy cả hai, xem Performance panel. Bạn sẽ thấy khác biệt rõ ràng — và **không bao giờ quên**.

### 5.3 CSS layout — nền của file `17`

**Vì sao cần:** file `17` dùng `display: contents`, `:has()`, container query, `group/name`.
Nếu bạn không hiểu containing block và stacking context, bạn không debug được khi chúng không hoạt động.

**Ba khái niệm phải nắm:**

| Khái niệm | Câu hỏi nó trả lời |
| --- | --- |
| **Containing block** | `position: absolute` định vị theo cái gì? Vì sao `%` của `height` không hoạt động? |
| **Stacking context** | `z-index: 9999` mà vẫn bị che? (`transform`, `opacity < 1`, `filter` tạo context mới) |
| **BFC** | Vì sao margin bị collapse? Vì sao float không được bọc? |

📄 Ứng dụng thật: `select.tsx` dùng `className="isolate z-50"`. `isolate` tạo stacking context mới —
để `z-50` của popup không xung đột với các `z-index` khác trên trang. **Đó là một quyết định có chủ
đích, và bạn cần hiểu stacking context để thấy nó.**

### 5.4 Memory — chỗ file `03` chỉ chạm bề mặt

**Vì sao cần:** file `03` nói "thiếu cleanup gây rò rỉ". Nhưng làm sao **tìm** một leak?

**Bài tập:**

1. Thêm một leak cố ý vào `seller-mobile-nav.tsx`: xoá `return () => document.removeEventListener(...)`
2. DevTools → Memory → Heap snapshot
3. Mở/đóng drawer 20 lần
4. Heap snapshot lần 2 → so sánh (Comparison view)
5. Tìm "Detached HTMLDivElement" tăng lên
6. Sửa, làm lại, xác nhận số không tăng

Sau bài tập này bạn có kỹ năng #15 trong bảng tự đánh giá.

### 5.5 Network — nền của file `20` và `22`

| Cần hiểu | Vì sao |
| --- | --- |
| HTTP/2 multiplexing | File `22`: vì sao "nhiều chunk nhỏ" ít tệ hơn trên HTTP/2 |
| Giới hạn 6 kết nối HTTP/1.1 | File `20`: vì sao SSE bị giới hạn |
| `Cache-Control` directives | File `20`, `28`: `private`, `no-store`, `s-maxage`, `stale-while-revalidate` |
| TLS handshake cost | File `22`: vì sao self-host font tốt hơn Google Fonts CDN |
| Preload / preconnect | Tối ưu LCP |

**Bài tập:** mở DevTools Network trên `/`, giải thích **từng** request: vì sao nó tồn tại, nó chặn gì,
có song song được không. Nếu có request nào bạn không giải thích được — đó là chỗ cần tìm hiểu.

### 5.6 Backend & DB — chỗ thiếu nhất

**Vì sao cần:** bạn không thể tối ưu `/product?keySearch=áo` mà không biết backend làm gì với nó.

📄 Repo có backend ngay bên cạnh: `../E-Commerce-NodeJS`. **Đọc nó.**

**Bài tập cụ thể, theo thứ tự:**

1. Tìm handler của `GET /product` — nó query gì? Có index trên field `keySearch` tìm không?
2. Tìm handler của `PATCH /cart/quantity` — nó dùng `oldQuantity` làm gì? (Câu trả lời quyết định
   `useOptimistic` có an toàn — file `07`)
3. Tìm `POST /order` — nó có transaction không? Nếu tạo order xong mà trừ tồn kho lỗi thì sao?
4. Tìm chỗ verify JWT — nó có kiểm tra ownership của product/order không? (Đây là câu #45 ở file `14`)
5. Tìm một N+1: có chỗ nào loop rồi query trong loop không?

**Năm câu này biến bạn từ "FE dev" thành "người hiểu hệ thống".** Và bạn tự trả lời được 3 trong 6
câu-cần-hỏi-backend ở file `14`.

---

## 6. Luyện giao tiếp — bài tập cụ thể

### 6.1 Design doc — mẫu dùng được

Đây là kỹ năng có đòn bẩy cao nhất cho senior. Bài tập tuần 17–18: viết doc cho order tracking realtime.

```markdown
# Design: Theo dõi trạng thái đơn hàng realtime

## 1. Vấn đề
Người dùng ở `/orders/:id` không biết đơn hàng đã đổi trạng thái. Họ phải tự F5.
[Số liệu nếu có: X% người dùng refresh trang order ≥3 lần trong một session]

## 2. Mục tiêu / Không phải mục tiêu
**Mục tiêu:** người dùng thấy trạng thái mới trong vòng 30 giây, không cần thao tác.
**KHÔNG phải mục tiêu:** chat với shop; thông báo push; theo dõi vị trí shipper trên bản đồ.

## 3. Các lựa chọn đã cân nhắc

| Lựa chọn | Ưu | Nhược | Chi phí |
| --- | --- | --- | --- |
| A. Polling `router.refresh()` 20s | Đơn giản nhất; 0 thay đổi backend | ~8.600 req/tab/2 ngày; trễ tới 20s | 2 giờ |
| B. SSE | Gần realtime; tự reconnect | Cần route handler; giới hạn 6 conn HTTP/1.1 | 2 ngày |
| C. WebSocket | Hai chiều, độ trễ thấp nhất | Không chạy trên serverless; cần hạ tầng riêng | 1 tuần |

## 4. Đề xuất
**Lựa chọn A trước.** Lý do: đáp ứng mục tiêu (30s), chi phí 2 giờ, không thay đổi hạ tầng.
Nếu đo được rằng polling gây tải backend đáng kể → nâng lên B.

## 5. Rủi ro
- Polling khi tab ẩn → đã xử lý bằng `document.visibilityState`
- Đơn hàng ở trạng thái terminal vẫn poll → đã xử lý bằng guard
- Tải backend: cần đo. Nếu >5% tổng request → chuyển sang B.

## 6. Cách đo thành công
- Số lần người dùng tự F5 trên `/orders/:id` giảm >50%
- Không tăng p95 latency của `/order/:id`
```

**Bốn thứ làm design doc tốt:**

| Phần | Vì sao quan trọng |
| --- | --- |
| **"Không phải mục tiêu"** | Ngăn scope creep. Đây là phần người mới hay bỏ. |
| **Các lựa chọn đã cân nhắc** | Chứng minh bạn đã nghĩ, không phải chọn cái đầu tiên nghĩ ra |
| **Đề xuất giải pháp ĐƠN GIẢN nhất đủ dùng** | Đề xuất giải pháp phức tạp nhất là dấu hiệu mid-level |
| **Cách đo thành công** | Không có nó, không ai biết đã xong hay chưa |

⚠️ **Chú ý đề xuất trong mẫu là lựa chọn A, không phải B** — dù file `20` dạy SSE chi tiết hơn.
Đó là chủ đích: **senior đề xuất giải pháp đơn giản nhất đáp ứng mục tiêu**, và giữ giải pháp phức tạp
làm phương án nâng cấp khi có số liệu.

### 6.2 Code review — dạy thay vì sửa

```markdown
❌ Review mid-level:
"Đừng dùng useEffect ở đây."

⚠️ Tốt hơn nhưng chưa đủ:
"useEffect này không cần thiết, tính trực tiếp được."

✅ Review senior:
"Chỗ này `addressComplete` có thể tính trực tiếp trong render:

    const addressComplete = address.street && address.city && ...

Với useEffect + setState, có 2 vấn đề: (1) một lần render thừa mỗi lần gõ,
(2) có một khoảng thời gian `addressComplete` chưa khớp với `address`.

Quy tắc chung mình hay dùng: nếu viết `useEffect` chỉ để `setState` từ một
state khác, thường là derived state — tính trực tiếp sẽ đúng hơn.

Không blocking nếu bạn thấy có lý do khác — cho mình biết nhé."
```

**Bốn thành phần:** code cụ thể → **vì sao** (2 hậu quả đo được) → quy tắc tổng quát → mở đường cho
phản biện.

Thành phần cuối quan trọng hơn bạn nghĩ: nó biến review từ "tôi đúng bạn sai" thành "cùng tìm giải
pháp" — và đôi khi bạn học được lý do bạn chưa biết.

### 6.3 Giải thích cho người không phải dev

**Bài tập:** giải thích bug tiền tệ (file `27`) cho PM, trong 3 câu, không dùng từ kỹ thuật.

```
❌ "toPriceString dùng toFixed(2) nên VND bị format sai."

✅ "Giá sản phẩm đang hiện là '250000.00' thay vì '250.000 ₫' — khách phải tự đếm
   số 0 để biết giá. Sửa mất khoảng 2 giờ, nhưng cần xác nhận với backend là
   giá đang lưu bằng đồng hay bằng nghìn đồng trước. Em nghĩ nên ưu tiên vì nó
   ở trên mọi trang có giá."
```

Bản thứ hai có: **tác động tới người dùng**, **chi phí**, **rủi ro/điều kiện**, và **đề xuất ưu tiên**.
Đó là bốn thứ PM cần để ra quyết định.

---

## 7. Luyện ước lượng

Đây là kỹ năng ít ai luyện có ý thức, và nó là khác biệt lớn giữa mid và senior.

### Phương pháp: ghi lại và so sánh

| Task | Ước lượng | Thực tế | Chênh | Nguyên nhân |
| --- | --- | --- | --- | --- |
| #1 Sửa open redirect | 30 phút | 1.5 giờ | **3×** | Quên phải viết test; phải tìm hết call site |
| #7 `next/image` cho product-card | 1 giờ | 4 giờ | **4×** | `remotePatterns` cần biết host thật; `sizes` phải khớp grid; phải đo lại Lighthouse |
| #54 E2E luồng mua hàng | 8 giờ | ? | ? | ? |

**Ba nguyên nhân chênh lệch phổ biến nhất** (ghi lại để nhận ra pattern của chính bạn):

1. **Quên việc phụ:** test, cập nhật doc, sửa call site khác, code review round 2
2. **Chưa biết cái mình chưa biết:** "chỉ cần đổi `<img>` thành `<Image>`" → phát hiện cần config,
   cần `sizes`, cần đo lại
3. **Blocked bởi người khác:** chờ backend trả lời (như #49 — không sửa được cho tới khi biết đơn vị tiền)

**Kỹ thuật thực dụng:** ước lượng xong, **nhân 2** cho task bạn đã làm loại tương tự, **nhân 3** cho
task chưa từng làm. Nghe như gian lận — nhưng dữ liệu của bạn sau 10 task sẽ cho thấy nó gần đúng.

---

## 8. Bốn dấu hiệu bạn đã tới

Không phải bằng cấp hay số năm. Bốn hành vi này:

**1. Bạn hỏi câu hỏi tốt hơn trước khi code.**

Trước: "làm sao thêm cache cho `/product`?"
Sau: "`/product` có bao nhiêu request/ngày? Nó chậm bao nhiêu? Ai invalidate nó? Có dữ liệu per-user
trong response không?"

**2. Bạn nói "không" và "chưa" có cơ sở.**

"Chưa nên làm optimistic cho giỏ hàng — API là dạng delta nên nó làm race condition dễ xảy ra hơn.
Sửa backend sang absolute trước, rồi optimistic là 3 giờ. Làm ngược lại là tạo bug."

**3. Bạn dự đoán được vấn đề trước khi nó xảy ra.**

Đọc một PR thêm cache: "cái này sẽ vỡ khi chúng ta scale lên 2 instance — cache nằm trên filesystem
của từng instance." (file `28`)

**4. Người khác đến hỏi bạn, và họ ra về với năng lực, không chỉ câu trả lời.**

Đây là dấu hiệu cuối cùng và mạnh nhất. Senior được đo bằng **đầu ra của team**, không phải đầu ra
của bản thân.

---

## 9. ⚠️ Ba cạm bẫy

### Cạm bẫy 1 — "Senior giả": biết nhiều, ship ít

Người đọc hết 30 file, biết mọi trade-off, nhưng **không hoàn thành được task** vì:
- Refactor mãi không xong ("chưa đủ tốt")
- Blocked vì muốn giải pháp hoàn hảo
- Tranh luận kiến trúc thay vì ship

**Dấu hiệu:** bạn giải thích được vì sao mọi cách đều có nhược điểm, nhưng không chọn được cách nào.

**Cách chữa:** đặt deadline cứng cho quyết định kỹ thuật. "Tôi có 30 phút để chọn giữa A và B, rồi
làm." Quyết định sai mà ship còn tốt hơn quyết định đúng mà không ship — vì bạn học được từ cái đầu.

### Cạm bẫy 2 — Áp dụng máy móc mọi khuyến nghị

30 file này có ~350 "Best Practices". **Áp dụng hết vào repo này là sai.** Nhiều cái xung đột nhau tuỳ
ngữ cảnh, và nhiều cái là over-engineering ở kích thước hiện tại.

**Cách chữa:** với mỗi khuyến nghị, hỏi "cái này giải quyết vấn đề nào mà TÔI đang có?" Nếu không trả
lời được — đừng làm. Đó chính là bài tập số 1 (mục 3).

### Cạm bẫy 3 — Chỉ luyện trục 1

Dễ nhất là học thêm kỹ thuật. Khó nhất là viết một design doc bị phản biện, hoặc nói "không" với PM.

**Nhưng trục 3-4 là điểm nghẽn thật của phần lớn người.** Nếu bảng tự đánh giá của bạn có trục 1 cao
mà trục 4 thấp — **đừng đọc thêm tài liệu kỹ thuật.** Viết một design doc và đưa cho ai đó đọc.

---

## 10. Sau 6 tháng — chọn hướng

Senior là điểm phân nhánh, không phải điểm đến. Bốn hướng phổ biến:

| Hướng | Nội dung | Chương liên quan |
| --- | --- | --- |
| **Performance** | Chuyên sâu Core Web Vitals, bundle, rendering, đo lường ở quy mô lớn | `13`, `15`, `22`, `25` |
| **Architecture** | Thiết kế hệ thống frontend nhiều team, monorepo, design system, migration | `08`, `17`, `18`, `21`, `30` |
| **DX / Platform** | CI/CD, tooling, codegen, developer productivity | `14`, `28`, `29`, `30` |
| **Product engineering** | Gần business nhất: A/B test, analytics, growth, tối ưu conversion | `07`, `22`, `23`, `27` |

**Không có hướng nào "tốt hơn".** Chọn theo cái bạn thấy hứng thú khi làm 8 giờ liên tục — vì đó là
thứ bạn sẽ giỏi nhất.

---

## 11. Việc cần làm ngay hôm nay

Đừng đọc lại file này. Làm ba việc sau, mất khoảng 2 giờ:

1. **Chấm bảng tự đánh giá ở mục 2.** Lưu lại kèm ngày. Bạn cần điểm gốc để so sánh sau 6 tháng.
2. **Chạy `pnpm build`** và ghi lại mọi số vào `docs/baseline-<ngày>.md`. Không có baseline thì không
   chứng minh được cải thiện.
3. **Bắt đầu Sprint 5** (7 việc, ~1 giờ code): #26 `lang="vi"`, #33 skip link, #37 font `latin-ext`,
   #38 log lỗi trong `errorMessage`, #32 `aria-current`, #35 `statusVariant` type, #43
   `prefers-reduced-motion`.

Bảy việc nhỏ đó là PR đầu tiên. Chúng không thay đổi gì lớn — nhưng chúng chuyển bạn từ **người đọc
tài liệu** sang **người sửa code**. Đó là bước duy nhất thực sự quan trọng.

---

## Tự kiểm tra

1. Năm trục của "senior" là gì? Bộ 30 chương phủ trục nào, không phủ trục nào?
2. Bạn chấm được bao nhiêu điểm ở mục 2? Trục nào thấp nhất?
3. Ba thành phần của phán đoán — cái nào đọc không cho được?
4. Bạn không đồng ý với khuyến nghị nào trong 30 file? Ở ngữ cảnh nào bạn đúng, ở ngữ cảnh nào tôi đúng?
5. Dự đoán output của đoạn code event loop ở mục 5.1 — bạn đúng không?
6. Bốn thành phần của một design doc tốt? Cái nào người mới hay bỏ?
7. Vì sao mẫu design doc ở mục 6.1 đề xuất polling chứ không phải SSE?
8. Bốn thành phần của một code review "dạy được"?
9. Ba nguyên nhân phổ biến làm ước lượng sai?
10. Ba cạm bẫy ở mục 9 — bạn đang có nguy cơ với cái nào?

---

➡️ Quay lại [README.md](README.md) · Checklist 62 phát hiện ở [file 14](14-kien-truc-testing-checklist.md)
