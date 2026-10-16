# Đăng nhập bằng Passkey (WebAuthn) — Frontend

> Tài liệu **định nghĩa chức năng** phía Next.js cho đăng nhập bằng passkey.
> Viết theo phong cách mentoring: giải thích *tại sao* trước khi đưa code.
>
> Tài liệu song sinh phía backend: `Ecommerce-NodeJS/docs/20. passkey-webauthn-feature-definition.md`.
> **Đọc mục 0 và mục 2 của tài liệu backend trước.** Ở đây không lặp lại nguyên lý mật mã; tài liệu này chỉ nói phần frontend thật sự chịu trách nhiệm.

---

## 1. Overview — Tổng quan

### Nhắc lại một câu cho khỏi hiểu nhầm

Yêu cầu gốc là *"lưu mật khẩu bằng passkey"*. **Passkey không lưu mật khẩu** — nó thay thế mật khẩu bằng một cặp khoá do thiết bị giữ. Chi tiết ở mục 0 của tài liệu backend. Nếu điều bạn muốn chỉ là "để trình duyệt nhớ mật khẩu hộ", thì frontend chỉ cần đúng một thứ: các thuộc tính `autoComplete` chuẩn trên form login — mà [login-form.tsx](../components/auth/login-form.tsx) **đã làm đúng rồi** (`autoComplete="email"` và `autoComplete="current-password"`). Không cần tài liệu này.

### Frontend thực sự chịu trách nhiệm gì?

Rất ít việc về mật mã, nhưng đúng một việc mà **chỉ frontend làm được**: gọi API của trình duyệt.

| Việc | Ai làm |
| --- | --- |
| Sinh và xác minh challenge, giữ khoá công khai, cấp JWT | Backend |
| Giữ khoá riêng, quét vân tay, ký | Hệ điều hành / authenticator |
| **Gọi `navigator.credentials.create()` / `.get()`** | **Client Component — không ai khác làm được** |
| Giữ `challengeId` an toàn giữa hai bước | Server Action + cookie `httpOnly` |
| Che giấu `API_KEY` và token khỏi trình duyệt | Server Action (như hiện tại) |
| Nhận biết trình duyệt không hỗ trợ và ẩn nút đi | Client Component |
| Phân biệt "user bấm Huỷ" với "lỗi thật" | Client Component |

Dòng in đậm tạo ra căng thẳng kiến trúc duy nhất của tính năng này, và là nội dung chính của tài liệu: **repo này làm mọi thứ qua Server Action, nhưng WebAuthn bắt buộc phải chạy trong trình duyệt.**

### Tin tốt: repo đã có đủ khuôn mẫu

| Khuôn mẫu đã có | Ở đâu | Dùng cho |
| --- | --- | --- |
| Server Action gọi backend, giấu `API_KEY` | [lib/api/server-client.ts](../lib/api/server-client.ts) | cả 6 action mới |
| Ghi cookie phiên sau khi đăng nhập | `setSession` trong [lib/auth/session.ts](../lib/auth/session.ts) | dùng **nguyên xi** |
| Giữ bí mật trung gian trong cookie `httpOnly` | mục 6.2 của [forgot-password-flow-guide.md](./forgot-password-flow-guide.md) | `challengeId` |
| `ActionState` + toast lỗi | [actions/state.ts](../actions/state.ts), [login-form.tsx](../components/auth/login-form.tsx) | hiển thị lỗi |
| Client Component có trạng thái pending | [submit-button.tsx](../components/auth/submit-button.tsx) | nút passkey |

Phần thật sự mới: **1 thư viện (`@simplewebauthn/browser`), 6 Server Action, 2 Client Component.**

---

## 2. Mental Model — Mô hình tư duy

### Nghĩ theo "bánh mì kẹp Server Action"

Mọi luồng khác trong repo này là một chiều: `form action={...}` → Server Action → xong.

Passkey **không thể** như vậy, vì ở giữa có một bước chỉ trình duyệt làm được. Hình dạng đúng là ba lớp:

```
   Client Component  ──►  Server Action #1  ──►  Backend
        (1)                 lấy options            sinh challenge
                            cất challengeId
                             vào cookie httpOnly
        ◄──────────────────────────
   Client Component
        (2)  navigator.credentials.get(options)   ◄── CHỈ Ở ĐÂY
             hệ điều hành hiện hộp thoại Face ID
             trả về một object JSON
        │
        ▼
   Client Component  ──►  Server Action #2  ──►  Backend
        (3)                 đọc challengeId          verify chữ ký
                            từ cookie                cấp tokens
                            setSession(tokens)
                            redirect('/')
```

Ba điều rút ra từ hình này:

- **Client Component không bao giờ gọi thẳng backend.** Nó chỉ nói chuyện với Server Action. Nhờ vậy `API_KEY` và token vẫn nằm trên server, đúng như mọi luồng khác trong repo.
- **`challengeId` không đi qua tay client.** Server Action #1 cất nó vào cookie `httpOnly`; Server Action #2 tự đọc. Client chỉ cầm `options` — thứ vốn công khai.
- **Chỉ có một bước duy nhất phải là code chạy trên trình duyệt** — bước (2). Giữ bước đó càng mỏng càng tốt: gọi API, trả object, hết. Mọi logic khác đẩy về server.

### Mô hình thứ hai: hai màn hình, hai vai trò khác nhau

| | Nút "Đăng nhập bằng passkey" | Nút "Thêm passkey" |
| --- | --- | --- |
| Ở đâu | Trang `/login` | Trang tài khoản (đã đăng nhập) |
| Gọi API nào | `navigator.credentials.get()` | `navigator.credentials.create()` |
| User đã đăng nhập chưa | **Chưa** | **Rồi** |
| Có gõ email không | **Không** — thiết bị tự biết tài khoản | Không cần, server biết từ token |
| Kết thúc bằng | `setSession` + `redirect` | Toast + `router.refresh()` |
| Hỏng thì sao | User quay lại dùng mật khẩu | User vẫn đăng nhập bình thường, chỉ là chưa thêm được |

Cột phải **rủi ro thấp hơn nhiều** — hỏng cũng không ai mất quyền truy cập. Vì vậy hãy làm cột phải trước. Nó cũng là thứ bắt buộc phải có trước, vì không đăng ký được passkey thì không có gì để test đăng nhập.

---

## 3. API Contract

Contract đầy đủ nằm ở **mục 4 của tài liệu backend** — đó là nguồn chân lý. Tóm tắt phần frontend gọi tới:

| Server Action | Endpoint backend | Cần token? |
| --- | --- | --- |
| `passkeyRegisterOptionsAction` | `POST /auth/passkeys/register/options` | ✅ `auth: true` |
| `passkeyRegisterVerifyAction` | `POST /auth/passkeys/register/verify` | ✅ `auth: true` |
| `passkeyLoginOptionsAction` | `POST /auth/passkeys/login/options` | ❌ |
| `passkeyLoginVerifyAction` | `POST /auth/passkeys/login/verify` | ❌ |
| `listPasskeysAction` | `GET /auth/passkeys` | ✅ `auth: true` |
| `renamePasskeyAction` | `PATCH /auth/passkeys/:id` | ✅ `auth: true` |
| `deletePasskeyAction` | `DELETE /auth/passkeys/:id` | ✅ `auth: true` |

Điểm cần khắc sâu: **`/auth/passkeys/login/verify` trả về đúng hình dạng của `/auth/login`** — `{ user, tokens }`. Nhờ vậy `setSession(data.tokens, data.user._id)` dùng lại nguyên vẹn, không rẽ nhánh. Nếu một ngày backend đổi hình dạng response đó, đây là chỗ vỡ đầu tiên.

---

## 4. Kiến trúc — file nào làm gì

```
actions/
└── passkey.actions.ts              ← MỚI: 6 Server Action

components/auth/
├── login-form.tsx                  ← SỬA: thêm <PasskeyLoginButton /> bên dưới form
└── passkey-login-button.tsx        ← MỚI: 'use client'

components/account/
└── passkey-manager.tsx             ← MỚI: 'use client' — danh sách + thêm + đổi tên + thu hồi

lib/auth/
└── passkey-challenge.ts            ← MỚI: helper cookie cho challengeId (server-only)
```

Vì sao `passkey-challenge.ts` tách riêng chứ không nhét vào `session.ts`: `session.ts` nói về **phiên đăng nhập đã thành lập**. `challengeId` là thứ sống 5 phút *giữa chừng một nghi thức*, cùng họ với ticket đặt lại mật khẩu, không cùng họ với access token. Trộn chung sẽ khiến người đọc sau tưởng nó là một phần của phiên.

```ts
// lib/auth/passkey-challenge.ts
import 'server-only'
import { cookies } from 'next/headers'

const NAME = 'pk_challenge'

export async function setChallengeId(id: string): Promise<void> {
  const store = await cookies()
  store.set(NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300, // khớp TTL Redis phía backend
  })
}

// Đọc và xoá. Cookie này dùng một lần y như challenge phía server:
// để sót lại thì lần thử sau sẽ gửi lên một challengeId đã chết, và
// user nhận một lỗi khó hiểu thay vì được bắt đầu lại sạch sẽ.
export async function consumeChallengeId(): Promise<string | undefined> {
  const store = await cookies()
  const id = store.get(NAME)?.value
  if (id) store.delete(NAME)
  return id
}
```

---

## 5. Triển khai từng bước

### Bước 1 — Server Actions

```ts
// actions/passkey.actions.ts
'use server'

import { redirect } from 'next/navigation'
import { apiFetch } from '@/lib/api/server-client'
import { errorMessage } from '@/lib/api/error-message'
import { setSession } from '@/lib/auth/session'
import { setChallengeId, consumeChallengeId } from '@/lib/auth/passkey-challenge'
import type { LoginData } from '@/types/api'
import type { ActionState } from '@/actions/state'

type OptionsResult = { ok: true; options: unknown } | { ok: false; message: string }

export async function passkeyLoginOptionsAction(): Promise<OptionsResult> {
  try {
    const data = await apiFetch<{ challengeId: string; options: unknown }>(
      '/auth/passkeys/login/options',
      { body: {} },
    )
    await setChallengeId(data.challengeId)
    return { ok: true, options: data.options }
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not start passkey sign-in') }
  }
}

export async function passkeyLoginVerifyAction(
  response: unknown,
  redirectTo: string,
): Promise<ActionState> {
  const challengeId = await consumeChallengeId()
  if (!challengeId) return { ok: false, message: 'Your sign-in attempt expired. Please try again.' }

  try {
    const data = await apiFetch<LoginData>('/auth/passkeys/login/verify', {
      body: { challengeId, response },
    })
    await setSession(data.tokens, data.user._id)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not sign you in') }
  }
  // NGOÀI try/catch — redirect() hoạt động bằng cách ném exception.
  redirect(redirectTo)
}
```

Hai action đăng ký (`passkeyRegisterOptionsAction`, `passkeyRegisterVerifyAction`) có cấu trúc y hệt, chỉ khác là thêm `auth: true` vào `apiFetch` và kết thúc bằng `return { ok: true }` thay vì `redirect`.

> **Chú ý:** các action này **không** nhận `FormData` và **không** dùng với `useActionState`. Lý do ở mục 6.3.

### Bước 2 — Nút đăng nhập bằng passkey

```tsx
// components/auth/passkey-login-button.tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { passkeyLoginOptionsAction, passkeyLoginVerifyAction } from '@/actions/passkey.actions'
import { Button } from '@/components/ui/button'

export function PasskeyLoginButton({ redirectTo }: { redirectTo: string }) {
  const [supported, setSupported] = useState(false)
  const [pending, startTransition] = useTransition()

  // Phải kiểm tra trong useEffect, không phải khi render: server không có
  // `navigator`, nên gọi lúc render sẽ vỡ hydration. Xem mục 6.4.
  useEffect(() => setSupported(browserSupportsWebAuthn()), [])

  if (!supported) return null

  async function handleClick() {
    const opts = await passkeyLoginOptionsAction()
    if (!opts.ok) return toast.error(opts.message)

    let response
    try {
      response = await startAuthentication({ optionsJSON: opts.options as never })
    } catch (err) {
      // User bấm Huỷ hoặc hết giờ — KHÔNG phải lỗi. Xem mục 6.5.
      if ((err as Error).name === 'NotAllowedError') return
      return toast.error('Your device could not complete the passkey sign-in.')
    }

    startTransition(async () => {
      const state = await passkeyLoginVerifyAction(response, redirectTo)
      if (state?.message) toast.error(state.message)
    })
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={handleClick} disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in with a passkey'}
    </Button>
  )
}
```

### Bước 3 — Nối vào trang đăng nhập

Đặt **bên dưới** form mật khẩu, có vạch ngăn:

```tsx
<SubmitButton>Sign in</SubmitButton>
</form>

<div className="relative my-6">
  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-card px-2 text-muted-foreground">or</span>
  </div>
</div>

<PasskeyLoginButton redirectTo={redirectTo} />
```

**Vì sao ở dưới chứ không ở trên?** Ở v1, đa số user chưa có passkey. Đặt nút passkey lên đầu sẽ khiến họ bấm vào, gặp hộp thoại hệ điều hành trống rỗng, rồi bối rối. Khi tỉ lệ user có passkey đủ cao, hãy đảo lại — nhưng hãy để dữ liệu quyết định, đừng để thẩm mỹ quyết định.

### Bước 4 — Quản lý passkey ở trang tài khoản

Danh sách credential render từ Server Component (gọi `apiFetch('/auth/passkeys', { auth: true })`), còn "Thêm passkey", "Đổi tên" và "Thu hồi" nằm trong một Client Component. Sau khi thêm/xoá thành công thì gọi `router.refresh()` để Server Component fetch lại — đúng khuôn mẫu repo đang dùng.

Mỗi dòng nên hiển thị: nhãn thiết bị, ngày tạo, lần dùng cuối, và **"Được đồng bộ qua đám mây"** nếu `deviceType === 'multiDevice'`. Dòng cuối quan trọng hơn vẻ ngoài của nó: nó là cách duy nhất user hiểu được "mất máy có mất tài khoản không".

---

## 6. Những cái bẫy

### 6.1 WebAuthn **không thể** chạy trong Server Action — và vì sao đừng cố lách

`navigator.credentials` chỉ tồn tại trong trình duyệt. Server Action chạy trên Node. Không có cách nào đưa nghi thức này vào một `form action={...}` thuần.

Hệ quả cần chấp nhận: **tính năng này bắt buộc cần JavaScript phía client.** Nó là ngoại lệ có chủ đích với nguyên tắc progressive enhancement mà phần còn lại của repo đang giữ. Đó là lý do nút passkey phải là *bổ sung* cho form mật khẩu, không bao giờ thay thế nó — với JS tắt hoặc lỗi, form mật khẩu (vốn hoạt động không cần JS) vẫn phải là lối vào đầy đủ.

### 6.2 Đừng để Client Component gọi thẳng backend

Cám dỗ rất lớn: client đã có `options` rồi, gọi thẳng `fetch(BACKEND_URL + '/auth/passkeys/login/verify')` cho gọn, đỡ một vòng.

Đừng. Ba lý do, lý do nào cũng đủ:

- `API_KEY` sẽ phải phơi ra trình duyệt.
- Cookie phiên là `httpOnly` — client không đọc được để gửi kèm, và cũng **không được ghi** cookie sau khi đăng nhập thành công. Chỉ server ghi được.
- `challengeId` sẽ phải nằm trong state của client, tức là nằm trong tầm với của mọi extension và mọi XSS.

Vòng qua Server Action tốn thêm vài chục mili giây. Nghi thức này vốn đã chờ user chạm vân tay — vài chục mili giây đó không ai cảm nhận được.

### 6.3 `useActionState` không hợp ở đây — dùng `useTransition`

Cả repo dùng `useActionState` + `<form action={...}>`. Ở đây thì không, vì:

- Không có `FormData` nào cả. Dữ liệu là một object JSON do trình duyệt sinh ra.
- Cần gọi **hai** action, cách nhau bởi một `await` vào API trình duyệt. `useActionState` được thiết kế cho **một** lần submit.

Nên: `onClick` thường + `useTransition` cho trạng thái pending. `useFormStatus` (bên trong `SubmitButton`) cũng không dùng được — nó chỉ đọc trạng thái của `<form>` bao quanh, mà ở đây không có form nào.

Đây là ví dụ tốt của một nguyên tắc chung: **khuôn mẫu của repo là mặc định, không phải luật.** Khi bản chất bài toán khác đi, hãy đổi khuôn mẫu và *ghi lại lý do* — chứ đừng bẻ cong bài toán cho vừa khuôn mẫu.

### 6.4 Feature detection phải nằm trong `useEffect`

`browserSupportsWebAuthn()` đọc `window`/`navigator`. Gọi nó trong thân render sẽ chạy cả trên server → hoặc crash, hoặc HTML server và HTML client lệch nhau → **hydration mismatch**.

Vì vậy: khởi tạo `supported = false`, bật lên trong `useEffect`. Hệ quả nhìn thấy được: nút passkey xuất hiện trễ một nhịp sau khi trang hiện. Chấp nhận được — và tốt hơn hẳn phương án ngược lại (hiện nút rồi giật mất), vốn khó chịu hơn nhiều với mắt người dùng.

Cân nhắc thêm `platformAuthenticatorIsAvailable()` (hàm async) nếu muốn phân biệt "có Face ID/Windows Hello sẵn" với "chỉ cắm được khoá USB". Chỉ hữu ích khi bạn muốn đổi chữ trên nút cho sát thực tế.

### 6.5 `NotAllowedError` là **user bấm Huỷ** — đừng hiện lỗi đỏ

Đây là lỗi UX phổ biến nhất của mọi lần tích hợp WebAuthn lần đầu.

Trình duyệt trả về `NotAllowedError` cho **cả hai** trường hợp: user chủ động bấm Huỷ, và hết giờ chờ. Nó **cố tình** không phân biệt — phân biệt được sẽ tiết lộ hành vi của user cho trang web.

Một chi tiết dễ làm người đọc "sửa nhầm": `@simplewebauthn/browser` **bọc** lỗi gốc trong `WebAuthnError`, nhưng nó gán `name` từ `cause` — nên `err.name === 'NotAllowedError'` vẫn đúng, và lỗi gốc nằm ở `err.cause`. Đừng đổi sang `err.code`: mã của thư viện cho trường hợp này là passthrough, không phải một hằng số riêng cho "user huỷ".

Nên: `NotAllowedError` → **im lặng, không toast gì cả**. User vừa tự tay bấm Huỷ; báo lỗi cho họ là vô nghĩa và khiến sản phẩm trông hỏng. Chỉ toast với các lỗi khác.

Một lỗi khác đáng xử riêng ở **luồng đăng ký**: `InvalidStateError` nghĩa là thiết bị này **đã có passkey** cho tài khoản (do `excludeCredentials` phía backend). Thông báo đúng là *"Thiết bị này đã có passkey rồi"* — một câu bình thường, không phải lỗi.

### 6.6 `redirect()` phải nằm NGOÀI `try/catch`

Giống hệt mục 6.3 của [forgot-password-flow-guide.md](./forgot-password-flow-guide.md): `redirect()` của Next hoạt động bằng cách **ném** một exception đặc biệt. Đặt trong `try` thì `catch` nuốt mất, và user đăng nhập thành công nhưng đứng nguyên tại chỗ kèm một toast lỗi vô nghĩa.

### 6.7 Conditional UI (gợi ý passkey ngay trong ô email) — làm sau, và cẩn thận

Trải nghiệm đẹp nhất của passkey là **không cần nút nào cả**: user chạm vào ô email, trình duyệt gợi ý passkey ngay trong dropdown autofill.

```tsx
// Ceremony này phải bắt đầu khi trang MOUNT, không phải khi bấm nút.
useEffect(() => {
  let cancelled = false
  ;(async () => {
    if (!(await browserSupportsWebAuthnAutofill())) return
    const opts = await passkeyLoginOptionsAction()
    if (!opts.ok || cancelled) return
    try {
      const response = await startAuthentication({
        optionsJSON: opts.options as never,
        useBrowserAutofill: true,
      })
      await passkeyLoginVerifyAction(response, redirectTo)
    } catch {
      // Bình thường: user gõ mật khẩu thay vì chọn passkey. Im lặng.
    }
  })()
  return () => { cancelled = true }
}, [redirectTo])
```

Kèm theo `<Input autoComplete="username webauthn" />` — thiếu token `webauthn` thì dropdown sẽ không hiện passkey và bạn sẽ ngồi debug rất lâu mà không thấy lỗi nào.

Ba cái bẫy của riêng conditional UI:

- **Nó chiếm một challenge ngay khi trang tải**, kể cả user không dùng. Tức là mỗi lượt xem trang `/login` là một ghi Redis. Hãy tính lại ngưỡng rate limit phía backend (mục 6.7 tài liệu backend) trước khi bật.
- **Chỉ được có một ceremony chạy tại một thời điểm.** Nếu conditional UI đang chờ mà user bấm nút passkey, bạn sẽ nhận `"A request is already pending"`. Phải gọi `WebAuthnAbortService.cancelCeremony()` trước khi mở ceremony dạng modal.
- **Hỗ trợ không đồng đều.** Phải luôn giữ cả nút bấm tường minh làm đường lui.

Khuyến nghị: **v1 làm nút bấm thôi.** Conditional UI là phần thưởng thêm, để sang v1.1 khi luồng cơ bản đã ổn định.

### 6.8 `proxy.ts` không cần sửa — nhưng phải hiểu vì sao

[proxy.ts](../proxy.ts) chỉ gác các route đã có trong `matcher` và chỉ nhìn cookie. Đăng nhập bằng passkey kết thúc bằng `setSession(...)` — ghi đúng ba cookie `access_token` / `refresh_token` / `client_id` mà proxy đang đọc. Với proxy thì một phiên tạo bởi passkey **không phân biệt được** với phiên tạo bởi mật khẩu, và đó chính là điều ta muốn.

Đây là phần thưởng của quyết định ở mục 3: giữ response của `login/verify` giống hệt `/auth/login`. Một seam hẹp có nghĩa là thêm cả một phương thức xác thực mới mà **không** phải chạm vào tầng phiên, tầng phân quyền, hay middleware.

### 6.9 Cookie `pk_challenge` chết nằm lại

Nếu user mở `/login`, kích hoạt luồng passkey, rồi bỏ đi giữa chừng, cookie `pk_challenge` còn nằm đó 5 phút. Vô hại (challenge phía server cũng hết hạn cùng lúc), nhưng nếu quên `maxAge` thì nó thành cookie phiên sống mãi, và lần thử sau sẽ gửi lên một challengeId đã chết — lỗi *"Your sign-in attempt expired"* xuất hiện ngay ở **lần thử đầu tiên**, cực kỳ khó hiểu khi debug.

Hai hàng phòng thủ: `maxAge: 300`, và `consumeChallengeId()` luôn xoá sau khi đọc.

---

## 7. When to use / When NOT to use

### Khuôn mẫu "bánh mì kẹp Server Action" ở đây còn dùng được cho

Bất cứ luồng nào cần một API chỉ có ở trình duyệt nằm giữa hai lần gọi server:

- Thanh toán qua Payment Request API / Apple Pay.
- Upload trực tiếp lên Cloudinary bằng signed URL (xin chữ ký từ server → browser upload → báo kết quả về server).
- Geolocation để gợi ý địa chỉ giao hàng.

Hình dạng chung: **server cấp một phiếu ngắn hạn → trình duyệt làm việc của nó → server xác minh kết quả.** Nhận ra hình dạng này thì lần sau không phải nghĩ lại từ đầu.

### KHÔNG dùng khuôn mẫu này khi

- Việc đó **làm được trên server**. Mỗi lần đẩy logic sang client là mất khả năng chạy không-JS và thêm một bề mặt cần bảo vệ.
- Kết quả từ client **được tin mà không xác minh lại**. Toàn bộ giá trị của khuôn mẫu nằm ở bước xác minh cuối. Bỏ nó đi thì chỉ còn lại rủi ro.

### Vì sao không tự viết code chuyển đổi base64url?

`@simplewebauthn/browser` chỉ làm mỗi việc chuyển `ArrayBuffer` ↔ base64url và gọi API trình duyệt — nghe như thứ tự viết được trong 30 dòng. Nhưng: các trường cần chuyển nằm **lồng nhiều tầng** và **khác nhau giữa create và get**; base64url khác base64 ở ba chỗ dễ sai; và khi sai, triệu chứng luôn là `"invalid signature"` từ backend — một message **không** chỉ được chỗ nào hỏng. Ba mươi dòng đó sẽ ngốn của bạn một buổi chiều mỗi lần có người sửa nhầm.

---

## 8. Trade-offs — Đánh đổi

| Lợi ích | Chi phí |
| --- | --- |
| Đăng nhập một chạm, bỏ cả ô email lẫn ô mật khẩu — thắng lớn nhất trên mobile | Bắt buộc cần JS; là ngoại lệ duy nhất với progressive enhancement trong repo |
| Không có bí mật nào đi qua client — chỉ có `options` công khai và một chữ ký | Thêm một vòng round-trip so với submit form một lần |
| Không phải chạm vào `proxy.ts`, `session.ts`, hay tầng phân quyền | Đổi lại phải giữ kỷ luật: response `login/verify` **phải** giữ đúng hình dạng của `/auth/login` mãi mãi |
| Thêm 2 Client Component, không đụng gì tới các luồng đang chạy | Repo giờ có **hai** khuôn mẫu xử lý form (`useActionState` và `useTransition`) — người mới sẽ hỏi tại sao |
| `@simplewebauthn/browser` xoá sạch một lớp lỗi mã hoá nhị phân | Thêm một phụ thuộc phải theo dõi; và nó phải **cùng thế hệ** với `@simplewebauthn/server` ở backend |
| Ẩn nút khi trình duyệt không hỗ trợ → không ai bấm vào thứ chắc chắn hỏng | Nút xuất hiện trễ một nhịp sau khi trang hiện, không tránh được |

---

## 9. Kiểm thử

**Unit (vitest — chạy bằng Node 22; Node 20.9 mặc định làm vitest chết trước khi chạy test nào):**

- `consumeChallengeId()` gọi hai lần → lần hai `undefined`.
- Action verify khi không có cookie → trả message hết hạn, **không** gọi `apiFetch`.
- `PasskeyLoginButton` khi `browserSupportsWebAuthn()` trả `false` → render `null`.
- Mock `startAuthentication` ném `NotAllowedError` → **không** gọi `toast.error`. Đây là test đáng giá nhất trong danh sách, vì nó khoá lại đúng cái bẫy UX ở mục 6.5.

**Không cố mock cả nghi thức.** Mock `navigator.credentials` cho ra kết quả hợp lệ về mặt mật mã là công sức lớn mà chẳng chứng minh được gì — phần mật mã đã được test ở backend bằng fixture rồi (mục 10 tài liệu backend). Ở FE chỉ test **logic điều phối**: gọi đúng thứ tự, xử lý lỗi đúng cách.

**Kiểm tra tay bắt buộc:**

- Safari iOS — bấm Huỷ ở hộp thoại → **không** được hiện toast đỏ.
- Chrome Android — đăng nhập trọn vẹn.
- Chrome desktop → quét QR bằng điện thoại (luồng cross-device).
- Firefox không có authenticator → nút phải **ẩn hẳn**, không phải hiện rồi báo lỗi.
- Tắt JS → form mật khẩu vẫn đăng nhập được bình thường.

---

## 10. Checklist triển khai

- [ ] Cài `@simplewebauthn/browser`, **khớp thế hệ** với `@simplewebauthn/server` ở backend
- [ ] `lib/auth/passkey-challenge.ts` — `httpOnly`, `maxAge: 300`, xoá khi đọc
- [ ] 6 Server Action trong `actions/passkey.actions.ts`
- [ ] `redirect()` nằm **ngoài** `try/catch`
- [ ] Feature detection trong `useEffect`, không phải trong thân render
- [ ] `NotAllowedError` → **im lặng**
- [ ] `InvalidStateError` ở luồng đăng ký → *"Thiết bị này đã có passkey"*
- [ ] Nút passkey nằm **dưới** form mật khẩu, có vạch ngăn "or"
- [ ] Trang tài khoản: danh sách + thêm + đổi tên + thu hồi, có nhãn "đồng bộ qua đám mây"
- [ ] Cảnh báo user khi họ thu hồi passkey **cuối cùng**
- [ ] Chạy `pnpm typecheck` và `pnpm test:run`

---

## 11. Khái niệm liên quan

| Khái niệm | Tra ở đâu |
| --- | --- |
| Nguyên lý WebAuthn, model dữ liệu, các phép kiểm tra phía server | `Ecommerce-NodeJS/docs/20. passkey-webauthn-feature-definition.md` |
| Khuôn mẫu wizard nhiều bước, bí mật trung gian trong cookie | [forgot-password-flow-guide.md](./forgot-password-flow-guide.md) |
| Ranh giới Server / Client Component | [08-server-vs-client-components.md](./react-nextjs/08-server-vs-client-components.md) |
| Server Action và form | [11-server-actions-va-forms.md](./react-nextjs/11-server-actions-va-forms.md) |
| `proxy.ts` và xác thực ở middleware | [12-proxy-middleware-va-auth.md](./react-nextjs/12-proxy-middleware-va-auth.md) |

---

## 12. Ghi chú của người đi trước

**Làm trang quản lý passkey trước trang đăng nhập.** Lúc dev bạn sẽ tạo ra hàng chục credential rác trên máy mình. Không có nút thu hồi thì phải vào cài đặt passkey của hệ điều hành xoá tay từng cái — mỗi lần mất vài phút, và làm mười lần thì người ta bắt đầu bỏ qua các bước kiểm tra cho nhanh.

**`localhost` chạy được không cần HTTPS, nhưng IP LAN thì không.** Khoảnh khắc bạn muốn test trên điện thoại thật qua `192.168.x.x`, WebAuthn sẽ im lặng không hoạt động vì đó không phải secure context. Dùng ngrok hoặc tương đương. Biết trước điều này tiết kiệm được một buổi chiều.

**Toast đầu tiên bạn viết gần như chắc chắn sai.** Ai cũng bắt đầu bằng `catch (err) { toast.error(err.message) }`. Message của WebAuthn là thứ dành cho lập trình viên, không dành cho người dùng — *"The operation either timed out or was not allowed"* chẳng nói gì với ai. Hãy ánh xạ `err.name` sang câu chữ của mình, và với `NotAllowedError` thì đừng nói gì cả.

**Đừng bỏ nút "Đăng nhập bằng mật khẩu" ngay cả khi tính năng chạy hoàn hảo.** Việc gỡ đăng nhập bằng mật khẩu là quyết định sản phẩm có điều kiện tiên quyết riêng — đọc mục 8.3 của tài liệu backend trước khi ai đó đề xuất điều này trong một buổi họp.
