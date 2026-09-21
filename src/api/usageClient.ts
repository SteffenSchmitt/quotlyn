export type UsageResult =
  | { ok: true; status: number; body: unknown }
  | {
      ok: false
      status: number | null
      error: string
      retryAfterSeconds?: number
      /** 429 that still carries usage headers: the subscription window is used up, not the API throttling us. */
      limitReached?: boolean
      body?: unknown
    }

const LIMIT_MARKER = 'anthropic-ratelimit-unified-status'

function hasUsageHeaders(body: unknown): boolean {
  const headers = (body as { headers?: Record<string, unknown> } | null)?.headers
  return !!headers && typeof headers === 'object' && LIMIT_MARKER in headers
}

const ERROR_BY_STATUS: Record<number, string> = {
  401: 'unauthorized',
  403: 'forbidden',
  429: 'rate_limited',
}

export async function fetchUsage(token: string, fetchImpl: typeof fetch = fetch): Promise<UsageResult> {
  let res: Response
  try {
    res = await fetchImpl('/api/usage', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : String(err) }
  }

  if (res.ok) {
    return { ok: true, status: res.status, body: await res.json() }
  }

  let body: unknown = undefined
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  const retryAfter = res.headers.get('retry-after')
  const result: UsageResult = {
    ok: false,
    status: res.status,
    error: ERROR_BY_STATUS[res.status] ?? `http_${res.status}`,
  }
  if (body !== undefined) result.body = body
  if (res.status === 429 && hasUsageHeaders(body)) {
    result.limitReached = true
    result.error = 'limit_reached'
  }
  if (retryAfter && !Number.isNaN(Number(retryAfter))) {
    result.retryAfterSeconds = Number(retryAfter)
  }
  return result
}
