# 01 — Concurrent Rendering: nền móng của mọi thứ từ React 18

> Đây là file **không có hook nào mới**, nhưng nếu bỏ qua nó, bạn sẽ không hiểu tại sao `useTransition`, `useDeferredValue`, `Suspense`, `useActionState`… lại hoạt động như vậy.
> Hãy coi nó là "định luật vật lý" của React hiện đại.

---

## 1. Overview — Tổng quan

### Vấn đề trước React 18

Trước React 18, render là **đồng bộ và không thể ngắt**. Khi `setState` xảy ra, React tính lại toàn bộ cây component bị ảnh hưởng rồi mới trả quyền điều khiển cho trình duyệt.

Hệ quả thực tế: bạn gõ một chữ vào ô tìm kiếm, và ô tìm kiếm đó phải **chờ** danh sách 5.000 sản phẩm lọc xong mới hiện chữ bạn vừa gõ. Gõ nhanh → UI giật, chữ hiện chậm.

```
Gõ "a" ──► render input + render 5000 item (200ms, KHÔNG ngắt được) ──► chữ "a" mới hiện
Gõ "b" ──► (phải đợi lần trên xong) ...
```

### React 18 giải quyết thế nào?

React 18 giới thiệu **concurrent rendering**: React có thể **bắt đầu** một lần render, **tạm dừng** giữa chừng để xử lý việc gấp hơn (như phím bạn vừa gõ), rồi **tiếp tục** hoặc **bỏ** lần render cũ.

Quan trọng: concurrent **không phải** là một chế độ bạn bật lên. Nó là một **khả năng** của engine, được kích hoạt khi bạn dùng các tính năng như `startTransition`, `useDeferredValue`, `Suspense`. Code cũ vẫn chạy y như trước.

---

## 2. Mental Model — Mô hình tư duy

### 🧠 Hai làn đường

Hãy tưởng tượng React có **hai làn đường** cho các cập nhật:

```
 Làn KHẨN CẤP (urgent)       │ gõ phím, click, hover
 ─────────────────────────────┼──────────────────────────────
 Làn KHÔNG GẤP (transition)   │ lọc danh sách, chuyển tab, tải trang mới
```

- Cập nhật ở **làn khẩn cấp** phải phản hồi ngay — người dùng cảm nhận được độ trễ 100ms.
- Cập nhật ở **làn không gấp** có thể chậm một chút, có thể bị **bỏ dở** nếu có cập nhật mới hơn.

Mặc định, mọi `setState` đi làn khẩn cấp. **Bạn** là người nói cho React biết cái nào thuộc làn không gấp — đó chính là vai trò của `startTransition` (file 02).

### 🧠 Render là "bản nháp", commit là "xuất bản"

React chia công việc thành 2 pha:

```
 Render phase (tính toán)          Commit phase (ghi vào DOM)
 ┌──────────────────────────┐      ┌──────────────────────┐
 │ gọi component function    │      │ cập nhật DOM thật     │
 │ so sánh cây cũ/mới        │ ───► │ chạy useLayoutEffect  │
 │ CÓ THỂ bị ngắt, làm lại   │      │ chạy useEffect        │
 │ hoặc vứt bỏ               │      │ KHÔNG BAO GIỜ bị ngắt │
 └──────────────────────────┘      └──────────────────────┘
```

Concurrent rendering chỉ ngắt được **render phase**. Hệ quả cực kỳ quan trọng:

> ⚠️ **Component function phải là hàm thuần (pure).** Vì React có thể gọi nó nhiều lần rồi vứt kết quả, mọi side effect trong thân component (gọi API, ghi `localStorage`, `console.log` đếm số lần) đều có thể chạy "thừa".

Side effect phải nằm trong `useEffect`, event handler, hoặc Action — những chỗ chỉ chạy sau khi commit hoặc do người dùng kích hoạt.

---

## 3. How It Works — Các thay đổi cụ thể của React 18

### 3.1 `createRoot` — cánh cửa vào concurrent

```tsx
// React 17
import ReactDOM from 'react-dom'
ReactDOM.render(<App />, document.getElementById('root'))

// React 18+
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<App />)
```

Chỉ khi dùng `createRoot` thì các tính năng concurrent mới hoạt động. **Trong Next.js bạn không bao giờ gọi hàm này** — Next tự lo (và dùng `hydrateRoot` cho trang render từ server).

### 3.2 Automatic Batching — gộp nhiều `setState` thành một lần render

```tsx
// React 17: chỉ gộp trong event handler của React.
// Trong setTimeout / Promise / native event → mỗi setState render 1 lần.
setTimeout(() => {
  setCount((c) => c + 1) // render
  setFlag((f) => !f)     // render lần nữa
}, 1000)

// React 18+: gộp ở MỌI nơi → chỉ 1 lần render
```

**Tại sao quan trọng?** Ít render hơn = nhanh hơn, và quan trọng hơn: không bao giờ có khoảnh khắc UI hiển thị trạng thái "nửa vời" (count đã tăng nhưng flag chưa đổi).

Hiếm khi bạn cần thoát khỏi batching (ví dụ: cần đọc DOM ngay sau `setState`). Khi đó dùng `flushSync`:

```tsx
import { flushSync } from 'react-dom'

flushSync(() => setItems(next)) // DOM đã cập nhật ngay sau dòng này
listRef.current?.lastElementChild?.scrollIntoView()
```

> ✅ `flushSync` là lối thoát hiểm, không phải công cụ hằng ngày. Nó tắt đi lợi ích hiệu năng của batching.

### 3.3 Suspense trên server — Streaming SSR & Selective Hydration

Trước React 18, SSR là "tất cả hoặc không có gì":

```
 Server: fetch MỌI dữ liệu ──► render MỌI HTML ──► gửi
 Client: tải MỌI JS ──► hydrate MỌI component ──► mới tương tác được
```

Một phần chậm (ví dụ khối bình luận) làm chậm cả trang.

React 18 cho phép `<Suspense>` hoạt động trên server:

```
 Server: gửi ngay khung trang + fallback ──► (bình luận xong) ──► stream tiếp HTML bình luận
 Client: hydrate từng phần độc lập, ưu tiên phần người dùng đang click
```

Đây chính là nền tảng của `loading.tsx` và streaming trong Next.js App Router (xem file 08).

### 3.4 Strict Mode chạy effect hai lần (chỉ ở dev)

Trong React 18+, ở môi trường development với `<StrictMode>` (Next.js App Router bật mặc định), React sẽ:

```
mount → chạy effect → GIẢ VỜ unmount (chạy cleanup) → mount lại → chạy effect lần nữa
```

**Tại sao React cố tình làm vậy?** Để chuẩn bị cho các tính năng như `<Activity>` (file 05) — nơi component có thể bị "ẩn" rồi "hiện" lại mà không mất state. Nếu effect của bạn không có cleanup đúng, bug sẽ lộ ra ngay ở dev thay vì ở production.

```tsx
// ❌ Bug lộ ra: kết nối 2 lần, không bao giờ đóng
useEffect(() => {
  const socket = connect(roomId)
}, [roomId])

// ✅ Đúng: effect nào mở thì cleanup đóng
useEffect(() => {
  const socket = connect(roomId)
  return () => socket.close()
}, [roomId])
```

> ⚠️ Câu hỏi hay gặp: "Sao API của tôi bị gọi 2 lần ở dev?" — Đây là tính năng, không phải bug. Đừng tắt Strict Mode; hãy viết cleanup, hoặc tốt hơn: đừng fetch trong `useEffect` khi đã có Server Components (file 06).

### 3.5 Các API mới cho thư viện

React 18 còn thêm `useSyncExternalStore` và `useInsertionEffect` — chủ yếu cho tác giả thư viện (Redux, Zustand, styled-components). Xem file 02.

---

## 4. When to Use — Khi nào bạn "dùng" concurrent rendering?

Bạn không bật nó trực tiếp. Bạn **dùng** nó khi:

- Có một cập nhật nặng làm chậm cập nhật nhẹ (lọc danh sách khi gõ) → `useTransition` / `useDeferredValue`.
- Muốn chuyển màn hình mà không hiện lại spinner cho phần đã có dữ liệu → transition + Suspense.
- Muốn trang hiện nhanh phần tĩnh trong khi phần chậm còn tải → Suspense + streaming.
- Gửi form và muốn có trạng thái pending tự động → Actions (React 19, xây trên transition).

## 5. When NOT to Use — Khi nào concurrent không giúp được gì?

- **Một component đơn lẻ tốn 500ms để render.** Concurrent cho phép *ngắt giữa các component*, không ngắt được *bên trong* một hàm JavaScript. Giải pháp là giảm việc (virtualize danh sách, memo, chia nhỏ), không phải transition.
- **Cập nhật input được kiểm soát (controlled input).** Không bao giờ bọc `setValue` của ô input trong `startTransition` — chữ sẽ hiện trễ hoặc nhảy con trỏ.
- **Vấn đề nằm ở network.** Concurrent không làm API nhanh hơn. Nó chỉ giúp UI không bị khóa trong lúc chờ.

## 6. Trade-offs — Đánh đổi

| Benefits | Costs |
| --- | --- |
| UI phản hồi ngay cả khi có render nặng | Component **bắt buộc** phải pure — side effect trong render sẽ gây bug khó lần |
| Batching tự động giảm số lần render | Đôi khi khó đoán chính xác lúc DOM được cập nhật (phải dùng `flushSync`) |
| Streaming SSR: trang hiện sớm từng phần | Mô hình tư duy phức tạp hơn: có "bản nháp" bị vứt bỏ |
| Strict Mode bắt bug cleanup sớm | Effect chạy 2 lần ở dev gây bối rối cho người mới |

**Tại sao những đánh đổi này tồn tại?** Để có quyền ngắt và làm lại, React phải được phép gọi component của bạn *bất kỳ lúc nào, bao nhiêu lần cũng được*. Cái giá là bạn mất quyền giả định "component chỉ chạy một lần cho mỗi lần cập nhật".

## 7. Best Practices

1. ✅ **Giữ component pure.** Kiểm tra nhanh: nếu React gọi hàm này 2 lần liên tiếp với cùng props, kết quả và thế giới bên ngoài có giống hệt không?
2. ✅ **Mọi effect có tài nguyên đều có cleanup.** Subscribe ↔ unsubscribe, setInterval ↔ clearInterval, connect ↔ close.
3. ✅ **Đừng tắt Strict Mode để "sửa" bug effect chạy 2 lần.** Bug vẫn còn, bạn chỉ không thấy nó nữa.
4. ✅ **Ưu tiên lấy dữ liệu ở Server Component** thay vì `useEffect` + `fetch` — tránh luôn vấn đề double-fetch và waterfall.

---

**Tiếp theo:** [02 — Các hook của React 18](./02-react18-hooks.md)
