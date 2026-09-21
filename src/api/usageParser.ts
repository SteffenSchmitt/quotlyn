export interface UsageWindow {
  key: string
  utilization: number
  resetsAt: string | null
  status: string | null
}

export interface ParsedUsage {
  fetchedAt: string
  windows: UsageWindow[]
  overall: {
    status: string | null
    representativeClaim: string | null
    resetsAt: string | null
    fallbackPercentage: number | null
  }
  overage: { status: string | null; disabledReason: string | null }
  raw: Record<string, string>
  usage: { inputTokens: number; outputTokens: number } | null
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

const PREFIX = 'anthropic-ratelimit-unified-'
const WINDOW_RE = /^anthropic-ratelimit-unified-(.+)-utilization$/

export function epochSecondsToIso(s: string | undefined): string | null {
  if (s === undefined) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return new Date(n * 1000).toISOString()
}

function num(s: string | undefined): number | null {
  if (s === undefined) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parseUsage(body: unknown): ParsedUsage {
  const b = body as { fetchedAt?: unknown; headers?: unknown; usage?: unknown } | null
  if (!b || typeof b !== 'object' || !b.headers || typeof b.headers !== 'object') {
    throw new ParseError('missing headers')
  }
  const raw: Record<string, string> = {}
  for (const [k, v] of Object.entries(b.headers as Record<string, unknown>)) raw[k.toLowerCase()] = String(v)

  const windows: UsageWindow[] = []
  for (const name of Object.keys(raw)) {
    const m = WINDOW_RE.exec(name)
    if (!m) continue
    const key = m[1]!
    const utilization = num(raw[name])
    if (utilization === null) continue
    windows.push({
      key,
      utilization,
      resetsAt: epochSecondsToIso(raw[`${PREFIX}${key}-reset`]),
      status: raw[`${PREFIX}${key}-status`] ?? null,
    })
  }
  windows.sort((a, b) => a.key.localeCompare(b.key))

  const usageObj = b.usage as { input_tokens?: unknown; output_tokens?: unknown } | null | undefined
  const usage =
    usageObj && typeof usageObj === 'object'
      ? { inputTokens: Number(usageObj.input_tokens ?? 0), outputTokens: Number(usageObj.output_tokens ?? 0) }
      : null

  return {
    fetchedAt: typeof b.fetchedAt === 'string' ? b.fetchedAt : new Date().toISOString(),
    windows,
    overall: {
      status: raw[`${PREFIX}status`] ?? null,
      representativeClaim: raw[`${PREFIX}representative-claim`] ?? null,
      resetsAt: epochSecondsToIso(raw[`${PREFIX}reset`]),
      fallbackPercentage: num(raw[`${PREFIX}fallback-percentage`]),
    },
    overage: {
      status: raw[`${PREFIX}overage-status`] ?? null,
      disabledReason: raw[`${PREFIX}overage-disabled-reason`] ?? null,
    },
    raw,
    usage,
  }
}
