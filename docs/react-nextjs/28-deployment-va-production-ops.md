# 28. Deployment & Production Ops

> **Mục tiêu:** đưa app lên production **an toàn và quan sát được**. Env var build-time vs runtime,
> Docker standalone, health check, cache trên nhiều instance, và observability.
> Đây là phần khiến app "chạy được ở local" trở thành "chạy được thật".

---

## 1. ⭐ Env var: build-time vs runtime — sai lầm tốn kém nhất

### Ba loại env var trong Next.js, hành vi hoàn toàn khác nhau

📄 `.env.example` của repo:

```bash
# URL của backend Express (không có /api/v1 ở cuối)
BACKEND_URL=http://localhost:5000
# API key hợp lệ đã seed trong DB backend (permission phải chứa 0000)
API_KEY=
```

| Loại | Ví dụ | Đọc lúc nào | Ai thấy được |
| --- | --- | --- | --- |
| **Server, runtime** | `BACKEND_URL`, `API_KEY` | Mỗi lần code chạy | Chỉ server |
| **`NEXT_PUBLIC_*`** | `NEXT_PUBLIC_SITE_URL` | **INLINE LÚC BUILD** | **Ai cũng thấy** |
| **Build-time only** | `ANALYZE`, `NODE_ENV` | Lúc build | — |

### Cạm bẫy: `NEXT_PUBLIC_*` bị đóng băng vào bundle

```tsx
// Trong bất kỳ component
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
```

Sau `next build`, dòng này **không còn là biến** — nó đã bị thay bằng chuỗi literal:

```js
const siteUrl = "https://staging.shop.example.com"     // đóng băng
```

**Hệ quả thực tế:** bạn build một Docker image ở staging rồi deploy image đó lên production với
`NEXT_PUBLIC_SITE_URL` mới → **giá trị cũ vẫn nằm trong bundle**. App trỏ về staging ở production.

```
❌ Sai:  build một lần → deploy cùng image cho staging + production
✅ Đúng: build RIÊNG cho mỗi môi trường, HOẶC không dùng NEXT_PUBLIC_ cho giá trị đổi theo môi trường
```

### Cách tránh: đưa giá trị runtime qua Server Component

Thay vì `NEXT_PUBLIC_*`, đọc ở server rồi truyền xuống làm prop:

```tsx
// lib/config/public.ts
import 'server-only'

/** Cấu hình public — đọc lúc RUNTIME, an toàn với một image nhiều môi trường. */
export function getPublicConfig() {
  return {
    siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
    // ⚠️ Chỉ đưa vào đây thứ THỰC SỰ an toàn khi lộ ra client
  }
}
```

```tsx
// app/layout.tsx
import { getPublicConfig } from '@/lib/config/public'

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const config = getPublicConfig()       // đọc mỗi request, không đóng băng
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ConfigProvider value={config}>{children}</ConfigProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
```

⚖️ **Trade-off:** cần một Context (file `05`) và làm route thành dynamic. Với repo này **route đã dynamic
hết rồi** (file `10`), nên không mất gì thêm. Với app có route static, đây là chi phí thật.

**Khi nào `NEXT_PUBLIC_*` vẫn ổn:** giá trị **giống nhau ở mọi môi trường** — ví dụ một feature flag
cứng, hoặc tên app.

### Validate env var lúc khởi động — fail nhanh

📄 Repo hiện fail **lúc chạy request đầu tiên**:

```tsx
// lib/api/server-client.ts
function baseUrl(): string {
  const url = process.env.BACKEND_URL
  if (!url) throw new Error('BACKEND_URL is not configured')
  return `${url}/api/v1`
}
```

Tốt hơn không có gì, nhưng bạn chỉ biết khi có người truy cập. Nếu thiếu `API_KEY` thì còn tệ hơn —
📄 nó dùng `!` và **không kiểm tra gì**:

```tsx
const headers = buildHeaders({ apiKey: process.env.API_KEY!, json, session })
```

`API_KEY` là `undefined` → header `x-api-key: undefined` → backend trả 401 → người dùng thấy
"Could not load products". **Không ai biết nguyên nhân thật là thiếu env var.**

**Sửa: validate tập trung, fail lúc khởi động:**

```tsx
// lib/config/env.ts
import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  BACKEND_URL: z.string().url('BACKEND_URL phải là URL hợp lệ').refine(
    (u) => !u.endsWith('/'),
    'BACKEND_URL không được có "/" ở cuối (baseUrl() sẽ nối thêm /api/v1)',
  ),
  API_KEY: z.string().min(1, 'API_KEY không được rỗng'),
  SITE_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    // In ra TẤT CẢ vấn đề, không chỉ cái đầu — người deploy sửa một lượt
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`\n❌ Cấu hình môi trường không hợp lệ:\n${issues}\n`)
  }
  return parsed.data
}

/**
 * Đọc và validate MỘT LẦN khi module được import.
 * Nếu thiếu env var, app không khởi động được — thay vì lỗi 401 bí ẩn ở runtime.
 */
export const env = loadEnv()
```

```tsx
// lib/api/server-client.ts
import { env } from '@/lib/config/env'

function baseUrl(): string {
  return `${env.BACKEND_URL}/api/v1`      // đã validate, không cần kiểm tra
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  // ...
  const headers = buildHeaders({ apiKey: env.API_KEY, json, session })   // ⭐ không còn `!`
```

**Ba lợi ích:**
1. **Fail lúc khởi động**, không phải lúc có người dùng
2. **Message rõ ràng** liệt kê mọi env var thiếu
3. **Không còn `!`** — TypeScript biết `env.API_KEY` là `string`

⚠️ **Lưu ý về `refine` kiểm tra dấu `/` ở cuối.** Đây là một loại bug thật: nếu ai đó set
`BACKEND_URL=http://api.local/`, thì `baseUrl()` trả `http://api.local//api/v1` — double slash.
Nhiều server xử lý được, một số trả 404. Validate ngăn nó từ đầu.

---

## 2. Docker với `output: 'standalone'`

### Vì sao cần `standalone`

Mặc định, để chạy Next.js production bạn cần cả `node_modules` (~500MB với dependencies của repo này).
`output: 'standalone'` phân tích dependency graph và copy **chỉ những file thực sự cần** vào một thư
mục tự chứa (~50-100MB).

```tsx
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo has multiple lockfiles (backend + frontend) — pin the workspace root to this app directory.
  turbopack: {
    root: import.meta.dirname,
  },
  output: 'standalone',              // ⭐ cho Docker
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
```

### Dockerfile multi-stage

```dockerfile
# ---------- Stage 1: dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app

# pnpm qua corepack — phiên bản khớp với packageManager trong package.json
RUN corepack enable pnpm

# Copy CHỈ manifest trước → layer này được cache khi code đổi mà deps không đổi
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- Stage 2: build ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ⚠️ Nếu có NEXT_PUBLIC_*, chúng phải có Ở ĐÂY (build time) — xem mục 1
# ARG NEXT_PUBLIC_SITE_URL
# ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

ENV NEXT_TELEMETRY_DISABLED=1

# ⚠️ Env var mà BUILD cần (nếu có generateStaticParams gọi API):
# repo này không cần, vì mọi route là dynamic (file 10)
RUN pnpm build

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ⭐ Chạy bằng user không phải root — nguyên tắc bảo mật cơ bản
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# public/ cần copy riêng — standalone không bao gồm nó
COPY --from=builder /app/public ./public

# ⭐ standalone chứa server.js + node_modules tối giản
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# ⭐ static/ cũng phải copy riêng
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Health check ở tầng container — orchestrator dùng nó để biết container sống
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

**Bốn chi tiết dễ sai:**

| # | Chi tiết | Nếu bỏ |
| --- | --- | --- |
| 1 | Copy `public/` và `.next/static` **riêng** | Ảnh, font, CSS trả 404 |
| 2 | `HOSTNAME=0.0.0.0` | Server chỉ listen localhost → container không nhận traffic |
| 3 | User `nextjs` không phải root | Nếu bị RCE, kẻ tấn công có root trong container |
| 4 | `pnpm-workspace.yaml` được copy ở stage deps | 📄 Repo có file này → `pnpm install` lỗi nếu thiếu |

📄 **Chi tiết #4 đặc thù repo này.** Nó có `pnpm-workspace.yaml` và backend là thư mục **sibling**
(`../E-Commerce-NodeJS`). `turbopack.root` được pin để xử lý nhiều lockfile. Trong Docker, build context
chỉ có thư mục frontend — nên `pnpm-workspace.yaml` phải được copy, nhưng nó **không** khai báo package
nào nên `pnpm install` vẫn hoạt động bình thường.

### `.dockerignore` — bắt buộc

```
node_modules
.next
.git
.env*
!.env.example
docs
*.md
.claude
.agents
coverage
```

Không có nó, `COPY . .` copy cả `node_modules` (500MB) và `.next` (build cũ) vào image — chậm và có thể
gây lỗi khó hiểu (build cũ lẫn với build mới).

⚠️ **`.env*` trong `.dockerignore` là bắt buộc về bảo mật.** Nếu `.env.local` chứa `API_KEY` thật bị
copy vào image, ai pull được image đó sẽ có secret của bạn.

---

## 3. Health check và readiness

Orchestrator (Kubernetes, ECS, Docker Compose) cần biết hai điều khác nhau:

| Endpoint | Câu hỏi | Fail thì làm gì |
| --- | --- | --- |
| **liveness** | "Process còn sống?" | **Restart container** |
| **readiness** | "Sẵn sàng nhận traffic?" | **Ngừng gửi traffic** (không restart) |

```tsx
// app/api/health/route.ts — LIVENESS: cực nhẹ, không phụ thuộc gì
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ status: 'ok' })
}
```

```tsx
// app/api/ready/route.ts — READINESS: kiểm tra dependency
import { env } from '@/lib/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 2000

export async function GET() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // Gọi một endpoint NHẸ của backend — đừng gọi endpoint nặng
    const res = await fetch(`${env.BACKEND_URL}/api/v1/health`, {
      headers: { 'x-api-key': env.API_KEY },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      return Response.json({ status: 'degraded', backend: res.status }, { status: 503 })
    }
    return Response.json({ status: 'ready' })
  } catch (e) {
    const reason = e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'unreachable'
    return Response.json({ status: 'degraded', backend: reason }, { status: 503 })
  } finally {
    clearTimeout(timer)
  }
}
```

⚠️ **Vì sao PHẢI tách hai endpoint:**

Nếu liveness cũng kiểm tra backend, và backend sập 5 phút → orchestrator **restart tất cả** container
Next.js. Nhưng Next.js **không sai gì** — restart nó không giúp gì, và khi backend hồi phục bạn lại có
một loạt cold start.

**Liveness chỉ trả lời "process này có bị treo không".** Readiness mới quan tâm dependency.

⚠️ **Và không đặt `/api/health` trong `proxy.ts` matcher** — nó không có cookie, sẽ bị `redirectToLogin`
(nhớ file `20`, cùng vấn đề với webhook).

---

## 4. ⭐ Cache trên nhiều instance

Đây là vấn đề "chỉ xuất hiện ở production" phổ biến nhất.

### Vấn đề

Next.js mặc định lưu Data Cache và Full Route Cache **trên filesystem của instance đó**
(`.next/cache`). Với **một** instance thì ổn. Với ba instance sau load balancer:

```
Instance A:  cache có product-123
Instance B:  cache KHÔNG có product-123
Instance C:  cache có product-123 (bản CŨ)

revalidateTag('products') gọi trên instance A
  → chỉ cache của A bị xoá
  → B và C vẫn trả dữ liệu cũ
```

**Người dùng thấy dữ liệu khác nhau tuỳ vào instance nào phục vụ họ** — và refresh trang có thể cho
kết quả khác nhau. Đây là loại bug khiến người ta mất cả ngày.

📄 **Với repo hiện tại, vấn đề này KHÔNG xảy ra** — vì mọi fetch là `cache: 'no-store'` (file `10`).
**Nhưng nó sẽ xảy ra ngay khi bạn thêm `force-cache` + tag** như đề xuất ở file `10` và `22`.

### Giải pháp: cache handler dùng chung

```tsx
// cache-handler.mjs
import { createClient } from 'redis'

const client = createClient({ url: process.env.REDIS_URL })
client.on('error', (e) => console.error('[cache] redis error', e))
await client.connect()

const PREFIX = 'next:cache:'
const TAG_PREFIX = 'next:tag:'

export default class RedisCacheHandler {
  async get(key) {
    try {
      const raw = await client.get(PREFIX + key)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      console.error('[cache] get failed, coi như miss', e)
      return null                                    // fail-open: cache lỗi → fetch lại
    }
  }

  async set(key, data, ctx) {
    try {
      const value = JSON.stringify({ value: data, lastModified: Date.now(), tags: ctx?.tags ?? [] })
      // TTL để cache không phình vô hạn
      await client.set(PREFIX + key, value, { EX: 60 * 60 * 24 })

      // Lưu quan hệ tag → key để revalidateTag hoạt động xuyên instance
      for (const tag of ctx?.tags ?? []) {
        await client.sAdd(TAG_PREFIX + tag, key)
      }
    } catch (e) {
      console.error('[cache] set failed, bỏ qua', e)  // fail-open
    }
  }

  async revalidateTag(tags) {
    const list = Array.isArray(tags) ? tags : [tags]
    try {
      for (const tag of list) {
        const keys = await client.sMembers(TAG_PREFIX + tag)
        if (keys.length > 0) {
          await client.del(keys.map((k) => PREFIX + k))
        }
        await client.del(TAG_PREFIX + tag)
      }
    } catch (e) {
      console.error('[cache] revalidateTag failed', e)
    }
  }
}
```

```tsx
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  output: 'standalone',
  cacheHandler: process.env.REDIS_URL ? require.resolve('./cache-handler.mjs') : undefined,
  cacheMaxMemorySize: 0,      // tắt in-memory cache, dùng Redis làm nguồn duy nhất
}
```

**Chi tiết quan trọng — `fail-open`:** mọi lỗi Redis đều `console.error` rồi trả `null`/bỏ qua, chứ
**không throw**. Nếu Redis sập, app vẫn chạy (chỉ chậm hơn vì mọi request đều fetch). Cache là tối ưu,
không phải chức năng — nó **không được** làm sập app.

⚠️ **Trên Vercel, bạn không cần cái này** — họ có cache layer dùng chung sẵn. Đây là bài toán của
self-host (Docker, K8s, VPS).

**Cách phát hiện bạn đang gặp vấn đề này:**

```bash
# Gọi cùng URL nhiều lần, xem có kết quả khác nhau
for i in $(seq 1 10); do curl -s https://shop.example.com/api/debug/cache-probe; echo; done
```

Nếu kết quả nhảy qua lại giữa các giá trị → bạn có nhiều instance với cache không đồng bộ.

---

## 5. `after()` — việc chạy sau khi response đã gửi

Một API rất hữu ích mà ít người biết: `after()` cho phép chạy code **sau khi response đã gửi cho người
dùng**, mà không làm họ phải chờ.

```tsx
import { after } from 'next/server'

export async function placeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // ...validate và đặt hàng như hiện tại...
  try {
    await apiFetch('/order', { auth: true, body: { shop_order_ids: shopOrderIds, user_address, user_payment } })
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Không đặt được hàng') }
  }

  // ⭐ Chạy SAU khi người dùng đã được redirect — họ không chờ analytics
  after(async () => {
    try {
      await logOrderPlaced({ shopCount: shopOrderIds.length, total: user_payment.method })
    } catch (e) {
      console.error('[after] analytics failed', e)     // KHÔNG throw — nó chỉ là analytics
    }
  })

  revalidatePath('/orders')
  revalidatePath('/cart')
  redirect('/orders')
}
```

**Dùng `after()` cho:**

| Việc | Vì sao phù hợp |
| --- | --- |
| Analytics / event tracking | Người dùng không cần chờ |
| Structured logging | Cùng lý do |
| Gửi email thông báo (nếu nhanh) | Không nên chặn redirect |
| Cập nhật cache phụ | Không ảnh hưởng response |

⚠️ **Ba giới hạn:**

1. **Không dùng cho việc bắt buộc phải thành công.** Nếu `after()` fail, người dùng đã đi rồi —
   không có cách nào báo lỗi. Việc quan trọng phải `await` trước khi trả response.
2. **Luôn `try/catch` trong `after()`.** Lỗi không được bắt có thể làm crash function.
3. **Trên serverless có giới hạn thời gian.** Việc chạy quá lâu sẽ bị cắt. Với việc dài → dùng queue.

---

## 6. Observability — structured logging

### Vấn đề với `console.log`

📄 Repo hiện có:

```tsx
console.log('🚀 ~ files:', files)      // product.actions.ts
```

Log kiểu này **không query được**. Với 10.000 dòng log/giờ, bạn không thể trả lời "có bao nhiêu lỗi
401 trong giờ qua?" hoặc "request nào chậm hơn 1 giây?".

### Structured logging

```tsx
// lib/observability/logger.ts
import 'server-only'

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  requestId?: string
  userId?: string
  path?: string
  durationMs?: number
  status?: number
  [key: string]: unknown
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')]

/** Field không bao giờ được log (file 24) */
const REDACT = new Set(['password', 'token', 'accessToken', 'refreshToken', 'apiKey', 'authorization', 'x-api-key'])

function sanitize(ctx: LogContext): LogContext {
  const out: LogContext = {}
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = REDACT.has(k) ? '[REDACTED]' : v
  }
  return out
}

function log(level: Level, message: string, ctx: LogContext = {}) {
  if (LEVELS[level] < MIN_LEVEL) return

  const entry = { level, message, ts: new Date().toISOString(), ...sanitize(ctx) }

  // JSON một dòng — mọi log aggregator (CloudWatch, Datadog, Loki) parse được
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (m: string, c?: LogContext) => log('debug', m, c),
  info: (m: string, c?: LogContext) => log('info', m, c),
  warn: (m: string, c?: LogContext) => log('warn', m, c),
  error: (m: string, c?: LogContext) => log('error', m, c),
}
```

```tsx
// lib/api/server-client.ts
import { logger } from '@/lib/observability/logger'

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  assertSafePath(path)                                    // file 24
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  const method = opts.method ?? (opts.body !== undefined || opts.multipart ? 'POST' : 'GET')

  // ...build headers, thêm x-request-id (file 25)...

  try {
    const res = await fetch(`${baseUrl()}${path}`, { /* ... */ })
    const data = await unwrap<T>(res)
    logger.info('api.request', { requestId, method, path, status: res.status, durationMs: Date.now() - startedAt })
    return data
  } catch (e) {
    logger.error('api.request.failed', {
      requestId,
      method,
      path,
      durationMs: Date.now() - startedAt,
      status: e instanceof ApiError ? e.status : undefined,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}
```

Giờ bạn query được:

```
level="error" AND message="api.request.failed" AND status=401
message="api.request" AND durationMs>1000
requestId="abc-123"                                  ← trace một request xuyên hệ thống
```

**`sanitize` với `REDACT` là chi tiết bảo mật quan trọng** (file `24`): ngay cả khi ai đó vô tình
truyền `{ token }` vào context, nó không lọt vào log.

### Nối với error boundary

Nhớ file `16`: `error.tsx` có `error.digest`. Nối nó vào log:

```tsx
// app/(store)/error.tsx
'use client'
import { useEffect } from 'react'

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Gửi lên endpoint để log ở server (client không dùng được logger server-only)
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        digest: error.digest,
        message: error.message,
        pathname: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => { /* im lặng — báo lỗi không được gây lỗi */ })
  }, [error])
  // ...
}
```

```tsx
// app/api/client-error/route.ts
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return new Response(null, { status: 400 })

  logger.error('client.error', {
    digest: String((body as Record<string, unknown>).digest ?? ''),
    message: String((body as Record<string, unknown>).message ?? '').slice(0, 500),
    path: String((body as Record<string, unknown>).pathname ?? ''),
  })
  return new Response(null, { status: 204 })
}
```

**Bây giờ vòng tròn đã đóng:** người dùng báo "mã lỗi 1234567890" → bạn grep `digest="1234567890"` →
thấy cả log client (path, message rút gọn) **và** log server gốc (message thật, stack).

---

## 7. Checklist deployment

### Trước lần deploy đầu

- [ ] `pnpm build` chạy sạch ở local, không warning
- [ ] `pnpm typecheck` và `pnpm lint` sạch
- [ ] `pnpm test:run` xanh
- [ ] `.env.example` liệt kê **mọi** env var cần thiết
- [ ] Env var được validate lúc khởi động (mục 1)
- [ ] `.dockerignore` có `.env*` và `node_modules`
- [ ] `/api/health` và `/api/ready` hoạt động, **không** trong proxy matcher
- [ ] Container chạy bằng user không phải root
- [ ] `HOSTNAME=0.0.0.0` được set
- [ ] `public/` và `.next/static` được copy trong Dockerfile
- [ ] Security header + CSP (file `24`) — bắt đầu bằng `report-only`
- [ ] Source map upload lên monitoring, **không** deploy công khai (file `25`)

### Mỗi lần deploy

- [ ] Chạy `pnpm build` **trong CI**, không build ở máy dev
- [ ] Nếu có `NEXT_PUBLIC_*`: build riêng cho môi trường đích
- [ ] Kiểm tra `/api/ready` trả 200 **trước khi** đưa traffic vào
- [ ] Có kế hoạch rollback (giữ image trước đó, deploy theo tag không phải `latest`)
- [ ] Theo dõi log 10 phút sau deploy — tìm spike của `level="error"`

### Rollback

```bash
# ❌ Không rollback được
docker run myapp:latest

# ✅ Deploy theo git SHA — rollback là đổi một tag
docker run myapp:a1b2c3d
```

⚠️ **Cạm bẫy rollback đặc thù Next.js:** nếu build mới đổi cấu trúc chunk, người dùng đang mở tab cũ
sẽ request chunk **không còn tồn tại** → lỗi "Loading chunk failed". Xử lý:

```tsx
// components/chunk-error-reloader.tsx
'use client'
import { useEffect } from 'react'

/**
 * Sau khi deploy, tab đang mở có thể request chunk đã bị xoá.
 * Reload một lần để lấy bundle mới.
 */
export function ChunkErrorReloader() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (!/Loading chunk|Failed to fetch dynamically imported module/i.test(e.message)) return
      // Chỉ reload MỘT lần — tránh vòng lặp reload vô hạn
      if (sessionStorage.getItem('chunk-reload') === '1') return
      try { sessionStorage.setItem('chunk-reload', '1') } catch { /* ignore */ }
      window.location.reload()
    }
    window.addEventListener('error', onError)
    return () => window.removeEventListener('error', onError)
  }, [])
  return null
}
```

**Cờ `chunk-reload` là bắt buộc** — không có nó, nếu lỗi vẫn tiếp diễn sau reload, bạn tạo vòng lặp
reload vô hạn (một sự cố production kinh điển).

---

## 8. Trade-offs

| Quyết định | Lợi ích | Cái giá |
| --- | --- | --- |
| **Validate env lúc khởi động** | Fail nhanh, message rõ | App không start nếu thiếu — đúng, nhưng gây "downtime" nếu config sai |
| **Tránh `NEXT_PUBLIC_*`** | Một image cho mọi môi trường | Cần Context; route thành dynamic |
| **`output: 'standalone'`** | Image nhỏ 5-10× | Phải copy `public/` + `static/` tay |
| **Tách liveness/readiness** | Không restart vô ích khi backend sập | Hai endpoint phải bảo trì |
| **Redis cache handler** | Cache đồng bộ mọi instance | Thêm một dependency hạ tầng; phải fail-open |
| **`after()`** | Response nhanh hơn | Việc trong đó có thể fail âm thầm |
| **Structured logging** | Query được, trace được | Log dài hơn, khó đọc bằng mắt ở dev |
| **Deploy theo SHA** | Rollback tức thì | Cần registry giữ nhiều image |

---

## 9. Best Practices

1. **`NEXT_PUBLIC_*` bị đóng băng lúc build.** Đừng dùng nó cho giá trị đổi theo môi trường.

2. **Validate env var tập trung bằng Zod, fail lúc khởi động.** Xoá mọi `process.env.X!`.

3. **`BACKEND_URL` không được có `/` ở cuối** — validate luôn trong schema.

4. **Tách liveness khỏi readiness.** Liveness không được phụ thuộc backend.

5. **Health check endpoint không nằm trong proxy matcher.**

6. **Container chạy bằng non-root user, `HOSTNAME=0.0.0.0`.**

7. **`.dockerignore` phải có `.env*`.** Secret trong image là rò rỉ vĩnh viễn.

8. **Cache handler dùng chung nếu self-host nhiều instance** — và luôn fail-open.

9. **`after()` cho analytics/log, không cho việc bắt buộc thành công.** Luôn `try/catch` bên trong.

10. **Structured JSON log với redact list.** Nối `requestId` và `error.digest` để trace xuyên tầng.

11. **Deploy theo git SHA, không `latest`.** Và có `ChunkErrorReloader` với cờ chống loop.

12. **Build trong CI, không trên máy dev.** Máy dev có state không tái tạo được.

---

## Tự kiểm tra

1. Vì sao build một image rồi deploy cho cả staging và production là sai nếu có `NEXT_PUBLIC_*`?
2. Thiếu `API_KEY` hiện gây triệu chứng gì? Vì sao khó chẩn đoán?
3. Vì sao phải validate `BACKEND_URL` không có `/` ở cuối?
4. Vì sao `output: 'standalone'` vẫn cần copy `public/` và `.next/static` tay?
5. Chuyện gì xảy ra nếu thiếu `HOSTNAME=0.0.0.0`?
6. Vì sao liveness **không được** kiểm tra backend?
7. Mô tả bug cache trên 3 instance. Vì sao repo hiện chưa gặp?
8. Vì sao cache handler phải fail-open?
9. Khi nào KHÔNG dùng `after()`?
10. Vì sao `ChunkErrorReloader` cần cờ trong sessionStorage?

➡️ Tiếp theo: `29-testing-e2e-va-tich-hop.md`
