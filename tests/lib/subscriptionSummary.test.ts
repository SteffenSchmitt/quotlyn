import { describe, expect, it } from 'vitest'
import type { UsageSnapshot } from '../../src/storage/historyDb'
import { summarizeSubscriptions, type SummaryAccount } from '../../src/lib/subscriptionSummary'

const DAY = 86_400_000
const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime()
const NOW = day(2026, 10, 8, 12)

function acc(over: Partial<SummaryAccount>): SummaryAccount {
  return { id: 'a', name: 'A', subscriptionDate: '', subscriptionCancelled: false, plan: '', monthlyPrice: null, ...over }
}

function snap(atMs: number, utilization: number, resetsAtMs: number): UsageSnapshot {
  return {
    accountId: 'a',
    fetchedAt: new Date(atMs).toISOString(),
    ok: true,
    parsed: {
      fetchedAt: new Date(atMs).toISOString(),
      windows: [{ key: '7d', utilization, resetsAt: new Date(resetsAtMs).toISOString(), status: null }],
      overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
      overage: { status: null, disabledReason: null },
      raw: {},
      usage: null,
      probe: { model: null, fallbackUsed: false, primaryStatus: null },
    },
    error: null,
  }
}

describe('summarizeSubscriptions', () => {
  it('lists only accounts with something about their subscription', () => {
    const s = summarizeSubscriptions([acc({ id: 'a' }), acc({ id: 'b', name: 'B', plan: 'pro' })], {}, NOW)
    expect(s.rows.map((r) => r.id)).toEqual(['b'])
  })

  const mixed = [
    acc({ id: 'a', monthlyPrice: 216, subscriptionDate: '2026-10-14' }),
    acc({ id: 'b', monthlyPrice: 108, subscriptionDate: '2026-10-20', subscriptionCancelled: true }),
    acc({ id: 'c', monthlyPrice: 20, subscriptionDate: '2026-10-01', subscriptionCancelled: true }),
    acc({ id: 'd', monthlyPrice: 18 }),
  ]

  it('adds up what keeps running, and names what was cancelled on its own', () => {
    const s = summarizeSubscriptions(mixed, {}, NOW)
    expect(s.totalMonthly).toBe(216 + 18)
    expect(s.running).toBe(2)
    expect(s.cancelledMonthly).toBe(108)
    expect(s.rows.map((r) => r.included)).toEqual([true, false, false, true])
  })

  it('counts cancelled subscriptions that still run when asked to, never expired ones', () => {
    const s = summarizeSubscriptions(mixed, {}, NOW, { includeCancelled: true })
    expect(s.totalMonthly).toBe(216 + 108 + 18)
    expect(s.running).toBe(3)
    expect(s.cancelledMonthly).toBe(108)
    expect(s.rows.map((r) => r.included)).toEqual([true, true, false, true])
  })

  it('leaves cancelled subscriptions out of the average unless asked to', () => {
    const snaps = { a: [snap(NOW - DAY, 0.2, NOW + DAY)], b: [{ ...snap(NOW - DAY, 0.8, NOW + DAY), accountId: 'b' }] }
    const accounts = [acc({ id: 'a', monthlyPrice: 10 }), acc({ id: 'b', subscriptionDate: '2026-10-20', subscriptionCancelled: true })]
    expect(summarizeSubscriptions(accounts, snaps, NOW).average).toBeCloseTo(0.2)
    expect(summarizeSubscriptions(accounts, snaps, NOW, { includeCancelled: true }).average).toBeCloseTo(0.5)
  })

  it('still names the end of a cancelled subscription as the next date', () => {
    const s = summarizeSubscriptions(
      [acc({ id: 'a', subscriptionDate: '2026-10-30' }), acc({ id: 'b', name: 'B', subscriptionDate: '2026-10-11', subscriptionCancelled: true })],
      {},
      NOW,
    )
    expect(s.next).toMatchObject({ name: 'B', kind: 'end' })
  })

  it('names the next renewal or end', () => {
    const s = summarizeSubscriptions(
      [
        acc({ id: 'a', name: 'A', subscriptionDate: '2026-10-14' }),
        acc({ id: 'b', name: 'B', subscriptionDate: '2026-10-11', subscriptionCancelled: true }),
      ],
      {},
      NOW,
    )
    expect(s.next).toEqual({ name: 'B', atMs: day(2026, 10, 11), kind: 'end' })
  })

  it('evaluates the current and the previous billing month from the history', () => {
    const start = day(2026, 9, 14)
    const snaps = [
      snap(start - 10 * DAY, 0.8, start - 5 * DAY),
      snap(start + DAY, 0.2, start + 4 * DAY),
      snap(start + 5 * DAY, 0.4, start + 11 * DAY),
    ]
    const s = summarizeSubscriptions([acc({ subscriptionDate: '2026-10-14', monthlyPrice: 90 })], { a: snaps }, NOW)
    const row = s.rows[0]!
    expect(row.current.weeks).toBe(2)
    expect(row.current.average).toBeCloseTo(0.3)
    expect(row.previous.average).toBeCloseTo(0.8)
    expect(row.perPercent).toBeCloseTo(3)
    expect(s.average).toBeCloseTo(0.3)
  })

  it('falls back to the last thirty days without a date', () => {
    const s = summarizeSubscriptions([acc({ monthlyPrice: 20 })], { a: [snap(NOW - 3 * DAY, 0.5, NOW + DAY)] }, NOW)
    expect(s.rows[0]!.current).toMatchObject({ weeks: 1, average: 0.5 })
    expect(s.rows[0]!.previous.average).toBeNull()
  })

  it('has no total and no average without prices or readings', () => {
    const s = summarizeSubscriptions([acc({ plan: 'pro' })], {}, NOW)
    expect(s).toMatchObject({ totalMonthly: null, cancelledMonthly: null, average: null, next: null })
  })
})
