import { describe, expect, it } from 'vitest'
import type { ParsedUsage } from '../../src/api/usageParser'
import { timelineBars } from '../../src/lib/timelineBars'

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
      { row: 0, accountName: 'Alpha', windowKey: '5h', startMs: now, endMs: Date.parse('2026-09-21T14:00:00.000Z'), utilization: 0.5, exhaustsAtMs: null },
      { row: 1, accountName: 'Beta', windowKey: '7d', startMs: now, endMs: Date.parse('2026-09-23T12:00:00.000Z'), utilization: 0.9, exhaustsAtMs: null },
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
    expect(bars[1]!.exhaustsAtMs).toBeNull()
  })
  it('clamps past resets to now', () => {
    const { bars } = timelineBars([{ id: 'a', name: 'A' }], { a: parsed([['5h', 1, '2026-09-21T11:00:00.000Z']]) }, now, (n) => n)
    expect(bars[0]!.endMs).toBe(now)
  })
})
