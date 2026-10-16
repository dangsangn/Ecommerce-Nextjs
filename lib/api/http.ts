export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface SessionHeaders {
  clientId?: string
  accessToken?: string
}

export function buildHeaders(input: {
  apiKey: string
  json?: boolean
  session?: SessionHeaders
  clientIp?: string
}): Record<string, string> {
  const headers: Record<string, string> = { 'x-api-key': input.apiKey }
  if (input.json) headers['content-type'] = 'application/json'
  if (input.session?.clientId) headers['x-client-id'] = input.session.clientId
  if (input.session?.accessToken) headers['authorization'] = input.session.accessToken
  // Browsers never reach the backend directly, so it cannot see who the user
  // is. The backend only believes this header from a trusted API key.
  if (input.clientIp) headers['x-end-user-ip'] = input.clientIp
  return headers
}

export async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body && (body as { message?: string }).message) ||
      `Request failed (${res.status})`
    throw new ApiError(res.status, message as string)
  }
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}
