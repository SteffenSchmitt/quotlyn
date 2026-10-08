import { describe, expect, it } from 'vitest'
import { subscriptionBadge, subscriptionCycle, subscriptionEvents } from '../../src/lib/subscription'

/** Local calendar days, so the tests hold in any time zone. */
const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime()

describe('subscriptionCycle', () => {
  it('is none without a date or with a malformed one', () => {
    expect(subscriptionCycle({ subscriptionDate: '', subscriptionCancelled: false }, day(2026, 10, 8)).state).toBe('none')
    expect(subscriptionCycle({ subscriptionDate: '14.10.2026', subscriptionCancelled: false }, day(2026, 10, 8)).state).toBe('none')
  })

  it('rolls a renewal forward month by month from the same day', () => {
    const c = subscriptionCycle({ subscriptionDate: '2026-07-14', subscriptionCancelled: false }, day(2026, 10, 8, 12))
    expect(c).toMatchObject({ state: 'active', startMs: day(2026, 9, 14), endMs: day(2026, 10, 14), day: 25, days: 30 })
    expect(c.progress).toBeCloseTo((day(2026, 10, 8, 12) - day(2026, 9, 14)) / (day(2026, 10, 14) - day(2026, 9, 14)))
  })

  it('also works from a renewal date in the future', () => {
    const c = subscriptionCycle({ subscriptionDate: '2027-01-14', subscriptionCancelled: false }, day(2026, 10, 8))
    expect(c).toMatchObject({ state: 'active', startMs: day(2026, 9, 14), endMs: day(2026, 10, 14) })
  })

  it('starts the new cycle on the renewal day itself', () => {
    const c = subscriptionCycle({ subscriptionDate: '2026-09-14', subscriptionCancelled: false }, day(2026, 10, 14))
    expect(c).toMatchObject({ startMs: day(2026, 10, 14), endMs: day(2026, 11, 14), day: 1 })
  })

  it('clamps the 31st to the end of shorter months and returns to the 31st afterwards', () => {
    const anchor = { subscriptionDate: '2028-01-31', subscriptionCancelled: false }
    expect(subscriptionCycle(anchor, day(2028, 2, 10))).toMatchObject({ startMs: day(2028, 1, 31), endMs: day(2028, 2, 29), days: 29 })
    expect(subscriptionCycle(anchor, day(2028, 3, 10))).toMatchObject({ startMs: day(2028, 2, 29), endMs: day(2028, 3, 31) })
    expect(subscriptionCycle(anchor, day(2027, 2, 10))).toMatchObject({ endMs: day(2027, 2, 28) })
  })

  it('treats the date of a cancelled subscription as its end', () => {
    const c = subscriptionCycle({ subscriptionDate: '2026-10-17', subscriptionCancelled: true }, day(2026, 10, 14))
    expect(c).toMatchObject({ state: 'ending', startMs: day(2026, 9, 17), endMs: day(2026, 10, 17) })
  })

  it('is expired once a cancelled subscription has ended', () => {
    const c = subscriptionCycle({ subscriptionDate: '2026-10-01', subscriptionCancelled: true }, day(2026, 10, 8))
    expect(c).toMatchObject({ state: 'expired', endMs: day(2026, 10, 1), progress: 1 })
  })
})

describe('subscriptionEvents', () => {
  it('lists the renewals inside a range', () => {
    const events = subscriptionEvents({ subscriptionDate: '2026-10-14', subscriptionCancelled: false }, day(2026, 8, 20), day(2026, 10, 20))
    expect(events).toEqual([
      { atMs: day(2026, 9, 14), kind: 'renewal' },
      { atMs: day(2026, 10, 14), kind: 'renewal' },
    ])
  })

  it('ends with the end of a cancelled subscription and nothing after it', () => {
    const events = subscriptionEvents({ subscriptionDate: '2026-10-17', subscriptionCancelled: true }, day(2026, 9, 1), day(2026, 12, 31))
    expect(events).toEqual([
      { atMs: day(2026, 9, 17), kind: 'renewal' },
      { atMs: day(2026, 10, 17), kind: 'end' },
    ])
  })

  it('is empty without a date', () => {
    expect(subscriptionEvents({ subscriptionDate: '', subscriptionCancelled: false }, 0, day(2030, 1, 1))).toEqual([])
  })
})

describe('subscriptionBadge', () => {
  const now = day(2026, 10, 8, 9)
  it('announces a renewal within the next week', () => {
    expect(subscriptionBadge(subscriptionCycle({ subscriptionDate: '2026-10-11', subscriptionCancelled: false }, now), now)).toEqual({ kind: 'renews', days: 3 })
    expect(subscriptionBadge(subscriptionCycle({ subscriptionDate: '2026-10-20', subscriptionCancelled: false }, now), now)).toBeNull()
  })

  it('always shows a cancelled subscription, and when it has expired', () => {
    expect(subscriptionBadge(subscriptionCycle({ subscriptionDate: '2026-11-01', subscriptionCancelled: true }, now), now)).toEqual({ kind: 'ends', days: 24 })
    expect(subscriptionBadge(subscriptionCycle({ subscriptionDate: '2026-10-01', subscriptionCancelled: true }, now), now)).toEqual({ kind: 'expired', days: 0 })
  })

  it('counts the rest of a day as one day', () => {
    expect(subscriptionBadge(subscriptionCycle({ subscriptionDate: '2026-10-09', subscriptionCancelled: true }, now), now)).toEqual({ kind: 'ends', days: 1 })
  })

  it('stays away without a subscription', () => {
    expect(subscriptionBadge(subscriptionCycle({ subscriptionDate: '', subscriptionCancelled: false }, now), now)).toBeNull()
  })
})
