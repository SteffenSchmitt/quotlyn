import { describe, expect, it } from 'vitest'
import type { ParsedUsage } from '../../src/api/usageParser'
import { barLabel, sortBars, timelineBars } from '../../src/lib/timelineBars'

function parsed(windows: Array<[string, number, string | null]>): ParsedUsage {
  return {
    fetchedAt: 'x',
    windows: windows.map(([key, utilization, resetsAt]) => ({ key, utilization, resetsAt, status: null })),
    overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
    overage: { status: null, disabledReason: null },
    raw: {},
    usage: null,
    probe: { model: null, fallbackUsed: false, primaryStatus: null },
  }
}

describe('timelineBars', () => {
  const now = Date.parse('2026-09-21T12:00:00.000Z')
  it('creates one row per window with a reset, in account then window order', () => {
    const { rows, bars } = timelineBars(
      [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      {
        a: parsed([
          ['5h', 0.5, '2026-09-21T14:00:00.000Z'],
          ['7d', 0.2, null],
        ]),
        b: parsed([['7d', 0.9, '2026-09-23T12:00:00.000Z']]),
      },
      now,
      (n, k) => `${n}/${k}`,
    )
    expect(rows.map((r) => r.label)).toEqual(['Alpha/5h', 'Beta/7d'])
    expect(bars).toEqual([
      { row: 0, accountName: 'Alpha', windowKey: '5h', startMs: now, endMs: Date.parse('2026-09-21T14:00:00.000Z'), utilization: 0.5, exhaustsAtMs: null, lasts: false },
      { row: 1, accountName: 'Beta', windowKey: '7d', startMs: now, endMs: Date.parse('2026-09-23T12:00:00.000Z'), utilization: 0.9, exhaustsAtMs: null, lasts: false },
    ])
  })

  it('marks the forecast exhaustion inside the bar, and drops it when it comes after the reset', () => {
    const { bars } = timelineBars(
      [{ id: 'a', name: 'Alpha' }],
      {
        a: parsed([
          ['5h', 0.5, '2026-09-21T14:00:00.000Z'],
          ['7d', 0.2, '2026-09-23T12:00:00.000Z'],
        ]),
      },
      now,
      (n, k) => `${n}/${k}`,
      (_id, key) => (key === '5h' ? { exhaustsAt: '2026-09-21T13:00:00.000Z', beforeReset: true } : { exhaustsAt: '2026-09-30T00:00:00.000Z', beforeReset: false }),
    )
    expect(bars[0]!.exhaustsAtMs).toBe(Date.parse('2026-09-21T13:00:00.000Z'))
    expect(bars[0]!.lasts).toBe(false)
    expect(bars[1]!.exhaustsAtMs).toBeNull()
    expect(bars[1]!.lasts).toBe(true)
  })
  it('clamps past resets to now', () => {
    const { bars } = timelineBars([{ id: 'a', name: 'A' }], { a: parsed([['5h', 1, '2026-09-21T11:00:00.000Z']]) }, now, (n) => n)
    expect(bars[0]!.endMs).toBe(now)
  })
})

describe('barLabel', () => {
  const t = (key: string, params: Record<string, unknown> = {}) => `${key}{${Object.values(params).join(',')}}`
  it('shows percent and countdown, and says exhausted at 100 %', () => {
    expect(barLabel(0.44, '6d 22h', t)).toBe('44 % · dashboard.resetsIn{6d 22h}')
    expect(barLabel(1, '3d 19h', t)).toBe('timeline.exhausted{} · dashboard.resetsIn{3d 19h}')
  })
})

describe('sortBars', () => {
  const rows = [
    { label: 'A/5h', accountId: 'a', windowKey: '5h' },
    { label: 'A/7d', accountId: 'a', windowKey: '7d' },
    { label: 'B/5h', accountId: 'b', windowKey: '5h' },
    { label: 'B/7d', accountId: 'b', windowKey: '7d' },
  ]
  const bars = [
    { row: 0, accountName: 'A', windowKey: '5h', startMs: 0, endMs: 10, utilization: 0.2, exhaustsAtMs: null, lasts: true },
    { row: 1, accountName: 'A', windowKey: '7d', startMs: 0, endMs: 100, utilization: 0.9, exhaustsAtMs: 30, lasts: false },
    { row: 2, accountName: 'B', windowKey: '5h', startMs: 0, endMs: 10, utilization: 0.95, exhaustsAtMs: 5, lasts: false },
    { row: 3, accountName: 'B', windowKey: '7d', startMs: 0, endMs: 100, utilization: 0.1, exhaustsAtMs: null, lasts: false },
  ]
  it('keeps account order by default', () => {
    expect(sortBars(rows, bars, 'accounts').rows.map((r) => r.label)).toEqual(['A/5h', 'A/7d', 'B/5h', 'B/7d'])
  })
  it('puts the soonest exhaustion first, then the highest utilization', () => {
    const { rows: r, bars: b } = sortBars(rows, bars, 'exhaustion')
    expect(r.map((x) => x.label)).toEqual(['B/5h', 'A/7d', 'A/5h', 'B/7d'])
    expect(b.map((x) => x.row)).toEqual([0, 1, 2, 3])
    expect(b[0]!.accountName).toBe('B')
  })
  it('groups by window, accounts in order within a group', () => {
    expect(sortBars(rows, bars, 'window').rows.map((r) => r.label)).toEqual(['A/5h', 'B/5h', 'A/7d', 'B/7d'])
  })
})
