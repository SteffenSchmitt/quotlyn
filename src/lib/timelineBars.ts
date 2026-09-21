import type { ParsedUsage } from '../api/usageParser'

export interface TimelineBar {
  row: number
  accountName: string
  windowKey: string
  startMs: number
  endMs: number
  utilization: number
  /** Forecast exhaustion inside the bar, or null when there is none or it comes after the reset. */
  exhaustsAtMs: number | null
  /** True when a forecast exists and says the window lasts until the reset. */
  lasts: boolean
}

/** The part of a forecast the timeline needs. */
export interface TimelineForecast {
  exhaustsAt: string
  beforeReset: boolean
}

export interface TimelineRow {
  label: string
  accountId: string
  windowKey: string
}

/**
 * One row per (account, window) with a reset time, in account order then window order.
 * Bars run from now to the reset; the fill is the utilization.
 */
export function timelineBars(
  accounts: Array<{ id: string; name: string }>,
  latest: Record<string, ParsedUsage | undefined>,
  nowMs: number,
  label: (accountName: string, windowKey: string) => string,
  forecast: (accountId: string, windowKey: string) => TimelineForecast | null = () => null,
): { rows: TimelineRow[]; bars: TimelineBar[] } {
  const rows: TimelineRow[] = []
  const bars: TimelineBar[] = []
  for (const a of accounts) {
    for (const w of latest[a.id]?.windows ?? []) {
      if (!w.resetsAt) continue
      const endMs = Date.parse(w.resetsAt)
      if (!Number.isFinite(endMs)) continue
      rows.push({ label: label(a.name, w.key), accountId: a.id, windowKey: w.key })
      const f = forecast(a.id, w.key)
      const exhaustsAtMs = f?.beforeReset ? Date.parse(f.exhaustsAt) : NaN
      bars.push({
        row: rows.length - 1,
        accountName: a.name,
        windowKey: w.key,
        startMs: nowMs,
        endMs: Math.max(endMs, nowMs),
        utilization: w.utilization,
        exhaustsAtMs: Number.isFinite(exhaustsAtMs) ? Math.max(nowMs, exhaustsAtMs) : null,
        lasts: f !== null && !f.beforeReset,
      })
    }
  }
  return { rows, bars }
}

/** End-of-bar text: "44 % · resets in 6d 22h", or "Exhausted · resets in …" at 100 %. */
export function barLabel(
  utilization: number,
  countdown: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const head = utilization >= 1 ? t('timeline.exhausted') : `${Math.round(utilization * 100)} %`
  return `${head} · ${t('dashboard.resetsIn', { t: countdown })}`
}
