import { describe, expect, it } from 'vitest'
import { fetchUsage } from '../../src/api/usageClient'

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })) as unknown as typeof fetch
}

describe('fetchUsage', () => {
  it('returns the raw body on 200', async () => {
    const body = {
      fetchedAt: '2026-09-21T11:00:00.000Z',
      upstreamStatus: 200,
      headers: { 'anthropic-ratelimit-unified-5h-utilization': '0.28' },
      usage: { input_tokens: 22, output_tokens: 1 },
    }
    const result = await fetchUsage('tok', mockFetch(200, body))
    expect(result).toEqual({ ok: true, status: 200, body })
  })

  it('sends the bearer token to /api/usage', async () => {
    let seenUrl = ''
    let seenAuth = ''
    const spy = (async (url: string, init?: RequestInit) => {
      seenUrl = url
      seenAuth = (init?.headers as Record<string, string>).Authorization
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    await fetchUsage('sk-ant-oat-x', spy)
    expect(seenUrl).toBe('/api/usage')
    expect(seenAuth).toBe('Bearer sk-ant-oat-x')
  })

  it('maps 401 to an error result', async () => {
    const result = await fetchUsage(
      'bad',
      mockFetch(401, { upstreamStatus: 401, headers: {}, error: { type: 'authentication_error' } }),
    )
    expect(result).toEqual({ ok: false, status: 401, error: 'unauthorized' })
  })

  it('exposes retry-after on 429', async () => {
    const result = await fetchUsage('tok', mockFetch(429, {}, { 'retry-after': '45' }))
    expect(result).toEqual({ ok: false, status: 429, error: 'rate_limited', retryAfterSeconds: 45 })
  })

  it('maps network failures to status null', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const result = await fetchUsage('tok', failing)
    expect(result).toEqual({ ok: false, status: null, error: 'Failed to fetch' })
  })
})
