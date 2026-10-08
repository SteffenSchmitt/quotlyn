import { describe, expect, it } from 'vitest'
import type { UsageSnapshot } from '../../src/storage/historyDb'
import { costPerPercent, cycleUsage } from '../../src/lib/cycleUsage'

const DAY = 86_400_000
const T0 = Date.parse('2026-09-14T00:00:00Z')

function snap(atMs: number, utilization: number, resetsAtMs: number, ok = true): UsageSnapshot {
  return {
    accountId: 'a',
    fetchedAt: new Date(atMs).toISOString(),
    ok,
    parsed: ok
      ? {
          fetchedAt: new Date(atMs).toISOString(),
          windows: [{ key: '7d', utilization, resetsAt: new Date(resetsAtMs).toISOString(), status: null }],
          overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
          overage: { status: null, disabledReason: null },
          raw: {},
          usage: null,
          probe: { model: null, fallbackUsed: false, primaryStatus: null },
        }
      : null,
    error: null,
  }
}

describe('cycleUsage', () => {
  it('averages the peak of every week inside the billing month', () => {
    const week1 = T0 + 3 * DAY
    const week2 = week1 + 7 * DAY
    const snaps = [
      snap(T0 + DAY, 0.2, week1),
      snap(T0 + 2 * DAY, 0.6, week1),
      snap(week1 + DAY, 0.1, week2),
      snap(week1 + 2 * DAY, 0.2, week2),
    ]
    const u = cycleUsage(snaps, '7d', T0, T0 + 30 * DAY)
    expect(u.weeks).toBe(2)
    expect(u.average).toBeCloseTo(0.4)
    expect(u.firstMs).toBe(T0 + DAY)
  })

  it('keeps a week together when its reset time drifts by seconds', () => {
    const reset = T0 + 3 * DAY
    const u = cycleUsage([snap(T0 + DAY, 0.3, reset), snap(T0 + 2 * DAY, 0.5, reset + 40_000)], '7d', T0, T0 + 30 * DAY)
    expect(u).toMatchObject({ weeks: 1, average: 0.5 })
  })

  it('ignores readings outside the month, failed ones and other windows', () => {
    const reset = T0 + 3 * DAY
    const u = cycleUsage(
      [snap(T0 - DAY, 0.9, reset), snap(T0 + DAY, 0.1, reset, false), snap(T0 + 31 * DAY, 0.9, reset + 35 * DAY)],
      '7d',
      T0,
      T0 + 30 * DAY,
    )
    expect(u).toEqual({ average: null, weeks: 0, firstMs: null })
    expect(cycleUsage([snap(T0 + DAY, 0.5, reset)], '5h', T0, T0 + 30 * DAY).weeks).toBe(0)
  })
})

describe('costPerPercent', () => {
  it('divides the price by the percentage points used', () => {
    expect(costPerPercent(100, 0.4)).toBeCloseTo(2.5)
  })

  it('is null without a price or without usage', () => {
    expect(costPerPercent(null, 0.4)).toBeNull()
    expect(costPerPercent(100, null)).toBeNull()
    expect(costPerPercent(100, 0)).toBeNull()
  })
})
