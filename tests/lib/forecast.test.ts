import { describe, expect, it } from 'vitest'
import { cyclePosition, forecastWindow, type ForecastOptions } from '../../src/lib/forecast'
import type { UsageSnapshot } from '../../src/storage/historyDb'

const T0 = Date.parse('2026-09-21T10:00:00Z')
const MIN = 60_000
const H = 60 * MIN
const RESET = new Date(T0 + 5 * H).toISOString()
const OPTS: ForecastOptions = { lookbackMinutes: 60, minPoints: 3 }

function snap(minutes: number, utilization: number, resetsAt: string | null = RESET, key = '5h'): UsageSnapshot {
  const fetchedAt = new Date(T0 + minutes * MIN).toISOString()
  return {
    accountId: 'a',
    fetchedAt,
    ok: true,
    error: null,
    parsed: {
      fetchedAt,
      windows: [{ key, utilization, resetsAt, status: null }],
      overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
      overage: { status: null, disabledReason: null },
      raw: {},
      usage: null,
      probe: { model: null, fallbackUsed: false, primaryStatus: null },
    },
  }
}

describe('forecastWindow', () => {
  it('needs at least minPoints in the current cycle', () => {
    expect(forecastWindow([snap(0, 0.1), snap(10, 0.2)], '5h', OPTS, T0 + 10 * MIN)).toBeNull()
  })

  it('extrapolates a linear rise from the last point and flags exhaustion before the reset', () => {
    const f = forecastWindow([snap(0, 0.1), snap(10, 0.2), snap(20, 0.3)], '5h', OPTS, T0 + 20 * MIN)!
    expect(f.ratePerHour).toBeCloseTo(0.6, 5)
    expect(f.current).toBe(0.3)
    expect(f.exhaustsAt).toBe(new Date(T0 + 90 * MIN).toISOString())
    expect(f.beforeReset).toBe(true)
    expect(f.atReset).toBe(1)
    expect(f.points).toBe(3)
  })

  it('reports the utilization at reset when the window will last', () => {
    const f = forecastWindow([snap(0, 0.24), snap(30, 0.27), snap(60, 0.3)], '5h', OPTS, T0 + 60 * MIN)!
    expect(f.ratePerHour).toBeCloseTo(0.06, 5)
    expect(f.beforeReset).toBe(false)
    expect(f.atReset).toBeCloseTo(0.3 + 0.06 * 4, 5)
    expect(Date.parse(f.exhaustsAt!)).toBeGreaterThan(Date.parse(RESET))
  })

  it('ignores snapshots from the previous cycle', () => {
    const old = new Date(T0).toISOString()
    const snaps = [snap(-40, 0.9, old), snap(-30, 0.95, old), snap(0, 0.1), snap(10, 0.2), snap(20, 0.3)]
    const f = forecastWindow(snaps, '5h', OPTS, T0 + 20 * MIN)!
    expect(f.points).toBe(3)
    expect(f.ratePerHour).toBeCloseTo(0.6, 5)
  })

  it('tolerates a reset time that drifts by a few minutes within one cycle', () => {
    const drifted = new Date(T0 + 5 * H + 3 * MIN).toISOString()
    const f = forecastWindow([snap(0, 0.1), snap(10, 0.2, drifted), snap(20, 0.3)], '5h', OPTS, T0 + 20 * MIN)!
    expect(f.points).toBe(3)
  })

  it('limits the fit to the lookback, and 0 means the whole cycle', () => {
    const snaps = [snap(0, 0.0), snap(60, 0.1), snap(120, 0.2), snap(130, 0.3), snap(140, 0.4), snap(150, 0.5)]
    const recent = forecastWindow(snaps, '5h', { lookbackMinutes: 30, minPoints: 3 }, T0 + 150 * MIN)!
    expect(recent.points).toBe(4)
    expect(recent.ratePerHour).toBeCloseTo(0.6, 5)
    const whole = forecastWindow(snaps, '5h', { lookbackMinutes: 0, minPoints: 3 }, T0 + 150 * MIN)!
    expect(whole.points).toBe(6)
    expect(whole.ratePerHour).toBeLessThan(0.3)
  })

  it('fits week windows over the whole cycle from its start, whatever the lookback', () => {
    // Cycle started two days ago at 0 %; a steep last hour must not be extrapolated over five days.
    const reset = new Date(T0 + 5 * 24 * H).toISOString()
    const snaps = [snap(-48 * 60, 0.1, reset, '7d'), snap(-24 * 60, 0.2, reset, '7d'), snap(-30, 0.28, reset, '7d'), snap(0, 0.32, reset, '7d')]
    const f = forecastWindow(snaps, '7d', { lookbackMinutes: 60, minPoints: 2 }, T0)!
    expect(f.points).toBe(4)
    expect(f.beforeReset).toBe(false)
    expect(f.atReset).toBeGreaterThan(0.6)
    expect(f.atReset).toBeLessThan(1)
  })

  it('returns null when the utilization is flat or falling', () => {
    expect(forecastWindow([snap(0, 0.3), snap(10, 0.3), snap(20, 0.3)], '5h', OPTS, T0 + 20 * MIN)).toBeNull()
    expect(forecastWindow([snap(0, 0.5), snap(10, 0.4), snap(20, 0.3)], '5h', OPTS, T0 + 20 * MIN)).toBeNull()
  })

  it('treats a window at 100 % as exhausted now', () => {
    const f = forecastWindow([snap(0, 0.9), snap(10, 1), snap(20, 1)], '5h', OPTS, T0 + 20 * MIN)!
    expect(f.exhaustsAt).toBe(new Date(T0 + 20 * MIN).toISOString())
    expect(f.beforeReset).toBe(true)
  })

  it('returns null without a reset time or for an unknown window', () => {
    expect(forecastWindow([snap(0, 0.1, null), snap(10, 0.2, null), snap(20, 0.3, null)], '5h', OPTS, T0 + 20 * MIN)).toBeNull()
    expect(forecastWindow([snap(0, 0.1), snap(10, 0.2), snap(20, 0.3)], '7d', OPTS, T0 + 20 * MIN)).toBeNull()
  })
})

describe('cyclePosition', () => {
  it('places the exhaustion on the cycle clock, from the last reset (0) to the next (1)', () => {
    // 7-day window: cycle started at T0, resets at T0 + 7 d, exhaustion at day 4.
    const reset = new Date(T0 + 7 * 24 * H).toISOString()
    const snaps = [snap(0, 0.05, reset, '7d'), snap(24 * 60, 0.25, reset, '7d'), snap(48 * 60, 0.5, reset, '7d')]
    const f = forecastWindow(snaps, '7d', { lookbackMinutes: 60, minPoints: 2 }, T0 + 48 * 60 * MIN)!
    expect(f.cycleStart).toBe(new Date(T0).toISOString())
    const expected = (Date.parse(f.exhaustsAt) - T0) / (7 * 24 * H)
    expect(expected).toBeGreaterThan(4 / 7)
    expect(expected).toBeLessThan(5 / 7)
    expect(cyclePosition(f)).toBeCloseTo(expected, 6)
  })
  it('is 1 when the window lasts until the reset', () => {
    const f = forecastWindow([snap(0, 0.24), snap(30, 0.27), snap(60, 0.3)], '5h', OPTS, T0 + 60 * MIN)!
    expect(f.beforeReset).toBe(false)
    expect(cyclePosition(f)).toBe(1)
  })
  it('falls back to the first snapshot as cycle start for unknown windows', () => {
    const snaps = [snap(0, 0.1, RESET, 'x'), snap(10, 0.2, RESET, 'x'), snap(20, 0.3, RESET, 'x')]
    const f = forecastWindow(snaps, 'x', OPTS, T0 + 20 * MIN)!
    expect(f.cycleStart).toBe(new Date(T0).toISOString())
  })
})
