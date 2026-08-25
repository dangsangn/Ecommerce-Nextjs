# 15. React Internals — Fiber, Hooks, Lanes

> **Mục tiêu:** hiểu React *bên trong* để mọi quy tắc ở file `01`–`07` trở thành **hệ quả tất yếu**
> thay vì luật phải học thuộc. Sau chương này bạn sẽ tự suy ra được vì sao hook không gọi trong `if`,
> vì sao `key` reset state, và vì sao render phải pure.
>
> ⚠️ **Lưu ý về độ chính xác:** đây là mô hình khái niệm khớp với kiến trúc React 18/19. Tên biến và
> chi tiết triển khai có thể đổi giữa các bản minor — React không cam kết ổn định cho internals.
> Cái *không* đổi là các bất biến (invariant) mà chương này rút ra.

---

## 1. Overview

### Vấn đề: vì sao React phải viết lại reconciler?

React trước 16 dùng **Stack Reconciler**: đệ quy qua cây component bằng call stack của JavaScript.

```js
function reconcile(element) {
  const children = renderComponent(element)
  for (const child of children) {
    reconcile(child)          // ← đệ quy, dùng call stack
  }
}
```

Vấn đề cốt tử: **call stack không tạm dừng được.** Một khi bạn đã gọi `reconcile(root)`, không có cách
nào "dừng ở giữa, giữ lại vị trí, làm việc khác, rồi quay lại". Muốn dừng, bạn phải throw — mà throw
thì mất hết state trung gian.

Nếu render không tạm dừng được thì:
- Không có ưu tiên (mọi cập nhật bằng nhau)
- Không có `startTransition`
- Không có streaming SSR
- Không có Suspense thật

**Giải pháp của React 16+: tự triển khai một call stack riêng bằng linked list trên heap.**
Đó chính là **Fiber**.

---

## 2. Mental Model

### 🧠 Fiber = một khung stack (stack frame) lưu trên heap

Call stack của JS lưu ở đâu? Trong stack của engine — bạn không chạm được.
Fiber lưu ở đâu? Trong **object JavaScript thường** — bạn (React) toàn quyền kiểm soát.

```
Call stack (không kiểm soát được)       Fiber list (kiểm soát được)
┌────────────────────┐                  ┌──────────┐
│ reconcile(Item)    │                  │ Fiber:   │──child──▶ ┌──────────┐
├────────────────────┤                  │ Item     │           │ Fiber:   │
│ reconcile(List)    │  ◀── không thể   │          │◀─return───│ Text     │
├────────────────────┤      dừng giữa   └────┬─────┘           └──────────┘
│ reconcile(Page)    │                       │ sibling
└────────────────────┘                       ▼
                                        ┌──────────┐
                                        │ Fiber:   │
                                        │ Item     │
                                        └──────────┘
```

Vì cây fiber là data thường, React có thể:
- **Dừng** ở bất kỳ fiber nào (chỉ cần lưu con trỏ `workInProgress = fiber`)
- **Nhả** main thread cho browser
- **Tiếp tục** từ đúng chỗ đó
- Hoặc **bỏ luôn** cây đang dựng và bắt đầu lại

Đây là toàn bộ nền tảng của concurrent rendering. Mọi thứ ở file `01` chỉ là hệ quả của điều này.

---

## 3. Cấu trúc một Fiber

Một fiber là object với (đại khái) các field sau:

```ts
type Fiber = {
  // --- ĐỊNH DANH ---
  tag: WorkTag              // FunctionComponent | HostComponent | HostText | Fragment...
  type: any                 // function component, hoặc 'div', 'span'
  key: string | null        // key bạn truyền vào JSX

  // --- CÂY (thay thế cho call stack) ---
  return: Fiber | null      // "cha" — nơi quay về khi xong (giống return address!)
  child: Fiber | null        // con ĐẦU TIÊN
  sibling: Fiber | null      // em kế tiếp

  // --- TRẠNG THÁI ---
  stateNode: any            // DOM node thật (với HostComponent) hoặc null
  memoizedState: any        // ⭐ với FunctionComponent: ĐẦU của linked list hook
  memoizedProps: any        // props của lần render TRƯỚC
  pendingProps: any         // props của lần render NÀY
  updateQueue: any

  // --- CÔNG VIỆC CẦN LÀM ---
  flags: Flags              // Placement | Update | Deletion | Passive | Layout...
  subtreeFlags: Flags       // OR của flags trong toàn bộ cây con (để bỏ qua nhanh)
  lanes: Lanes              // ưu tiên của các update đang chờ trên fiber này
  childLanes: Lanes         // OR của lanes trong cây con

  // --- DOUBLE BUFFERING ---
  alternate: Fiber | null   // ⭐ fiber "song sinh" ở cây kia
}
```

**Chú ý ba field then chốt:**

**`return`** — chính là "return address" của một stack frame. Khi React xử lý xong một fiber và cây con
của nó, nó đi theo `return` để lên cha. Đây là cách React "pop stack" mà không dùng call stack.

**`child` + `sibling`** — cây được biểu diễn dạng **linked list**, không phải array con. Một node chỉ
trỏ tới con **đầu tiên**; các con còn lại nối với nhau qua `sibling`.

```
        <div>
       /  |  \
     <a> <b> <c>

Fiber:  div ──child──▶ a ──sibling──▶ b ──sibling──▶ c
                       │              │              │
                       └──return──────┴──return──────┘──▶ div
```

Vì sao linked list mà không phải array? Vì để duyệt được **incremental**: chỉ cần giữ một con trỏ là
biết đang ở đâu và đi đâu tiếp. Với array, bạn cần lưu cả index của mọi tầng.

**`alternate`** — sẽ giải thích ở mục tiếp.

---

## 4. ⭐ Double Buffering: `current` vs `workInProgress`

React giữ **hai** cây fiber cùng lúc:

```
        FiberRoot
        ├── current ──────────▶ Cây ĐANG hiển thị trên màn hình
        └── (workInProgress) ─▶ Cây ĐANG được dựng
                 ▲                        ▲
                 └────── alternate ───────┘
                     (trỏ lẫn nhau)
```

Khi có update, React **không sửa cây `current`**. Nó tạo/tái dùng cây `workInProgress`:

```
Bắt đầu render:
   current: [App] ─▶ [List] ─▶ [Item]        ← trên màn hình, KHÔNG bị chạm
   WIP:     [App'] ─▶ [List'] ─▶ [Item']     ← đang dựng (clone từ alternate)

Commit (một lệnh duy nhất):
   root.current = WIP                          ← "hoán đổi con trỏ"
   Cây cũ trở thành WIP cho lần sau (tái dùng object → ít GC)
```

**Ba hệ quả cực kỳ quan trọng:**

**(1) Đây là vì sao render có thể bị BỎ mà không hậu quả.** Nếu một update ưu tiên cao xen vào giữa,
React chỉ cần vứt cây `workInProgress` — cây `current` chưa bị chạm gì, màn hình vẫn đúng.

Nhớ lại mô hình "bản nháp có thể xé" ở file `01`? **Cây `workInProgress` chính là bản nháp đó.**
Không phải ẩn dụ — nó đúng là một cây riêng trên heap.

**(2) Đây là vì sao commit phải đồng bộ và không ngắt được.** Việc `root.current = WIP` cùng với việc
áp thay đổi vào DOM phải diễn ra **nguyên tử**. Ngắt giữa commit = DOM ở trạng thái nửa vời.

**(3) Đây là vì sao mutate props/state trong render là bug.** Bạn đang sửa dữ liệu mà **cây `current`
đang dùng**. Nếu render bị bỏ, cây `current` giờ trỏ vào dữ liệu đã bị sửa — trạng thái không nhất quán
và không có cách nào hoàn tác.

```tsx
// ❌ Vì sao đây là bug ở mức internals
function Bad({ items }: { items: Item[] }) {
  items.sort((a, b) => a.price - b.price)    // mutate array của props!
  return <List items={items} />
}
// Nếu render này bị bỏ giữa chừng: `items` đã bị sắp xếp lại,
// nhưng cây current vẫn đang hiển thị theo thứ tự cũ.
// Lần render sau bắt đầu từ dữ liệu đã sai.

// ✅ Copy trước khi sắp xếp
function Good({ items }: { items: Item[] }) {
  const sorted = [...items].sort((a, b) => a.price - b.price)
  return <List items={sorted} />
}
```

📄 Repo này làm đúng ở mọi chỗ. `lib/checkout/build-shop-orders.ts`:

```tsx
export function buildShopOrders(products: CartProduct[]): ShopOrderItem[] {
  const byShop = new Map<string, ShopOrderItem>()
  for (const p of products) {
    const shopId = p.shopId ?? ''
    let group = byShop.get(shopId)
    if (!group) {
      group = { shopId, shop_discounts: [], item_products: [] }
      byShop.set(shopId, group)
    }
    group.item_products.push({ productId: p.productId, quantity: p.quantity, price: toPriceNumber(p.price) })
  }
  return [...byShop.values()]
}
```

Nó **đọc** `products`, **tạo** structure mới, **không** chạm vào input. `lib/comments/group.ts` cũng vậy:
tạo `topLevel` và `repliesByParent` mới, chỉ push **reference** của comment vào — không sửa comment nào.

---

## 5. ⭐ Hooks là một Linked List trên Fiber

Đây là phần giải thích được nhiều quy tắc nhất.

### Cấu trúc

```ts
type Hook = {
  memoizedState: any        // giá trị hiện tại (state, hoặc deps của useMemo, hoặc destroy fn...)
  baseState: any
  queue: UpdateQueue | null // hàng đợi update (với useState/useReducer)
  next: Hook | null         // ⭐ hook TIẾP THEO trong cùng component
}
```

Và `fiber.memoizedState` trỏ tới **hook đầu tiên**.

### Điều gì xảy ra khi component render

Giả sử component này:

```tsx
'use client'
export function CartLine({ product }: { product: CartProduct }) {
  const [qtyState, qtyAction] = useActionState(updateCartQuantityAction, initialActionState)  // hook #1
  const [rmState, rmAction] = useActionState(removeFromCartAction, initialActionState)        // hook #2

  useEffect(() => { /* toast qtyState */ }, [qtyState])                                        // hook #3
  useEffect(() => { /* toast rmState */ }, [rmState])                                          // hook #4
  // ...
}
```

Sau lần render đầu (mount), fiber trông thế này:

```
Fiber(CartLine).memoizedState
        │
        ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ Hook #1 │───▶│ Hook #2 │───▶│ Hook #3 │───▶│ Hook #4 │───▶ null
   │ qtyState│    │ rmState │    │ effect  │    │ effect  │
   └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

**Chú ý: không có tên nào cả.** Không có `"qtyState"`, không có `"rmState"`. Chỉ là **thứ tự trong
linked list**.

### Cách React "khớp" hook giữa các lần render

Khi render lại, React đặt một con trỏ về đầu list và đi tuần tự:

```
Render lần 2:
  currentHook = fiber.alternate.memoizedState    // hook #1 của lần trước

  useActionState(...)  → lấy currentHook, currentHook = currentHook.next   // giờ ở #2
  useActionState(...)  → lấy currentHook, currentHook = currentHook.next   // giờ ở #3
  useEffect(...)       → lấy currentHook, currentHook = currentHook.next   // giờ ở #4
  useEffect(...)       → lấy currentHook, currentHook = currentHook.next   // giờ ở null
```

**Việc khớp hoàn toàn dựa vào SỐ LẦN GỌI, theo đúng THỨ TỰ.**

### Từ đó suy ra Rules of Hooks — không cần học thuộc

**Quy tắc 1: Không gọi hook trong điều kiện.**

```tsx
// ❌ Vì sao vỡ, ở mức internals
function Bad({ showToast }: { showToast: boolean }) {
  const [a, setA] = useState(1)           // hook #1
  if (showToast) {
    useEffect(() => toast('hi'))          // hook #2 — CHỈ KHI showToast = true
  }
  const [b, setB] = useState(2)           // hook #2 hoặc #3 (!!)
}
```

```
Render 1 (showToast = true):     Render 2 (showToast = false):
  #1 = state a                     #1 = state a         ✅ khớp
  #2 = effect                      #2 = state b   ← đọc hook #2 (là EFFECT của lần trước!)
  #3 = state b                     #3 = (không có)
```

Ở render 2, `useState(2)` đọc vào slot của một `useEffect`. `memoizedState` của effect là một object
`{ destroy, deps, tag }`, không phải số `2`. Nên `b` trở thành object đó.

React phát hiện được và throw:
```
Error: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
```

Nhưng trong các trường hợp phức tạp hơn, nó có thể **không** phát hiện được và bạn nhận giá trị rác.

**Quy tắc 2: Không gọi hook sau `return` sớm.** Cùng lý do — số lần gọi thay đổi.

**Quy tắc 3: Không gọi hook trong loop có số vòng thay đổi.** Cùng lý do.

**Và quy tắc ngược lại — điều BẠN ĐƯỢC PHÉP làm:**

Gọi cùng một hook **nhiều lần** trong cùng component là hoàn toàn ổn, vì mỗi lần gọi tạo một slot riêng:

📄 `components/products/edit-product-form.tsx`:

```tsx
const [detailsState, detailsAction] = useActionState(updateProductAction, initialActionState)
const [imagesState, imagesAction] = useActionState(addProductImagesAction, initialActionState)
```

Hai `useActionState` → hai slot độc lập → hai state riêng. **Không xung đột.**

Cùng lý do, custom hook gọi nhiều lần cũng ổn:

```tsx
useActionToast(detailsState)    // effect ở slot #k
useActionToast(imagesState)     // effect ở slot #k+1
```

`useActionToast` chỉ là "một lời gọi `useEffect`" khi React đếm slot. Custom hook **không phải một
đơn vị** ở tầng internals — nó chỉ là inline function được gọi ra.

### `useState` chỉ là `useReducer` với reducer mặc định

Ở mức internals:

```js
function basicStateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action
}
// useState(init) ≈ useReducer(basicStateReducer, init)
```

**Đây là lời giải thích ở mức cơ chế cho quy tắc "dùng updater function"** ở file `02`:

```tsx
setCount(5)              // action = 5        → reducer trả 5
setCount(c => c + 1)     // action = function → reducer trả action(state) = state + 1
```

Với `setCount(5)`, giá trị là hằng số — bất kể queue có bao nhiêu update trước đó.
Với `setCount(c => c + 1)`, reducer nhận **state đã tích lũy từ các update trước trong queue**.

### Update Queue là một circular linked list

```tsx
setCount(c => c + 1)     // update A
setCount(c => c + 1)     // update B
setCount(c => c + 1)     // update C
```

```
hook.queue.pending ──▶ C ──next──▶ A ──next──▶ B ──next──▶ (về C)
                       ▲                                    │
                       └────────────────────────────────────┘
                     (circular; `pending` trỏ vào phần tử CUỐI,
                      nên `pending.next` là phần tử ĐẦU — thêm vào cuối là O(1))
```

Khi render, React đi từ `pending.next` (= A) và **áp lần lượt**:

```
state = 0
A: 0 → 1
B: 1 → 2
C: 2 → 3      → memoizedState = 3 ✅
```

Đây chính là **automatic batching** ở mức internals (file `01`): ba `setState` chỉ nối thêm vào queue.
Việc *xử lý* queue xảy ra một lần, trong một lần render.

---

## 6. ⭐ `key` reset state — giải thích ở tầng Fiber

Nhớ lại file `02`: đổi `key` thì state reset. Giờ ta hiểu được **vì sao**.

Trong hàm reconcile con, React so khớp fiber cũ với element mới bằng **`key` + `type`**:

```js
// Rút gọn cực nhiều từ reconcileChildFibers
function updateSlot(returnFiber, oldFiber, newChild) {
  if (oldFiber !== null && oldFiber.key === newChild.key) {
    if (oldFiber.elementType === newChild.type) {
      // ✅ TÁI DÙNG fiber → giữ memoizedState → giữ nguyên linked list hook
      return useFiber(oldFiber, newChild.props)
    }
  }
  // ❌ key hoặc type khác → fiber cũ bị xoá, tạo fiber MỚI
  return null   // → createFiberFromElement(newChild)  → memoizedState = null
}
```

**`memoizedState = null` nghĩa là linked list hook bắt đầu lại từ đầu.** Toàn bộ `useState`,
`useRef`, `useActionState` được khởi tạo lại từ giá trị initial.

Vậy nên:

```tsx
// Đổi key → fiber mới → memoizedState = null → state reset
<EditForm key={product._id} product={product} />
```

Và điều này cũng giải thích **hai** hiện tượng khác:

**(a) Vì sao `key` trong list quan trọng đến vậy.** 📄 `app/(store)/orders/page.tsx`:

```tsx
{orders.map((o) => <OrderCard key={o._id} order={o} />)}
```

Nếu dùng `key={index}` và một order bị xoá ở giữa:

```
Trước:  key=0 → order A,  key=1 → order B,  key=2 → order C
Xoá B:  key=0 → order A,  key=1 → order C
```

Fiber ở `key=1` được **tái dùng** (key khớp, type khớp) nhưng props giờ là order C. Nếu `OrderCard` có
state nội bộ (ví dụ "đang mở chi tiết"), state của B **dính vào** C.

Với `key={o._id}`, fiber của B bị xoá đúng cách và fiber của C giữ nguyên identity.

**(b) Vì sao đổi `type` cũng reset state.**

```tsx
// ❌ Cùng vị trí nhưng type khác nhau → fiber bị thay → state mất
{isEditing ? <Input value={v} /> : <Textarea value={v} />}
```

Ngay cả không có `key`, `elementType` khác (`'input'` vs `'textarea'`) làm fiber bị xoá và tạo lại.
Đây là lý do state (và focus, và scroll position) bị mất khi bạn đổi element type có điều kiện.

**(c) Vì sao unmount = mất state** (file `02`, ca `discount_product_ids`). Fiber bị xoá khỏi cây →
object fiber bị GC → linked list hook đi cùng nó.

Và vì sao `<Activity mode="hidden">` giữ được state: fiber **vẫn ở trong cây**, chỉ bị đánh dấu là
ẩn. `memoizedState` còn nguyên.

---

## 7. Lanes — hệ thống ưu tiên

### Lane là một bitmask

React biểu diễn ưu tiên bằng một số nguyên 31 bit, mỗi bit là một "lane":

```js
const NoLanes                = 0b0000000000000000000000000000000
const SyncLane               = 0b0000000000000000000000000000010
const InputContinuousLane    = 0b0000000000000000000000000001000
const DefaultLane            = 0b0000000000000000000000000100000
const TransitionLane1        = 0b0000000000000000000000010000000
const TransitionLane2        = 0b0000000000000000000000100000000
// ... 16 transition lanes
const RetryLane1             = 0b0000010000000000000000000000000
const IdleLane               = 0b0100000000000000000000000000000
const OffscreenLane          = 0b1000000000000000000000000000000
```

**Vì sao bitmask mà không phải số nguyên đơn giản?** Vì một fiber có thể có **nhiều** update đang chờ ở
**nhiều** mức ưu tiên khác nhau cùng lúc. Bitmask cho phép:

```js
fiber.lanes = SyncLane | TransitionLane1      // có cả update gấp VÀ update transition
                                               // đang chờ trên fiber này

// Kiểm tra "có việc gấp không?" — một phép AND
if (fiber.lanes & SyncLane) { /* ... */ }

// Gộp ưu tiên của cây con — một phép OR
fiber.childLanes = child1.lanes | child1.childLanes | child2.lanes | ...

// Chọn lane cao nhất để làm — lấy bit thấp nhất (bit càng thấp, ưu tiên càng cao)
const highest = lanes & -lanes
```

Mọi phép trên đều là **một lệnh CPU**. Đây là lý do React dùng bitmask: kiểm tra ưu tiên xảy ra hàng
nghìn lần mỗi lần render.

### Lane được gán từ đâu

| Nguồn update | Lane | Ví dụ trong repo |
| --- | --- | --- |
| Discrete event (click, keydown, submit) | `SyncLane` | Bấm "Reply" → `setReplyOpen` |
| Continuous event (mousemove, scroll, drag) | `InputContinuousLane` | — |
| `setState` thường (trong effect, timeout, promise) | `DefaultLane` | `setUploadResult` từ effect của `ImageUploader` |
| `startTransition` / form action | `TransitionLane*` | `<form action={formAction}>` |
| Suspense retry | `RetryLane*` | Comments stream xong |
| `useDeferredValue` (phần trễ) | Transition lane | — |
| `<Activity mode="hidden">` | `OffscreenLane` | — |

**Đây là lời giải thích ở tầng cơ chế cho cảnh báo ở file `07`:**

> *"Đừng bọc `setState` của input vào `startTransition`."*

Vì `startTransition` **hạ** update từ `SyncLane` xuống `TransitionLane` — tức là bạn tự tay đưa cái
gấp nhất vào làn chậm.

Và nó cũng giải thích vì sao `<form action={serverAction}>` tự động cho bạn `isPending`: React bọc
việc gọi action trong một transition lane, và `useFormStatus`/`useActionState` đọc trạng thái của lane đó.

### Work loop: chỗ "ngắt được" thực sự xảy ra

```js
// Chế độ concurrent — CÓ THỂ NGẮT
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress)
  }
}

// Chế độ sync — KHÔNG NGẮT (dùng cho SyncLane)
function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress)
  }
}
```

**Toàn bộ concurrent rendering nằm ở `&& !shouldYield()`.** Một điều kiện, trong một vòng `while`.

`shouldYield()` trả `true` khi time slice (~5ms) đã hết. Khi đó:
1. Vòng lặp thoát
2. `workInProgress` **vẫn trỏ vào fiber đang xử lý** (đây là lý do fiber phải ở trên heap)
3. React nhả main thread → browser xử lý input, paint, chạy các task khác
4. Scheduler đặt lại một callback để tiếp tục

### Scheduler dùng `MessageChannel`, không phải `requestIdleCallback`

```js
// Đại ý của scheduler
const channel = new MessageChannel()
channel.port1.onmessage = performWorkUntilDeadline
function schedulePerformWorkUntilDeadline() {
  channel.port2.postMessage(null)
}
```

**Vì sao `MessageChannel` mà không phải `setTimeout(fn, 0)`?** Vì browser áp **clamping tối thiểu 4ms**
cho `setTimeout` lồng nhau. Với time slice 5ms, mất 4ms cho mỗi lần schedule là không chấp nhận được.
`postMessage` tạo một macrotask mà không bị clamp.

**Vì sao không `requestIdleCallback`?** Vì nó chỉ chạy khi browser **rảnh** — có thể không bao giờ chạy
nếu trang đang bận. React cần đảm bảo công việc *sẽ* tiến triển, chỉ là nhường chỗ cho việc gấp hơn.

**Vì sao không `requestAnimationFrame`?** Vì rAF gắn với nhịp paint (16.7ms). React muốn làm việc cả
khi không cần paint.

### Lane entanglement — chi tiết tinh vi

Nếu hai update ở hai lane khác nhau nhưng **cùng chạm vào một state**, React có thể phải "vướng"
(entangle) chúng để không tạo ra trạng thái không nhất quán:

```tsx
// Nếu render với transition lane hoàn tất TRƯỚC sync update,
// người dùng có thể thấy state mới của B với state cũ của A → không nhất quán
startTransition(() => setFilter('x'))   // transition lane
setCount(c => c + 1)                     // sync lane, nhưng liên quan tới cùng cây
```

React theo dõi điều này và có thể nâng transition lane lên để xử lý cùng lượt.

**Ý nghĩa thực tế cho bạn:** đây là lý do bạn **không nên** dựa vào "transition chắc chắn hoàn thành
sau sync". Đừng viết logic phụ thuộc vào thứ tự hoàn tất của các lane.

---

## 8. Beginwork / Completework và cơ chế Bailout

### Một unit of work

```js
function performUnitOfWork(unitOfWork) {
  const next = beginWork(unitOfWork)      // đi XUỐNG: render component, tạo fiber con
  if (next === null) {
    completeUnitOfWork(unitOfWork)         // đi LÊN: hoàn tất, sang sibling hoặc lên cha
  } else {
    workInProgress = next
  }
}
```

Cây được duyệt theo **depth-first**:

```
       App
      /   \
   Header  Main
            |
          List
          /  \
       Item  Item

Thứ tự: App↓ Header↓ Header↑ Main↓ List↓ Item↓ Item↑ Item↓ Item↑ List↑ Main↑ App↑
        (↓ = beginWork, ↑ = completeWork)
```

Chú ý: **giữa BẤT KỲ hai bước nào, React đều có thể dừng.** Đó là ý nghĩa của "interruptible".

### Bailout — vì sao memo hoá hoạt động

Trong `beginWork`:

```js
function beginWork(current, workInProgress, renderLanes) {
  if (current !== null) {
    const oldProps = current.memoizedProps
    const newProps = workInProgress.pendingProps

    if (oldProps === newProps && !hasContextChanged()) {
      // props IDENTICAL (===) và không có update đang chờ trên fiber này
      if (!includesSomeLane(renderLanes, workInProgress.lanes)) {
        // ⭐ BAILOUT: bỏ qua fiber này
        return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes)
      }
    }
  }
  // ... render component bình thường
}
```

Và trong `bailoutOnAlreadyFinishedWork`:

```js
if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
  return null      // ⭐ BỎ QUA TOÀN BỘ CÂY CON — không cần đi xuống chút nào
}
```

**Đây là lời giải thích ở tầng cơ chế cho file `04`:**

- `oldProps === newProps` là so sánh **reference của object props**. React tự động bailout khi element
  giống hệt (ví dụ `children` không đổi vì cha bailout).
- `memo(Component)` thêm một bước: so **shallow từng key** của props thay vì so reference object.
  Đó là vì sao `config={{a:1}}` (object mới mỗi render) làm `memo` miss — không có key nào `===` key cũ.
- `childLanes` là lý do bailout có thể bỏ qua **cả cây con** trong một phép AND. Nếu không có update
  nào ở dưới, không cần duyệt xuống.

**Và đây cũng là lời giải thích cho "hằng số ở tầng module":**

```tsx
// Ở tầng module: NAV_ITEMS luôn là CÙNG một reference
export const NAV_ITEMS: SellerNavItem[] = [...]

// Trong component: array MỚI mỗi render → nếu truyền làm prop, phá bailout
function Bad() {
  const items = [...]
}
```

📄 `components/seller/nav-items.ts` giữ nó ở tầng module — và `SellerSidebar` **import** nó thay vì
nhận qua prop, nên vấn đề reference thậm chí không phát sinh.

---

## 9. StrictMode double-invoke — cơ chế thật

Nhớ lại file `01`: StrictMode gọi component hai lần và chạy effect `setup → cleanup → setup`.

**Ở mức internals:** React chạy `renderWithHooks` hai lần, nhưng lần thứ hai dùng
`HooksDispatcherOnMountInDEV` với các hook đã được reset. Mục đích là **so sánh**: nếu hai lần render
cho ra kết quả khác nhau, component không pure.

Với effect, React thực sự thực hiện một chu kỳ mount/unmount/mount đầy đủ trên cây — mô phỏng điều
sẽ xảy ra khi `<Activity>` ẩn rồi hiện lại một cây, hoặc khi Suspense re-mount một boundary.

**Nghĩa là:** StrictMode không phải một bài test nhân tạo. Nó mô phỏng những tình huống **thật sự
xảy ra** trong concurrent rendering. Effect nào không chịu được nó sẽ vỡ trong production — chỉ là
ngẫu nhiên và khó tái hiện hơn.

📄 Đây là lý do pattern trong `components/seller/seller-mobile-nav.tsx` là quan trọng, không phải
tuỳ chọn:

```tsx
useEffect(() => {
  if (!open) return
  const prev = document.body.style.overflow      // ← lưu, không giả định
  document.body.style.overflow = 'hidden'
  return () => {
    document.body.style.overflow = prev          // ← khôi phục đúng cái đã lưu
  }
}, [open])
```

---

## 10. Server Components ở tầng cơ chế

Server Component **không có fiber trên client.** Đây là điểm khác biệt nền tảng.

```
SERVER                                          CLIENT
──────                                          ──────
Chạy Server Component
  │
  ▼
Tạo RSC payload (một stream các dòng):
  0:["$","div",null,{"children":[
      ["$","h1",null,{"children":"Orders"}],
      ["$","$L1",null,{"orderId":"abc"}]      ← con trỏ tới Client Component
    ]}]
  1:I["./cancel-order-button.tsx",["chunk-x"],"CancelOrderButton"]
  │
  └──────────────────────▶  Parse payload
                              │
                              ├─ "div", "h1" → tạo fiber HostComponent
                              │                (KHÔNG có function component nào để gọi)
                              │
                              └─ $L1 → tải chunk-x, tạo fiber FunctionComponent
                                       cho CancelOrderButton → hook list được tạo
```

**Ba hệ quả:**

**(1) Vì sao Server Component không có hook.** Không có fiber trên client → không có
`fiber.memoizedState` → không có chỗ lưu linked list hook. `useState` trong Server Component không
phải "bị cấm bởi lint rule" — nó **không có nơi để tồn tại**.

**(2) Vì sao props phải serialize được.** Chúng phải đi qua stream dạng text. Xem lại file `08` —
giờ bạn thấy `$L1` và `I[...]` chính là cơ chế đó.

**(3) Vì sao soft navigation giữ được state của Client Component.** Server gửi RSC payload mới,
React **reconcile** nó vào cây fiber hiện tại. Fiber của Client Component có cùng key + type →
**tái dùng** → `memoizedState` (hook list) còn nguyên.

Đây là lời giải thích cho file `13`: `SellerMobileNav` giữ `open` khi navigate vì fiber của nó không
bị thay thế — chỉ props từ payload mới được áp vào.

---

## 11. Cách tự khám phá internals

Bạn có thể xem fiber thật ngay trong browser:

```js
// Trong DevTools console, sau khi chọn một element ở tab Elements ($0)
const key = Object.keys($0).find(k => k.startsWith('__reactFiber$'))
const fiber = $0[key]

fiber.type                    // component function hoặc tag name
fiber.memoizedProps           // props hiện tại
fiber.memoizedState           // ⭐ hook đầu tiên (với function component)
fiber.memoizedState?.next     // hook thứ hai
fiber.return.type             // component cha
fiber.child?.type             // con đầu tiên
fiber.alternate               // fiber song sinh ở cây kia
fiber.lanes.toString(2)       // lanes ở dạng binary
```

**Bài tập:** mở `/cart` của repo này, chọn một `<div>` của `CartLine`, rồi đi lên fiber của
`CartLine` và đếm hook list:

```js
let h = fiber.memoizedState, i = 0
while (h) { console.log(`hook #${++i}`, h.memoizedState); h = h.next }
```

Bạn sẽ thấy đúng 4 hook (2 `useActionState`, 2 `useEffect`) theo đúng thứ tự trong code.

**Công cụ khác:**
- **React DevTools → Profiler** → bật "Record why each component rendered" → thấy được lane và
  nguyên nhân render
- **Chrome DevTools → Performance** → React 19.2 thêm **Performance Tracks** hiển thị lane và
  scheduler ngay trên timeline
- Đọc source: `packages/react-reconciler/src/ReactFiberWorkLoop.js` và `ReactFiberHooks.js`

---

## 12. Trade-offs của kiến trúc Fiber

| Lợi ích | Cái giá |
| --- | --- |
| Render ngắt được → concurrent, transition, streaming, Suspense | Overhead memory: mỗi component có một object fiber (×2 vì double buffering) |
| Ưu tiên hoá → UI luôn phản hồi | Scheduler tự triển khai → phức tạp hơn, tổng CPU tăng nhẹ |
| Bailout bằng bitmask → bỏ qua cây con trong một phép AND | Đòi hỏi render pure; mọi impurity thành bug khó tìm |
| Double buffering → vứt bản nháp không hậu quả | Debug khó hơn: thứ tự thực thi không tuyến tính |
| Hook list đơn giản, nhanh | Rules of Hooks trở thành **bắt buộc**, không phải khuyến nghị |

**Vì sao đánh đổi này đúng:** cái giá là **overhead cố định** (memory, một chút CPU) và
**kỷ luật code** (pure render, hook order). Lợi ích là **khả năng** — không có Fiber thì Server
Components, Suspense, và `useOptimistic` đơn giản là không thể tồn tại.

---

## 13. Best Practices rút ra từ internals

1. **Render pure không phải "phong cách tốt" — nó là hợp đồng với reconciler.** Cây `workInProgress`
   có thể bị vứt bất cứ lúc nào. Mutate dữ liệu mà `current` đang dùng = trạng thái không hồi phục.

2. **`key` phải gắn với danh tính dữ liệu, không phải vị trí.** `key={o._id}`, không `key={index}`.
   Vì `key` quyết định fiber được tái dùng hay bị xoá, và fiber mang theo toàn bộ hook list.

3. **Đừng đổi `type` của element có điều kiện ở cùng vị trí** nếu bạn muốn giữ state/focus/scroll.
   `elementType` khác = fiber mới.

4. **Hook order là bất biến, không phải quy ước.** Không có tên nào để khớp — chỉ có thứ tự.

5. **Gọi cùng hook nhiều lần là hoàn toàn ổn.** Mỗi lần gọi là một slot. `useActionToast(a)` +
   `useActionToast(b)` hoạt động đúng theo thiết kế.

6. **Dùng updater function khi giá trị mới phụ thuộc giá trị cũ** — vì reducer nhận state đã tích lũy
   từ queue, còn giá trị trực tiếp thì không.

7. **Giữ hằng số ở tầng module** để `oldProps === newProps` có cơ hội đúng và bailout hoạt động.

8. **Đừng hạ ưu tiên của input.** `SyncLane` tồn tại cho một lý do.

9. **Đừng dựa vào thứ tự hoàn tất giữa các lane.** Lane entanglement có thể đổi thứ tự bạn mong đợi.

10. **Giữ StrictMode bật.** Nó mô phỏng những chu kỳ mount/unmount thật sự xảy ra trong concurrent
    rendering — không phải một bài test nhân tạo.

---

## Tự kiểm tra

1. Vì sao React phải thay call stack bằng linked list fiber? Điều gì trở nên khả thi?
2. Cây `current` và `workInProgress` khác nhau thế nào? Vì sao đó là lời giải thích cho "render pure"?
3. Vẽ hook linked list của `CartLine` (4 hook). React khớp chúng bằng gì?
4. Giải thích ở tầng internals vì sao `useEffect` trong `if` gây bug. Bug đó biểu hiện thế nào?
5. Vì sao đổi `key` reset state? Field nào trên fiber chịu trách nhiệm?
6. Vì sao lane là bitmask mà không phải số nguyên đơn giản? Kể hai phép toán nó cho phép.
7. Toàn bộ "concurrent rendering" nằm ở đoạn code nào trong work loop?
8. Vì sao scheduler dùng `MessageChannel` chứ không `setTimeout` hay `requestIdleCallback`?
9. `childLanes` giúp bailout làm được gì mà `lanes` một mình không làm được?
10. Vì sao Server Component không thể có `useState`? (Trả lời ở tầng cơ chế, không phải "vì nó chạy trên server")

➡️ Tiếp theo: `16-error-boundaries-va-resilience.md`
