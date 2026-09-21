import { describe, expect, it } from 'vitest'
import type { UsageSnapshot } from '../../src/storage/historyDb'
import { rangeSince, resetMarkersFor, resetZones, seriesFor, windowKeysIn } from '../../src/lib/historySeries'

function ok(fetchedAt: string, windows: Array<[string, number, string | null]>): UsageSnapshot {
  return {
    accountId: 'a',
    fetchedAt,
    ok: true,
    parsed: {
      fetchedAt,
      windows: windows.map(([key, utilization, resetsAt]) => ({ key, utilization, resetsAt, status: null })),
      overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
      overage: { status: null, disabledReason: null },
      raw: {},
      usage: null,
    probe: { model: null, fallbackUsed: false, primaryStatus: null },
    },
    error: null,
  }
}
function fail(fetchedAt: string): UsageSnapshot {
  return { accountId: 'a', fetchedAt, ok: false, parsed: null, error: { status: 429, message: 'rate_limited' } }
}

const R1 = '2026-09-21T15:00:00.000Z'
const R2 = '2026-09-21T20:00:00.000Z'
const snaps = [
  ok('2026-09-21T10:00:00.000Z', [
    ['5h', 0.2, R1],
    ['7d', 0.5, R2],
  ]),
  fail('2026-09-21T10:05:00.000Z'),
  ok('2026-09-21T10:10:00.000Z', [['5h', 0.25, R1]]),
  ok('2026-09-21T10:15:00.000Z', [
    ['5h', 0.3, R2],
    ['7d', 0.51, R2],
  ]),
]

describe('rangeSince', () => {
  const now = Date.parse('2026-09-21T12:00:00.000Z')
  it('subtracts the range', () => {
    expect(rangeSince('24h', now)).toBe('2026-09-20T12:00:00.000Z')
    expect(rangeSince('7d', now)).toBe('2026-09-14T12:00:00.000Z')
    expect(rangeSince('30d', now)).toBe('2026-08-22T12:00:00.000Z')
  })
})

describe('seriesFor', () => {
  it('maps utilization to percent and errors to null gaps', () => {
    expect(seriesFor(snaps, '5h')).toEqual([
      ['2026-09-21T10:00:00.000Z', 20],
      ['2026-09-21T10:05:00.000Z', null],
      ['2026-09-21T10:10:00.000Z', 25],
      ['2026-09-21T10:15:00.000Z', 30],
    ])
  })
  it('emits null when the window is missing in an ok snapshot', () => {
    expect(seriesFor(snaps, '7d')[2]).toEqual(['2026-09-21T10:10:00.000Z', null])
  })
})

describe('resetMarkersFor', () => {
  it('returns distinct sorted reset times for the window', () => {
    expect(resetMarkersFor(snaps, '5h')).toEqual([R1, R2])
    expect(resetMarkersFor(snaps, '7d')).toEqual([R2])
    expect(resetMarkersFor(snaps, 'nope')).toEqual([])
  })
})

describe('windowKeysIn', () => {
  it('collects distinct keys', () => {
    expect(windowKeysIn(snaps)).toEqual(['5h', '7d'])
    expect(windowKeysIn([fail('x')])).toEqual([])
  })
})

describe('resetZones', () => {
  it('alternates bands between range start, markers and range end', () => {
    const zones = resetZones(['2026-09-21T12:00:00.000Z', '2026-09-21T17:00:00.000Z'], '2026-09-21T10:00:00.000Z', '2026-09-21T20:00:00.000Z')
    expect(zones).toEqual([
      ['2026-09-21T10:00:00.000Z', '2026-09-21T12:00:00.000Z'],
      ['2026-09-21T17:00:00.000Z', '2026-09-21T20:00:00.000Z'],
    ])
  })
  it('ignores markers outside the range and yields one band without markers', () => {
    expect(resetZones(['2026-09-22T00:00:00.000Z'], '2026-09-21T10:00:00.000Z', '2026-09-21T20:00:00.000Z')).toEqual([
      ['2026-09-21T10:00:00.000Z', '2026-09-21T20:00:00.000Z'],
    ])
  })
})

describe('seriesFor with a gap limit', () => {
  it('breaks the line where snapshots are further apart than the limit', () => {
    const sparse = [
      ok('2026-09-21T10:00:00.000Z', [['5h', 0.2, R1]]),
      ok('2026-09-21T10:05:00.000Z', [['5h', 0.25, R1]]),
      // the app was off for two hours
      ok('2026-09-21T12:05:00.000Z', [['5h', 0.3, R1]]),
    ]
    expect(seriesFor(sparse, '5h', 15 * 60_000)).toEqual([
      ['2026-09-21T10:00:00.000Z', 20],
      ['2026-09-21T10:05:00.000Z', 25],
      ['2026-09-21T11:05:00.000Z', null],
      ['2026-09-21T12:05:00.000Z', 30],
    ])
  })
  it('keeps the series untouched without a limit', () => {
    expect(seriesFor(snaps, '7d')).toHaveLength(4)
  })
})
