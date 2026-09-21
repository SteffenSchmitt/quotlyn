import type { UsageSnapshot } from '../storage/historyDb'

export interface ForecastOptions {
  /** Minutes of history the fit looks at; 0 means the whole current cycle. */
  lookbackMinutes: number
  /** Fewer points than this and there is no forecast. */
  minPoints: number
}

export const DEFAULT_FORECAST: ForecastOptions = { lookbackMinutes: 60, minPoints: 3 }
export const LOOKBACK_CHOICES = [15, 30, 60, 120, 240, 0] as const

export interface Forecast {
  windowKey: string
  /** Utilization of the last snapshot, 0..1. */
  current: number
  /** Fitted rise in utilization per hour, > 0. */
  ratePerHour: number
  /** When the window reaches 100 % at the current rate. */
  exhaustsAt: string
  /** True when exhaustion comes before the reset. */
  beforeReset: boolean
  /** Expected utilization at the reset, capped at 1. */
  atReset: number
  resetsAt: string
  /** Start of the current cycle: resetsAt minus the window length, or the first snapshot for unknown windows. */
  cycleStart: string
  /** Snapshots the fit used. */
  points: number
}

/** Where the exhaustion sits on the cycle clock: 0 at the last reset, 1 at the next (or when the window lasts). */
export function cyclePosition(f: Forecast): number {
  if (!f.beforeReset) return 1
  const start = Date.parse(f.cycleStart)
  const span = Date.parse(f.resetsAt) - start
  if (!(span > 0)) return 1
  return Math.max(0, Math.min(1, (Date.parse(f.exhaustsAt) - start) / span))
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Reset times drift by a few seconds between polls; five minutes still keeps cycles apart. */
const RESET_TOLERANCE = 5 * 60_000
/** Cycle length per known window key; the cycle starts at resetsAt minus this, at 0 %. */
const WINDOW_LENGTH_MS: Record<string, number> = { '5h': 5 * HOUR, '7d': 7 * DAY, '7d_oi': 7 * DAY }
/** Windows longer than this always use the whole cycle: a busy hour says nothing about a week. */
const LONG_WINDOW_MS = DAY

/**
 * Linear least-squares forecast of one window from the snapshots of the current cycle.
 * Snapshots are expected in ascending fetchedAt order. Returns null when there is no
 * reset time, too few points, or the utilization is not rising.
 */
export function forecastWindow(
  snapshots: UsageSnapshot[],
  windowKey: string,
  opts: ForecastOptions,
  nowMs: number,
): Forecast | null {
  const samples: Array<{ t: number; u: number; resetsAt: string }> = []
  for (const s of snapshots) {
    if (!s.ok || !s.parsed) continue
    const w = s.parsed.windows.find((x) => x.key === windowKey)
    if (!w || !w.resetsAt) continue
    const t = Date.parse(s.fetchedAt)
    if (!Number.isFinite(t)) continue
    samples.push({ t, u: w.utilization, resetsAt: w.resetsAt })
  }
  const last = samples[samples.length - 1]
  if (!last) return null
  const resetMs = Date.parse(last.resetsAt)
  if (!Number.isFinite(resetMs)) return null

  const cycle = samples.filter((p) => Math.abs(Date.parse(p.resetsAt) - resetMs) <= RESET_TOLERANCE)
  const length = WINDOW_LENGTH_MS[windowKey]
  const wholeCycle = opts.lookbackMinutes === 0 || (length !== undefined && length > LONG_WINDOW_MS)
  const since = wholeCycle ? -Infinity : nowMs - opts.lookbackMinutes * 60_000
  const points = cycle.filter((p) => p.t >= since)
  if (points.length < opts.minPoints) return null
  const cycleStart = new Date(length !== undefined ? resetMs - length : cycle[0]!.t).toISOString()
  // The cycle began at 0 %; that origin anchors a whole-cycle fit even with few snapshots.
  const fitPoints =
    wholeCycle && length !== undefined && resetMs - length < points[0]!.t
      ? [{ t: resetMs - length, u: 0 }, ...points]
      : points

  if (last.u >= 1) {
    return {
      windowKey,
      current: last.u,
      ratePerHour: 0,
      exhaustsAt: new Date(nowMs).toISOString(),
      beforeReset: true,
      atReset: 1,
      resetsAt: last.resetsAt,
      cycleStart,
      points: points.length,
    }
  }

  const slope = slopePerMs(fitPoints)
  if (!(slope > 0)) return null
  const ratePerHour = slope * HOUR
  const exhaustMs = last.t + (1 - last.u) / slope
  const atReset = Math.min(1, last.u + slope * Math.max(0, resetMs - last.t))
  return {
    windowKey,
    current: last.u,
    ratePerHour,
    exhaustsAt: new Date(Math.round(exhaustMs)).toISOString(),
    beforeReset: exhaustMs <= resetMs,
    atReset,
    resetsAt: last.resetsAt,
    cycleStart,
    points: points.length,
  }
}

/** Least-squares slope of u over t, in utilization per millisecond. */
function slopePerMs(points: Array<{ t: number; u: number }>): number {
  const n = points.length
  const t0 = points[0]!.t
  let st = 0
  let su = 0
  for (const p of points) {
    st += p.t - t0
    su += p.u
  }
  const mt = st / n
  const mu = su / n
  let num = 0
  let den = 0
  for (const p of points) {
    const dt = p.t - t0 - mt
    num += dt * (p.u - mu)
    den += dt * dt
  }
  return den === 0 ? 0 : num / den
}
