export type UsageResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number | null; error: string; retryAfterSeconds?: number }

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

  const retryAfter = res.headers.get('retry-after')
  const result: UsageResult = {
    ok: false,
    status: res.status,
    error: ERROR_BY_STATUS[res.status] ?? `http_${res.status}`,
  }
  if (retryAfter && !Number.isNaN(Number(retryAfter))) {
    result.retryAfterSeconds = Number(retryAfter)
  }
  return result
}
