import type { ParsedUsage } from '../api/usageParser'
import type { Forecast } from './forecast'

export interface Pick {
  accountId: string
  windowKey: string
  utilization: number
  forecast: Forecast | null
}

export interface Recommendation {
  /** Best account for the next session: most headroom in the 5-hour window. */
  now: Pick | null
  /** Best account for the rest of the week: most headroom in its tighter weekly window. */
  week: Pick | null
}

const SESSION = '5h'
const WEEKLY = ['7d', '7d_oi']

/** Accounts at their limit or with a rejected token are out of the running. */
const OUT = new Set(['limited', 'disabled'])

function better(a: Pick, b: Pick | null): boolean {
  if (!b) return true
  if (a.utilization !== b.utilization) return a.utilization < b.utilization
  // Same headroom: the one whose forecast runs out later, or that has no exhaustion in sight.
  const ea = a.forecast?.beforeReset ? Date.parse(a.forecast.exhaustsAt) : Infinity
  const eb = b.forecast?.beforeReset ? Date.parse(b.forecast.exhaustsAt) : Infinity
  return ea > eb
}

/** Which account to use next, for the session and for the week. */
export function recommend(
  accounts: Array<{ id: string }>,
  latest: Record<string, ParsedUsage | undefined>,
  forecasts: Record<string, Record<string, Forecast | null> | undefined>,
  pollStatus: Record<string, string | undefined>,
): Recommendation {
  let now: Pick | null = null
  let week: Pick | null = null
  for (const a of accounts) {
    const parsed = latest[a.id]
    if (!parsed || OUT.has(pollStatus[a.id] ?? '') || parsed.overall.status === 'rejected') continue
    const session = parsed.windows.find((w) => w.key === SESSION)
    if (session && session.utilization < 1) {
      const pick = { accountId: a.id, windowKey: SESSION, utilization: session.utilization, forecast: forecasts[a.id]?.[SESSION] ?? null }
      if (better(pick, now)) now = pick
    }
    const tightest = parsed.windows
      .filter((w) => WEEKLY.includes(w.key))
      .reduce<typeof session | undefined>((m, w) => (!m || w.utilization > m.utilization ? w : m), undefined)
    if (tightest && tightest.utilization < 1) {
      const pick = { accountId: a.id, windowKey: tightest.key, utilization: tightest.utilization, forecast: forecasts[a.id]?.[tightest.key] ?? null }
      if (better(pick, week)) week = pick
    }
  }
  return { now, week }
}
