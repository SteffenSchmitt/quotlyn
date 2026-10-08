import type { UsageSnapshot } from '../storage/historyDb'

export interface CycleUsage {
  /** Mean of the weekly peaks, 0..1, or null without readings. */
  average: number | null
  /** Weeks with at least one reading; the running week counts with its value so far. */
  weeks: number
  /** First reading inside the month, to tell how much of it the history covers. */
  firstMs: number | null
}

/** Reset times this close together belong to the same week; the API's value drifts by seconds. */
const SAME_RESET_MS = 5 * 60_000

/**
 * How much of a weekly limit an account used during one billing month [fromMs, toMs): every week is
 * worth its highest reading (utilization only grows until the reset), and the weeks are averaged.
 */
export function cycleUsage(snapshots: UsageSnapshot[], windowKey: string, fromMs: number, toMs: number): CycleUsage {
  const weeks: Array<{ resetMs: number; peak: number }> = []
  let firstMs: number | null = null
  for (const s of snapshots) {
    const atMs = Date.parse(s.fetchedAt)
    if (!s.ok || atMs < fromMs || atMs >= toMs) continue
    const w = s.parsed?.windows.find((x) => x.key === windowKey)
    const resetMs = w?.resetsAt ? Date.parse(w.resetsAt) : NaN
    if (!w || !Number.isFinite(resetMs)) continue
    firstMs = firstMs === null ? atMs : Math.min(firstMs, atMs)
    const week = weeks.find((x) => Math.abs(x.resetMs - resetMs) <= SAME_RESET_MS)
    if (week) week.peak = Math.max(week.peak, w.utilization)
    else weeks.push({ resetMs, peak: w.utilization })
  }
  const average = weeks.length ? weeks.reduce((sum, w) => sum + w.peak, 0) / weeks.length : null
  return { average, weeks: weeks.length, firstMs }
}

/** Price of one percentage point of the weekly limit, or null when it cannot be told. */
export function costPerPercent(monthlyPrice: number | null, average: number | null): number | null {
  if (monthlyPrice === null || average === null || average <= 0) return null
  return monthlyPrice / (average * 100)
}
