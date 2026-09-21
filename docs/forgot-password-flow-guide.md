# Quên mật khẩu (Forgot Password) — Frontend

> Tài liệu **định nghĩa chức năng** cho luồng đặt lại mật khẩu ở phía Next.js App Router.
> Viết theo phong cách mentoring: giải thích *tại sao* mỗi quyết định được chọn, không chỉ *làm gì*.
>
> Tài liệu song sinh phía backend: `Ecommerce-NodeJS/docs/19. forgot-password-flow-guide.md`.
> API contract ở mục 3 là **bản sao** của contract bên đó — sửa một bên phải sửa cả hai.

---

## 1. Overview — Tổng quan

### Chức năng này là gì?

Hai màn hình mới nối vào trang đăng nhập, cho phép user lấy lại tài khoản khi không nhớ mật khẩu:

```
/login  ──"Quên mật khẩu?"──►  /forgot-password  ──►  /reset-password  ──►  /login?reset=1
                                  (nhập email)          (OTP → mật khẩu mới)   (đăng nhập lại)
```

### Frontend thực sự chịu trách nhiệm gì?

Câu hỏi này quan trọng hơn vẻ ngoài của nó. Backend đã lo toàn bộ phần bảo mật: sinh OTP, chống brute-force, chống dò tài khoản, huỷ session. Vậy frontend còn gì để làm ngoài việc vẽ hai cái form?

Ba việc, và cả ba đều dễ làm sai:

1. **Giữ `resetTicket` an toàn giữa hai bước.** Backend trả về một vé sống 10 phút. Để nó sai chỗ là làm hỏng chính thứ backend vừa bảo vệ. Mục 6.2.
2. **Truyền đạt trung thực một response cố tình mơ hồ.** Backend **luôn** trả 200 cho `/forgot-password`, kể cả khi email không tồn tại. Frontend phải nói sự thật đó với user mà không làm họ hoang mang. Mục 6.1.
3. **Không nuốt mất `redirect()`.** Trong Server Actions, `redirect()` hoạt động bằng cách *ném lỗi*. Đặt nó sai chỗ là biến một lần reset thành công thành một thông báo lỗi. Mục 6.3.

### Tin tốt: repo đã có đủ khuôn mẫu

Luồng này **không cần bất kỳ pattern mới nào**. Mọi thứ đã có sẵn trong repo và chỉ cần lặp lại:

| Cần gì | Đã có mẫu ở | Tái dùng thế nào |
| --- | --- | --- |
| Form gửi lên server + hiện lỗi | [components/auth/verify-otp-form.tsx](../components/auth/verify-otp-form.tsx) | Copy gần như nguyên cấu trúc |
| Server Action trả `ActionState` | [actions/auth.actions.ts](../actions/auth.actions.ts) | Thêm 3 hàm cùng khuôn |
| Validate input bằng Zod | [lib/validations/auth.ts](../lib/validations/auth.ts) | Thêm 3 schema |
| Gọi API kèm `x-api-key` | [lib/api/server-client.ts](../lib/api/server-client.ts) | `apiFetch` — không cần sửa |
| Ghi cookie `httpOnly` | [lib/auth/session.ts](../lib/auth/session.ts) | Thêm 3 helper cùng phong cách |
| Truyền email qua URL giữa 2 màn | [app/(auth)/verify-otp/page.tsx](<../app/(auth)/verify-otp/page.tsx>) | Lặp lại y hệt |
| Nút submit có trạng thái loading | [components/auth/submit-button.tsx](../components/auth/submit-button.tsx) | Dùng nguyên |

Và một tin tốt nữa: **`proxy.ts` không cần sửa một dòng nào** — mục 6.4 giải thích vì sao.

---

## 2. Mental Model — Mô hình tư duy

### Nghĩ theo "ai đang giữ bí mật gì"

Cách tốt nhất để không lạc trong luồng này là luôn trả lời được: *ngay lúc này, bí mật nằm ở đâu?*

```
Bước 1 — user nhập email
   Bí mật: KHÔNG CÓ. Email không phải bí mật.
   → truyền qua URL query thoải mái:  /reset-password?email=...

Bước 2 — user nhập OTP
   Bí mật: OTP (6 số, sống 5 phút, người đọc được)
   → chỉ tồn tại trong RAM của trình duyệt vài giây rồi gửi thẳng lên server.
     KHÔNG lưu vào state dài hạn, KHÔNG đưa vào URL.

Giữa bước 2 và 3 — server trả resetTicket
   Bí mật: TICKET (đủ quyền đổi mật khẩu của user này)
   → Server Action đặt ngay vào cookie httpOnly. JavaScript phía client
     KHÔNG BAO GIỜ nhìn thấy chuỗi này.

Bước 3 — user nhập mật khẩu mới
   Bí mật: mật khẩu mới + ticket (trong cookie)
   → form chỉ gửi mật khẩu; ticket tự đi kèm request vì nó là cookie.
     Component không cần biết ticket tồn tại.
```

Mô hình này trả lời sẵn mọi câu hỏi thiết kế sẽ gặp bên dưới. Ví dụ: *"có nên để ticket vào URL cho tiện không?"* → Không, vì dòng thứ ba nói ticket là bí mật, mà URL thì không phải nơi giữ bí mật.

### Mô hình thứ hai: hai màn hình, ba bước

Có 3 endpoint backend nhưng chỉ nên có **2 màn hình**. Bước 2 và 3 ở chung một route `/reset-password`, và route đó tự biết mình đang ở pha nào bằng cách **nhìn xem cookie ticket đã tồn tại chưa**:

```
GET /reset-password?email=a@b.com
        │
        ▼
  Server Component đọc cookie reset_ticket
        │
   ┌────┴─────┐
   │          │
 chưa có    đã có
   │          │
   ▼          ▼
Form OTP   Form mật khẩu mới
```

Vì trạng thái pha được suy ra **trên server từ cookie** chứ không giữ trong `useState`, user bấm F5 giữa chừng vẫn ở đúng pha. Đây là lợi thế trực tiếp của Server Components mà nếu làm bằng client state sẽ phải tự xử lý bằng `sessionStorage` và vẫn không chắc đúng.

---

## 3. API Contract — Hợp đồng với backend

Ba endpoint, đều **public** (không cần đăng nhập) nhưng vẫn cần `x-api-key` — `apiFetch` đã tự gắn header đó, nên gọi **không** truyền `auth: true`.

```ts
// 1) Xin mã
POST /auth/forgot-password
  body:  { email }
  200:   { message, email }        // ⚠️ LUÔN 200, kể cả email không tồn tại

// 2) Đổi OTP lấy vé
POST /auth/verify-reset-otp
  body:  { email, otp }
  200:   { resetTicket, expiresIn }
  400:   "Invalid or expired OTP"
  400:   "Too many attempts. Please request a new code."

// 3) Đặt mật khẩu mới
POST /auth/reset-password
  body:  { resetTicket, password }   // ⚠️ KHÔNG gửi email — ticket đã xác định user
  200:   { message }
  400:   "Reset session is invalid or expired"
  400:   "New password must differ from the current one"
```

**Gửi lại mã**: gọi lại chính `POST /auth/forgot-password`. Không có endpoint resend riêng. Backend tự áp cooldown 60 giây và **im lặng bỏ qua** nếu gọi quá sớm — nghĩa là frontend luôn nhận 200 dù mail có được gửi hay không.

**Sau khi reset thành công, backend KHÔNG trả token.** User phải đăng nhập lại. Đây là chủ ý, không phải thiếu sót — mục 6.5.

---

## 4. Kiến trúc — file nào làm gì

```
app/(auth)/
  forgot-password/page.tsx      Server Component — render form nhập email
  reset-password/page.tsx       Server Component — đọc cookie, chọn pha

components/auth/
  forgot-password-form.tsx      Client — form email
  reset-otp-form.tsx            Client — form OTP (pha 1)
  reset-password-form.tsx       Client — form mật khẩu mới (pha 2)
  login-form.tsx                ✏️ sửa: thêm link "Quên mật khẩu?"

actions/
  auth.actions.ts               ✏️ thêm 3 action

lib/auth/
  reset-ticket.ts               🆕 đọc/ghi/xoá cookie ticket

lib/validations/
  auth.ts                       ✏️ thêm 3 schema

proxy.ts                        ✅ KHÔNG SỬA GÌ — mục 6.4
```

Luồng dữ liệu một vòng đầy đủ:

```
  Browser                Server Action              Backend API
     │                        │                          │
  [email] ──── form ─────────►│                          │
     │                    validate (zod)                 │
     │                        │──── apiFetch ───────────►│ POST /auth/forgot-password
     │                        │◄──────── 200 ────────────│ (luôn 200)
     │◄─── redirect /reset-password?email=… ─────────────│
     │                        │                          │
  [otp] ────── form ─────────►│                          │
     │                        │──── apiFetch ───────────►│ POST /auth/verify-reset-otp
     │                        │◄─── { resetTicket } ─────│
     │                  cookies().set('reset_ticket', …) │   httpOnly, 10 phút
     │◄─── { ok: true } ──────│                          │
     │   (component đổi sang pha 2 — không redirect)     │
     │                        │                          │
  [password] ─ form ─────────►│                          │
     │                   đọc ticket TỪ COOKIE            │
     │                        │──── apiFetch ───────────►│ POST /auth/reset-password
     │                        │◄──────── 200 ────────────│
     │                    xoá cookie ticket              │
     │◄─── redirect /login?reset=1 ──────────────────────│
```

---

## 5. Triển khai từng bước

### Bước 1 — Zod schema

```ts
// lib/validations/auth.ts — thêm vào cuối file
export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
})

export const resetOtpSchema = z.object({
  email: z.string().email('Enter a valid email'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  // Kiểm tra hai ô khớp nhau NGAY TRÊN SERVER, không chỉ trong UI.
  // Client-side validation là tiện ích cho user, không phải hàng rào.
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetOtpInput = z.infer<typeof resetOtpSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
```

> `min(6)` để khớp đúng luật của `signupSchema` và của backend. Nếu sau này siết yêu cầu mật khẩu, phải sửa **cả ba nơi** (zod signup, zod reset, validate backend) — nếu không, user sẽ đặt được ở màn này mật khẩu mà màn kia từ chối.

### Bước 2 — Helper cookie cho ticket

```ts
// lib/auth/reset-ticket.ts
import 'server-only'
import { cookies } from 'next/headers'

export const RESET_TICKET_COOKIE = 'reset_ticket'

export async function setResetTicket(ticket: string, maxAge: number): Promise<void> {
  const store = await cookies()
  store.set(RESET_TICKET_COOKIE, ticket, {
    httpOnly: true,                                  // JS phía client không đọc được
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,                                          // khớp expiresIn backend trả về
  })
}

export async function getResetTicket(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(RESET_TICKET_COOKIE)?.value
}

export async function clearResetTicket(): Promise<void> {
  const store = await cookies()
  store.delete(RESET_TICKET_COOKIE)
}
```

Ba chi tiết đáng dừng lại:

**`import 'server-only'`** — giống hệt [lib/auth/session.ts](../lib/auth/session.ts). Đây là một cái chốt an toàn ở mức build: nếu ai đó lỡ import file này vào một Client Component, **build sẽ fail** thay vì âm thầm gửi logic cookie xuống trình duyệt.

**`path: '/'`** — Server Action POST về đúng URL của trang đang mở, nên `path: '/reset-password'` trên lý thuyết là đủ hẹp. Nhưng `path` của cookie là một nguồn bug rất khó chẩn đoán (sai path → cookie "biến mất" mà không báo lỗi gì), và cookie này sống có 10 phút. Đổi phạm vi lấy sự chắc chắn ở đây là đánh đổi đúng.

**`maxAge` lấy từ `expiresIn` backend trả về** thay vì hardcode `600`. Backend là nơi duy nhất biết vé sống bao lâu; hardcode ở frontend nghĩa là ngày backend đổi TTL, cookie sẽ sống lệch pha với ticket thật.

### Bước 3 — Ba Server Action

```ts
// actions/auth.actions.ts — thêm import
import {
  forgotPasswordSchema,
  resetOtpSchema,
  resetPasswordSchema,
} from '@/lib/validations/auth'
import {
  setResetTicket,
  getResetTicket,
  clearResetTicket,
} from '@/lib/auth/reset-ticket'
```

```ts
export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    // Không truyền auth: true — endpoint public, apiFetch vẫn tự gắn x-api-key.
    await apiFetch('/auth/forgot-password', { body: parsed.data })
  } catch (e) {
    // Chỉ vào đây khi mạng lỗi hoặc backend 5xx. Email không tồn tại
    // VẪN trả 200 — đó là chủ ý của backend, xem mục 6.1.
    return { ok: false, message: errorMessage(e, 'Could not send the reset code') }
  }
  // redirect() PHẢI nằm ngoài try/catch — xem mục 6.3.
  redirect(`/reset-password?email=${encodeURIComponent(parsed.data.email)}`)
}
```

```ts
export async function verifyResetOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetOtpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }
  try {
    const data = await apiFetch<{ resetTicket: string; expiresIn: number }>(
      '/auth/verify-reset-otp',
      { body: parsed.data },
    )
    await setResetTicket(data.resetTicket, data.expiresIn)
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not verify your code') }
  }
  // KHÔNG redirect: ở lại /reset-password, để trang tự chuyển sang pha 2.
  // Trả ok:true để component biết mà đổi form — xem mục 6.6.
  return { ok: true }
}
```

```ts
export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message }

  // Ticket lấy từ COOKIE, không lấy từ formData. Client không gửi nó,
  // client thậm chí không biết nó tồn tại.
  const resetTicket = await getResetTicket()
  if (!resetTicket)
    return { ok: false, message: 'Your reset session expired. Please start again.' }

  try {
    await apiFetch('/auth/reset-password', {
      body: { resetTicket, password: parsed.data.password },
    })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Could not reset your password') }
  }
  // Vé đã dùng xong — dọn sạch, không để cookie chết nằm lại.
  await clearResetTicket()
  redirect('/login?reset=1')
}
```

### Bước 4 — Hai Server Component

```tsx
// app/(auth)/forgot-password/page.tsx
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
```

```tsx
// app/(auth)/reset-password/page.tsx
import { redirect } from 'next/navigation'
import { getResetTicket } from '@/lib/auth/reset-ticket'
import { ResetOtpForm } from '@/components/auth/reset-otp-form'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  // Đã có vé → user đã qua bước OTP → hiện form mật khẩu.
  // Đọc trên server nên F5 giữa chừng vẫn ra đúng pha.
  if (await getResetTicket()) return <ResetPasswordForm />

  // Vào thẳng URL mà không có email thì không làm gì được — quay về bước 1.
  if (!email) redirect('/forgot-password')

  return <ResetOtpForm email={email} />
}
```

> `searchParams` là `Promise` và phải `await` — đây là API của Next.js 15+, và [verify-otp/page.tsx](<../app/(auth)/verify-otp/page.tsx>) trong repo đã theo đúng khuôn này.

### Bước 5 — Ba Client Component

```tsx
// components/auth/forgot-password-form.tsx
'use client'
import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { forgotPasswordAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialActionState)

  useEffect(() => {
    if (state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a 6-digit code to reset it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <SubmitButton>Send reset code</SubmitButton>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

```tsx
// components/auth/reset-otp-form.tsx
'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { verifyResetOtpAction, forgotPasswordAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ResetOtpForm({ email }: { email: string }) {
  const router = useRouter()
  const [state, formAction] = useActionState(verifyResetOtpAction, initialActionState)
  const [resendState, resendAction] = useActionState(forgotPasswordAction, initialActionState)

  useEffect(() => {
    // Action đã set cookie ticket. router.refresh() bắt Server Component
    // render lại; lần này getResetTicket() có giá trị → ra form mật khẩu.
    if (state.ok) router.refresh()
    else if (state.message) toast.error(state.message)
  }, [state, router])

  useEffect(() => {
    if (resendState.message) toast.error(resendState.message)
  }, [resendState])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your reset code</CardTitle>
        <CardDescription>
          If an account exists for {email || 'that address'}, a 6-digit code is on its way.
          It expires in 5 minutes — check your spam folder too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <div className="space-y-2">
            <Label htmlFor="otp">Reset code</Label>
            <Input
              id="otp" name="otp" inputMode="numeric" maxLength={6}
              required placeholder="______" autoComplete="one-time-code"
            />
          </div>
          <SubmitButton>Continue</SubmitButton>
        </form>
        <form action={resendAction}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="ghost" className="w-full">Resend code</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

> `autoComplete="one-time-code"` khiến iOS/Android gợi ý sẵn mã vừa nhận trên bàn phím. Một thuộc tính, bỏ hẳn một bước copy-paste cho phần lớn user mobile. [verify-otp-form.tsx](../components/auth/verify-otp-form.tsx) hiện thiếu nó — đáng thêm luôn.

```tsx
// components/auth/reset-password-form.tsx
'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { resetPasswordAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialActionState)

  useEffect(() => {
    if (state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          You&apos;ll be signed out everywhere and will need to sign in again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password" name="password" type="password"
              required minLength={6} autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword" name="confirmPassword" type="password"
              required minLength={6} autoComplete="new-password"
            />
          </div>
          <SubmitButton>Reset password</SubmitButton>
        </form>
      </CardContent>
    </Card>
  )
}
```

> `autoComplete="new-password"` (không phải `current-password`) là tín hiệu cho trình quản lý mật khẩu **đề xuất mật khẩu mới** và **lưu lại sau khi đổi**. Dùng sai giá trị ở đây khiến 1Password/Keychain điền đè mật khẩu cũ vào — một lỗi khó chịu mà user sẽ báo là "form bị lỗi".

### Bước 6 — Nối vào trang đăng nhập

```tsx
// components/auth/login-form.tsx — sửa khối Password
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <Label htmlFor="password">Password</Label>
    <Link
      href="/forgot-password"
      className="text-sm font-medium text-primary hover:underline"
    >
      Forgot password?
    </Link>
  </div>
  <Input id="password" name="password" type="password" required autoComplete="current-password" />
</div>
```

Và hiện thông báo sau khi reset thành công:

```tsx
// app/(auth)/login/page.tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; reset?: string }>
}) {
  const { redirect, reset } = await searchParams
  return <LoginForm redirectTo={redirect || '/seller'} justReset={reset === '1'} />
}
```

```tsx
// trong LoginForm — thêm prop justReset và:
useEffect(() => {
  if (justReset) toast.success('Password updated. Please sign in.')
}, [justReset])
```

> Đặt link "Forgot password?" **cạnh nhãn Password**, không phải dưới cùng thẻ. Người dùng tìm nó đúng vào lúc họ đang nhìn ô mật khẩu và nhận ra mình không nhớ — đó là thời điểm và vị trí họ quét mắt tới.

---

## 6. Những cái bẫy

### 6.1 Response luôn 200 — và cách nói thật với user

Backend trả 200 cho `/forgot-password` **kể cả khi email không tồn tại**, để kẻ tấn công không dò được tài khoản nào có thật (chi tiết ở tài liệu backend, mục 6.2). Hệ quả cho frontend: **không thể** hiện "Email không tồn tại", vì frontend cũng không biết.

Ba cách viết UI, hai cách sai:

| Cách viết | Vấn đề |
| --- | --- |
| ❌ "Đã gửi mã tới email của bạn." | Nói dối khi email không tồn tại. User ngồi chờ mãi một cái mail không bao giờ đến, rồi mở ticket support. |
| ❌ Gọi thêm API kiểm tra email tồn tại trước | Phá hỏng đúng thứ backend vừa bảo vệ. Đừng bao giờ làm. |
| ✅ "**Nếu** có tài khoản với địa chỉ này, mã sẽ đến trong vài phút. Nhớ kiểm tra cả thư mục spam." | Trung thực, và chữ "nếu" tự nó gợi ý user kiểm tra lại email mình vừa gõ. |

Đây là một ví dụ điển hình của việc **ràng buộc bảo mật đẩy chi phí sang trải nghiệm**, và phần bù đắp duy nhất nằm ở chất lượng câu chữ. Đừng coi nhẹ khâu viết microcopy ở màn này.

Có một hệ quả thứ hai ít người để ý: nút **"Resend code"** cũng gọi cùng endpoint đó, mà backend im lặng bỏ qua nếu chưa quá 60 giây. Nghĩa là user bấm "Resend" hai lần liên tiếp sẽ thấy **không có gì xảy ra cả** — không lỗi, không mail mới. Cách giảm đau: khoá nút và đếm ngược 60 giây phía client sau lần bấm đầu. Đó là trang trí (backend mới là nơi cưỡng chế thật), nhưng nó biến một sự im lặng khó hiểu thành một phản hồi rõ ràng.

### 6.2 Ticket: cookie `httpOnly`, không phải URL

Cách "tiện" nhất là chuyền ticket qua URL: `/reset-password?ticket=abc...`. Đừng làm.

| Nơi ticket bị rò rỉ khi nằm trong URL | Vì sao nghiêm trọng |
| --- | --- |
| Lịch sử trình duyệt | Còn đó rất lâu sau khi ticket hết hạn; máy dùng chung là lộ |
| Header `Referer` | Trình duyệt gắn URL hiện tại khi tải bất kỳ tài nguyên bên ngoài nào — ticket đi thẳng sang bên thứ ba |
| Access log của server/CDN | Query string thường được log nguyên văn |
| User copy link gửi cho người khác | "Sao anh mở giúp em cái link này" → tặng luôn quyền đổi mật khẩu |

Cookie `httpOnly` đóng cả bốn đường: không vào history, không vào `Referer`, không vào access log, không copy được. Và nó còn chặn thêm một hướng nữa — **JavaScript phía client không đọc được**, nên một lỗ XSS trên trang cũng không lấy được ticket.

> Một cách khác cũng an toàn tương đương: giữ ticket trong bộ nhớ của server và chỉ chuyền một id phiên. Nhưng với Next.js thì cookie `httpOnly` **chính là** cơ chế đó, chỉ là đã có sẵn và không cần thêm hạ tầng.

### 6.3 `redirect()` phải nằm NGOÀI `try/catch`

Đây là cái bẫy làm mất nhiều thời gian nhất của Server Actions.

`redirect()` của Next.js hoạt động bằng cách **ném một exception đặc biệt** (`NEXT_REDIRECT`) để framework bắt ở tầng trên. Nếu bạn gọi nó trong `try`, chính `catch` của bạn sẽ bắt mất:

```ts
// ❌ SAI — reset thành công nhưng user thấy thông báo lỗi
try {
  await apiFetch('/auth/reset-password', { body: { resetTicket, password } })
  redirect('/login?reset=1')        // ném NEXT_REDIRECT…
} catch (e) {
  return { ok: false, message: errorMessage(e, '…') }   // …và bị nuốt ở đây
}
```

Triệu chứng đặc trưng: **mật khẩu đổi thành công trong DB, nhưng UI báo lỗi và không chuyển trang.** Rất dễ đi truy vết nhầm sang backend.

```ts
// ✅ ĐÚNG — redirect sau khi try/catch đã kết thúc
try {
  await apiFetch('/auth/reset-password', { body: { resetTicket, password } })
} catch (e) {
  return { ok: false, message: errorMessage(e, '…') }
}
redirect('/login?reset=1')
```

Toàn bộ action hiện có trong [actions/auth.actions.ts](../actions/auth.actions.ts) đều đã theo đúng khuôn này — hãy giữ nguyên nhịp đó thay vì sáng tạo lại.

### 6.4 `proxy.ts` không cần sửa — nhưng phải hiểu vì sao

Phản xạ tự nhiên là nghĩ "thêm route public thì phải khai báo cho middleware bỏ qua". Ở repo này thì không, vì [proxy.ts](../proxy.ts) dùng **danh sách cho phép** chứ không phải danh sách chặn:

```ts
export const config = {
  matcher: ['/seller/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*'],
}
```

Proxy **chỉ chạy** trên 4 nhóm route đó. `/forgot-password` và `/reset-password` không nằm trong danh sách → proxy không bao giờ được gọi → mặc định là public. Không cần thêm gì.

Vì sao điều này đáng viết ra thay vì bỏ qua? Vì `matcher` kiểu allowlist có một đặc tính cần nhớ: **thêm route được bảo vệ mới thì phải nhớ sửa `matcher`**, nếu không route đó vô tình thành public. Chiều ngược lại (route public) thì miễn phí. Biết mình đang ở mô hình nào quyết định việc bạn phải nhớ điều gì.

> Kiểm chứng nhanh: đăng nhập rồi vào `/forgot-password` — không bị redirect, không bị refresh token. Đó là bằng chứng proxy không đụng tới route này.

### 6.5 Không tự đăng nhập sau khi reset

Backend cố tình **không** trả token ở bước cuối, khác với `verifyOtpAction` của luồng signup (nơi có `setSession`). Đừng cố "cải thiện" bằng cách gọi `loginAction` ngầm với mật khẩu vừa đặt.

Lý do phía frontend cần nắm: backend đã **xoá `keyToken`** của user, nghĩa là mọi cookie phiên hiện có đã chết. Nếu user đang đăng nhập ở một tab khác, tab đó cũng mất phiên. Đây là hành vi đúng và có chủ ý — điểm quan trọng của reset password là đẩy **mọi người khác** ra khỏi tài khoản, không chỉ cấp cho mình một chìa mới.

Vì vậy màn hình cuối nên nói rõ điều đó trước khi user bấm nút — chính là dòng *"You'll be signed out everywhere"* ở `CardDescription` trong Bước 5. Người dùng đang đăng nhập trên điện thoại cần biết trước, thay vì ngạc nhiên sau.

### 6.6 `state.ok` → `router.refresh()`: vì sao không redirect

`verifyResetOtpAction` không `redirect()` mà trả `{ ok: true }`, rồi component gọi `router.refresh()`. Ba lựa chọn và lý do chọn cái này:

| Cách | Vấn đề |
| --- | --- |
| `redirect('/reset-password')` trong action | Redirect về **chính URL hiện tại**. Hoạt động được, nhưng thêm một entry vào lịch sử trình duyệt, và mất `?email=` khiến nút back rơi vào trạng thái lạ |
| `useState` giữ pha trong client | F5 là mất pha, dù cookie ticket vẫn còn. User quay lại form OTP nhưng OTP đã bị backend xoá → kẹt hoàn toàn |
| ✅ `router.refresh()` | Server Component render lại, `getResetTicket()` lúc này có giá trị → ra form mật khẩu. URL không đổi, F5 vẫn đúng pha |

Ý tưởng chung đáng mang đi nơi khác: **khi trạng thái đã nằm trên server (ở đây là cookie), hãy để server quyết định render gì và dùng `router.refresh()` để hỏi lại** — thay vì nhân bản trạng thái đó xuống client rồi phải tự đồng bộ hai bản.

### 6.7 Cookie ticket chết nằm lại

`clearResetTicket()` chỉ chạy khi reset **thành công**. User bỏ ngang giữa chừng sẽ để lại một cookie sống 10 phút. Hệ quả: quay lại `/reset-password` trong 10 phút đó sẽ nhảy thẳng vào form mật khẩu, bỏ qua bước OTP.

Đây **không phải lỗ hổng** — ticket vẫn hợp lệ, vẫn là của đúng user đó, và backend vẫn tự hết hạn sau 10 phút. Nhưng nó có thể gây bối rối. Hai cách xử lý, tuỳ mức độ kỹ tính:

- **Chấp nhận** — 10 phút là ngắn, và tiếp tục đúng phiên của mình là hành vi hợp lý.
- **Thêm nút "Start over"** ở form mật khẩu, gọi một action nhỏ `clearResetTicket()` rồi `redirect('/forgot-password')`. Rẻ và làm user thấy mình kiểm soát được.

Điều **không** nên làm: xoá cookie trong `useEffect` khi component unmount. Client không quản lý được cookie `httpOnly`, và "unmount" không đồng nghĩa với "user bỏ cuộc".

---

## 7. When to use / When NOT to use

### Khuôn mẫu "wizard nhiều bước, trạng thái giữ trên server" ở đây dùng được cho

- **Mọi luồng có bước trung gian nhạy cảm**: xác minh danh tính, xác nhận thanh toán, onboarding nhiều trang.
- **Luồng cần sống sót qua F5** — đặt trạng thái vào cookie/DB, không vào `useState`.
- **Luồng mà bước sau không được phép chạy nếu bước trước chưa xong** — sự tồn tại của ticket chính là bằng chứng bước trước đã hoàn tất, và nó được cưỡng chế ở server.

### KHÔNG dùng khuôn mẫu này khi

| Tình huống | Nên làm gì |
| --- | --- |
| Wizard chỉ gom dữ liệu, không có bước nào nhạy cảm | Giữ trong client state hoặc URL query cho đơn giản — cookie là thừa |
| Cần giữ trạng thái lâu (nhiều ngày, nhiều thiết bị) | Lưu DB và tham chiếu bằng id, cookie không phải nơi chứa dữ liệu dài hạn |
| Trạng thái lớn (nhiều KB) | Cookie đi kèm **mọi** request → phình payload toàn site. Lưu server, cookie chỉ giữ id |
| Mỗi bước là một URL riêng người dùng cần bookmark/chia sẻ | Dùng route thật cho từng bước, đừng suy pha từ cookie |

### Vì sao không dùng thư viện form (react-hook-form, formik)?

Repo hiện dùng `useActionState` + `<form action={…}>` thuần. Có lý do và cần giữ nhất quán:

| | Server Actions (đang dùng) | react-hook-form |
| --- | --- | --- |
| Hoạt động khi JS chưa tải xong | ✅ form HTML gửi được ngay | ❌ phụ thuộc hoàn toàn vào JS |
| Nguồn chân lý của validation | Server (zod chạy trong action) | Client — vẫn **phải** validate lại ở server |
| JS gửi xuống trình duyệt | ~0 cho phần form | Thêm một thư viện |
| Validate ngay khi gõ (per-field) | Phải tự làm | ✅ có sẵn |

Với form 1–2 ô như luồng này, cột phải không mang lại gì đáng kể. Với form phức tạp (nhiều bước, phụ thuộc chéo giữa các field, validate theo thời gian thực) thì cân nhắc lại. Tiêu chí: **thêm thư viện khi nó giải quyết một vấn đề bạn đang thực sự có**, không phải vì quen tay.

---

## 8. Trade-offs — Đánh đổi

| Lợi ích | Chi phí |
| --- | --- |
| Ticket trong cookie `httpOnly` → XSS không lấy được | Client không "thấy" được trạng thái của chính nó; debug phải mở DevTools → Application → Cookies |
| Trạng thái pha suy ra từ server → F5 an toàn | Cần `router.refresh()` sau bước OTP — một nhịp kém trực giác hơn `setState` |
| 2 màn hình cho 3 endpoint → ít điều hướng | `/reset-password` phục vụ hai giao diện khác nhau — phải đọc `page.tsx` mới biết |
| Dùng lại toàn bộ khuôn mẫu sẵn có trong repo | Không có gì mới để học, nhưng cũng không có chỗ để sáng tạo lệch chuẩn |
| Zod validate trên server | Chưa có validate realtime khi gõ — user chỉ biết mật khẩu không khớp sau khi submit |
| Response 200 luôn → không dò được tài khoản | Không báo được "email không tồn tại" — user gõ nhầm sẽ chờ vô ích (mục 6.1) |
| Không tự đăng nhập sau reset | Thêm một bước; đổi lấy việc mọi phiên cũ bị huỷ thật sự |

Ô đáng bàn nhất là **"chưa có validate realtime"**. Ở form đặt mật khẩu mới, việc user chỉ biết hai ô không khớp *sau khi* bấm submit là một sự khó chịu thật. Nâng cấp rẻ nhất mà không cần thêm thư viện: một `useState` nhỏ so sánh hai ô và hiện dòng chữ đỏ dưới ô confirm. Zod ở server **vẫn phải giữ nguyên** — đó là hàng rào, cái kia chỉ là tiện ích.

---

## 9. Kiểm thử

Repo test bằng Vitest, tập trung vào hàm thuần trong `lib/` ([lib/\_\_tests\_\_](../lib/__tests__), [lib/auth/\_\_tests\_\_](../lib/auth/__tests__)).

> ⚠️ Node mặc định của máy là v20.9 và sẽ làm vitest chết trước khi chạy test nào. Chạy kèm Node 22:
> ```
> PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH" npx vitest run
> ```

Thứ **đáng test nhất** là các zod schema — chúng thuần khiết, không cần mock, và là nơi lỗi âm thầm nhất:

```ts
// lib/validations/__tests__/auth.test.ts
describe('resetPasswordSchema', () => {
  it('rejects mismatched passwords', () => {
    const r = resetPasswordSchema.safeParse({ password: 'abc123', confirmPassword: 'abc124' })
    expect(r.success).toBe(false)
  })
  it('rejects passwords shorter than 6', () => { /* … */ })
  it('accepts matching valid passwords', () => { /* … */ })
})

describe('resetOtpSchema', () => {
  it('rejects a 5-digit code', () => { /* … */ })
  it('rejects a non-numeric code', () => { /* … */ })
})
```

Server Actions khó test đơn vị (cần mock `cookies()`, `redirect()`, `fetch`). Với luồng này, đầu tư đúng hơn là **checklist thử tay**:

```
[ ] /login có link "Forgot password?" và bấm được
[ ] Nhập email KHÔNG tồn tại → vẫn chuyển sang màn OTP, không lộ thông tin gì
[ ] Nhập email hợp lệ → nhận mail, nhập OTP → ra màn mật khẩu
[ ] F5 giữa màn mật khẩu → VẪN ở màn mật khẩu (không quay về OTP)  ⭐
[ ] Nhập OTP sai → hiện toast lỗi, vẫn ở màn OTP
[ ] Hai ô mật khẩu không khớp → hiện lỗi, không gọi API
[ ] Reset xong → về /login kèm toast thành công
[ ] Sau khi reset, tab khác đang đăng nhập bị đá ra khi thao tác tiếp  ⭐
[ ] Đăng nhập bằng mật khẩu CŨ → thất bại
[ ] Đăng nhập bằng mật khẩu MỚI → thành công
[ ] DevTools → Cookies: reset_ticket có HttpOnly ✓, và biến mất sau khi reset xong  ⭐
```

Ba mục ⭐ kiểm chứng đúng ba quyết định thiết kế cốt lõi của tài liệu này.

---

## 10. Checklist triển khai

```
[ ] Backend đã xong và deploy (3 endpoint ở mục 3 gọi được)
[ ] Bước 1 — thêm 3 zod schema
[ ] Bước 2 — thêm lib/auth/reset-ticket.ts
[ ] Bước 3 — thêm 3 Server Action (redirect NGOÀI try/catch!)
[ ] Bước 4 — thêm 2 page
[ ] Bước 5 — thêm 3 client component
[ ] Bước 6 — thêm link vào login-form + toast ?reset=1
[ ] KHÔNG sửa proxy.ts (mục 6.4)
[ ] Viết test cho zod schema
[ ] Chạy hết checklist thử tay ở mục 9
```

---

## 11. Khái niệm liên quan

| Khái niệm | Vì sao liên quan | Đọc thêm |
| --- | --- | --- |
| Server Actions và forms | Nền tảng của cả 3 action ở đây | [11-server-actions-va-forms.md](./react-nextjs/11-server-actions-va-forms.md) |
| `proxy.ts`, session, auth | Hiểu vì sao route này public mà không cần khai báo | [12-proxy-middleware-va-auth.md](./react-nextjs/12-proxy-middleware-va-auth.md) |
| Server vs Client Components | Vì sao `page.tsx` đọc được cookie còn form thì không | [08-server-vs-client-components.md](./react-nextjs/08-server-vs-client-components.md) |
| Forms nâng cao | Validate realtime, `useFormStatus`, accessibility | [26-forms-nang-cao.md](./react-nextjs/26-forms-nang-cao.md) |
| Security nâng cao | `httpOnly`, XSS, rò rỉ qua `Referer` | [24-security-nang-cao.md](./react-nextjs/24-security-nang-cao.md) |
| Luồng phía backend | OTP, ticket, huỷ session | `Ecommerce-NodeJS/docs/19. forgot-password-flow-guide.md` |

---

## 12. Ghi chú của người đi trước

Ba câu hỏi một senior sẽ đặt ra khi review PR này:

**"Ticket nằm ở đâu?"** — Nếu câu trả lời có chữ "URL", "localStorage", hay "state", PR bị trả lại. Cookie `httpOnly` không phải lựa chọn thay thế ngang hàng ở đây; nó là lựa chọn duy nhất đúng, vì ticket là một bí mật đủ quyền đổi mật khẩu.

**"Bấm F5 ở màn cuối thì sao?"** — Đây là câu hỏi lộ ngay việc trạng thái đang được giữ ở client hay server. Wizard giữ pha bằng `useState` sẽ đưa user về bước OTP, nơi mã đã bị backend xoá — kẹt cứng, và không có đường thoát nào ngoài việc bắt đầu lại từ đầu.

**"Thông báo sau khi gửi mã viết thế nào?"** — Nghe như chuyện chữ nghĩa, nhưng nó kiểm tra xem bạn có *hiểu* vì sao backend luôn trả 200 hay chỉ đang gọi API cho xong. Người hiểu sẽ viết "nếu tài khoản tồn tại…"; người không hiểu sẽ viết "đã gửi tới email của bạn" và tạo ra một dòng ticket support đều đặn.

Và điều đáng mang theo nhất từ tài liệu này: **frontend của một luồng bảo mật không phải là nơi bảo mật được thực thi, nhưng là nơi nó dễ bị vô hiệu hoá nhất.** Backend có thể làm mọi thứ đúng — hash OTP, giới hạn số lần thử, huỷ session — và tất cả trở nên vô nghĩa nếu frontend đặt cái vé vào URL. Vai trò của bạn ở đây không phải là *thêm* bảo mật, mà là **không làm rò rỉ thứ đã được bảo vệ**.
