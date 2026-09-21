import { describe, expect, it } from 'vitest'
import type { ParsedUsage } from '../../src/api/usageParser'
import type { Forecast } from '../../src/lib/forecast'
import { recommend } from '../../src/lib/recommend'

const NOW = Date.parse('2026-09-21T12:00:00Z')
const H = 3_600_000
function parsed(u5: number, u7: number, uo: number): ParsedUsage {
  return {
    fetchedAt: 'x',
    windows: [
      { key: '5h', utilization: u5, resetsAt: new Date(NOW + 2 * H).toISOString(), status: null },
      { key: '7d', utilization: u7, resetsAt: new Date(NOW + 5 * 24 * H).toISOString(), status: null },
      { key: '7d_oi', utilization: uo, resetsAt: new Date(NOW + 4 * 24 * H).toISOString(), status: null },
    ],
    overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
    overage: { status: null, disabledReason: null },
    raw: {},
    usage: null,
    probe: { model: null, fallbackUsed: false, primaryStatus: null },
  }
}
function fc(exhaustsInH: number, key = '5h'): Forecast {
  return {
    windowKey: key, current: 0.5, ratePerHour: 0.2, exhaustsAt: new Date(NOW + exhaustsInH * H).toISOString(),
    beforeReset: exhaustsInH < 2, atReset: 1, resetsAt: new Date(NOW + 2 * H).toISOString(), cycleStart: new Date(NOW - 3 * H).toISOString(), points: 4,
  }
}
const accounts = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
]

describe('recommend', () => {
  it('picks the account with the most session headroom for now and the widest weekly window for the week', () => {
    const r = recommend(accounts, { a: parsed(0.7, 0.2, 0.3), b: parsed(0.2, 0.6, 0.9), c: parsed(0.4, 0.1, 0.2) }, {}, {})
    expect(r.now?.accountId).toBe('b')
    expect(r.now?.windowKey).toBe('5h')
    expect(r.week?.accountId).toBe('c')
    expect(r.week?.windowKey).toBe('7d_oi')
  })

  it('lets an earlier forecast exhaustion break a tie and skips limited or rejected accounts', () => {
    const r = recommend(
      accounts,
      { a: parsed(0.3, 0.5, 0.5), b: parsed(0.3, 0.5, 0.5), c: parsed(0.0, 0.0, 0.0) },
      { a: { '5h': fc(0.5) }, b: { '5h': fc(1.5) } },
      { c: 'limited' },
    )
    expect(r.now?.accountId).toBe('b')
    expect(r.week?.accountId).not.toBe('c')
  })

  it('returns nothing without usable data', () => {
    expect(recommend(accounts, {}, {}, {})).toEqual({ now: null, week: null })
    expect(recommend(accounts, { a: parsed(1, 1, 1) }, {}, { a: 'limited' })).toEqual({ now: null, week: null })
  })
})
