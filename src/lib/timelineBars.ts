import type { ParsedUsage } from '../api/usageParser'

export interface TimelineBar {
  row: number
  accountName: string
  windowKey: string
  startMs: number
  endMs: number
  utilization: number
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
): { rows: TimelineRow[]; bars: TimelineBar[] } {
  const rows: TimelineRow[] = []
  const bars: TimelineBar[] = []
  for (const a of accounts) {
    for (const w of latest[a.id]?.windows ?? []) {
      if (!w.resetsAt) continue
      const endMs = Date.parse(w.resetsAt)
      if (!Number.isFinite(endMs)) continue
      rows.push({ label: label(a.name, w.key), accountId: a.id, windowKey: w.key })
      bars.push({
        row: rows.length - 1,
        accountName: a.name,
        windowKey: w.key,
        startMs: nowMs,
        endMs: Math.max(endMs, nowMs),
        utilization: w.utilization,
      })
    }
  }
  return { rows, bars }
}
