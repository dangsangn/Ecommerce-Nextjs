import 'server-only'
import { cookies, headers as requestHeaders } from 'next/headers'
import { COOKIE } from '@/lib/auth/tokens'
import { ApiError, buildHeaders, unwrap, type SessionHeaders } from '@/lib/api/http'
import { pickClientIp } from '@/lib/api/client-ip'

export interface FetchOptions {
  method?: string
  body?: unknown
  multipart?: FormData
  auth?: boolean
  tags?: string[]
  cache?: RequestCache
  signal?: AbortSignal
}

function baseUrl(): string {
  const url = process.env.BACKEND_URL
  if (!url) throw new Error('BACKEND_URL is not configured')
  return `${url}/api/v1`
}

async function currentClientIp(): Promise<string | undefined> {
  try {
    const h = await requestHeaders()
    return pickClientIp(h.get('x-forwarded-for'), Number(process.env.TRUST_PROXY ?? 0))
  } catch {
    // Outside a request (build, scripts) there is no end user to report.
    return undefined
  }
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  let session: SessionHeaders | undefined
  if (opts.auth) {
    const store = await cookies()
    session = {
      clientId: store.get(COOKIE.CLIENT)?.value,
      accessToken: store.get(COOKIE.ACCESS)?.value,
    }
  }

  const json = !opts.multipart && opts.body !== undefined
  const headers = buildHeaders({
    apiKey: process.env.API_KEY!,
    json,
    session,
    clientIp: await currentClientIp(),
  })

  const method = opts.method ?? (opts.body !== undefined || opts.multipart ? 'POST' : 'GET')
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: opts.multipart ?? (json ? JSON.stringify(opts.body) : undefined),
    cache: opts.cache ?? 'no-store',
    next: opts.tags ? { tags: opts.tags } : undefined,
    signal: opts.signal,
  })
  return unwrap<T>(res)
}

export { ApiError }
