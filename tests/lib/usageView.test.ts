import { describe, expect, it } from 'vitest'
import type { ParsedUsage } from '../../src/api/usageParser'
import {
  criticalWindow,
  formatCountdown,
  headroom,
  isIdentifying,
  isKnownHeader,
  levelFor,
  maskValue,
  primaryWindowFor,
  sortByHeadroom,
} from '../../src/lib/usageView'

function parsed(...utils: number[]): ParsedUsage {
  return {
    fetchedAt: 'x',
    windows: utils.map((u, i) => ({ key: `w${i}`, utilization: u, resetsAt: null, status: null })),
    overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
    overage: { status: null, disabledReason: null },
    raw: {},
    usage: null,
    probe: { model: null, fallbackUsed: false, primaryStatus: null },
  }
}

describe('levelFor', () => {
  it('maps utilization to levels with default thresholds', () => {
    expect(levelFor(0.1)).toBe('ok')
    expect(levelFor(0.79)).toBe('ok')
    expect(levelFor(0.8)).toBe('warn')
    expect(levelFor(0.949)).toBe('warn')
    expect(levelFor(0.95)).toBe('crit')
    expect(levelFor(1.2)).toBe('crit')
  })
  it('honours custom thresholds', () => {
    expect(levelFor(0.5, { warn: 0.4, crit: 0.6 })).toBe('warn')
  })
})

describe('formatCountdown', () => {
  const now = Date.parse('2026-09-21T12:00:00.000Z')
  it('handles null and past', () => {
    expect(formatCountdown(null, now)).toBe('–')
    expect(formatCountdown('2026-09-21T11:00:00.000Z', now)).toBe('0:00')
  })
  it('formats minutes, hours and days', () => {
    expect(formatCountdown('2026-09-21T12:04:05.000Z', now)).toBe('4:05')
    expect(formatCountdown('2026-09-21T14:30:00.000Z', now)).toBe('2h 30m')
    expect(formatCountdown('2026-09-24T15:00:00.000Z', now)).toBe('3d 3h')
  })
})

describe('headroom and criticalWindow', () => {
  it('uses the most used window', () => {
    expect(headroom(parsed(0.2, 0.6))).toBeCloseTo(0.4)
    expect(criticalWindow(parsed(0.2, 0.6))!.key).toBe('w1')
  })
  it('handles empty and undefined', () => {
    expect(headroom(parsed())).toBe(1)
    expect(criticalWindow(parsed())).toBeNull()
    expect(headroom(undefined)).toBe(-1)
  })
})

describe('sortByHeadroom', () => {
  it('puts the account with most room first and unknown last, stable', () => {
    const items = [
      { id: 'a', p: parsed(0.9) },
      { id: 'b', p: undefined },
      { id: 'c', p: parsed(0.1) },
      { id: 'd', p: parsed(0.1) },
    ]
    expect(sortByHeadroom(items, (i) => i.p).map((i) => i.id)).toEqual(['c', 'd', 'a', 'b'])
  })
})

describe('header classification and masking', () => {
  it('flags identifying headers', () => {
    expect(isIdentifying('anthropic-organization-id')).toBe(true)
    expect(isIdentifying('anthropic-workspace-id')).toBe(true)
    expect(isIdentifying('request-id')).toBe(true)
    expect(isIdentifying('anthropic-ratelimit-unified-5h-utilization')).toBe(false)
  })
  it('knows the documented headers and flags new ones', () => {
    expect(isKnownHeader('anthropic-ratelimit-unified-5h-utilization')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-7d-opus-reset')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-overage-disabled-reason')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-representative-claim')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-fallback-percentage')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-status')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-reset')).toBe(true)
    expect(isKnownHeader('anthropic-organization-id')).toBe(true)
    expect(isKnownHeader('anthropic-ratelimit-unified-mystery')).toBe(false)
    expect(isKnownHeader('anthropic-new-thing')).toBe(false)
  })
  it('masks values keeping a short prefix', () => {
    expect(maskValue('a1b2c3d4-e5f6-7890')).toBe('a1b2…')
    expect(maskValue('abc')).toBe('…')
  })
})

describe('primaryWindowFor', () => {
  const p: ParsedUsage = { ...parsed(0.2, 0.6), windows: [
    { key: '5h', utilization: 0.2, resetsAt: null, status: null },
    { key: '7d', utilization: 0.6, resetsAt: null, status: null },
  ] }
  it('defaults to the critical window', () => {
    expect(primaryWindowFor(p)!.key).toBe('7d')
    expect(primaryWindowFor(p, 'critical')!.key).toBe('7d')
  })
  it('returns the chosen window when present', () => {
    expect(primaryWindowFor(p, '5h')!.key).toBe('5h')
  })
  it('falls back to critical when the chosen window is missing', () => {
    expect(primaryWindowFor(p, '7d_oi')!.key).toBe('7d')
    expect(primaryWindowFor(undefined, '5h')).toBeNull()
  })
})
