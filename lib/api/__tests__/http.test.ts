import { describe, it, expect } from 'vitest'
import { buildHeaders, unwrap, ApiError } from '@/lib/api/http'

describe('buildHeaders', () => {
  it('always sets x-api-key', () => {
    expect(buildHeaders({ apiKey: 'K' })).toEqual({ 'x-api-key': 'K' })
  })
  it('sets content-type when json=true', () => {
    expect(buildHeaders({ apiKey: 'K', json: true })['content-type']).toBe('application/json')
  })
  it('sets x-client-id and authorization from the session', () => {
    const h = buildHeaders({ apiKey: 'K', session: { clientId: 'u1', accessToken: 'tok' } })
    expect(h['x-client-id']).toBe('u1')
    expect(h['authorization']).toBe('tok')
  })
  it('omits auth headers when the session is empty', () => {
    const h = buildHeaders({ apiKey: 'K', session: {} })
    expect(h['x-client-id']).toBeUndefined()
    expect(h['authorization']).toBeUndefined()
  })
})

function fakeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('unwrap', () => {
  it('returns data on a 2xx response', async () => {
    const data = await unwrap<{ x: number }>(fakeRes(200, { message: 'OK', statusCode: 200, data: { x: 1 } }))
    expect(data).toEqual({ x: 1 })
  })
  it('returns the raw body when there is no data field', async () => {
    const data = await unwrap<{ y: number }>(fakeRes(200, { y: 2 }))
    expect(data).toEqual({ y: 2 })
  })
  it('throws ApiError with the backend message on error', async () => {
    await expect(unwrap(fakeRes(400, { message: 'Wrong password' }))).rejects.toMatchObject({
      status: 400,
      message: 'Wrong password',
    })
  })
  it('throws ApiError with a default message when the body cannot be parsed', async () => {
    const res = { ok: false, status: 500, json: async () => { throw new Error('bad') } } as unknown as Response
    await expect(unwrap(res)).rejects.toBeInstanceOf(ApiError)
  })
})
