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
  accountStatus,
  worstUtilization,
  claimWindowKey,
  humanizeToken,
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

describe('accountStatus', () => {
  const T = { warn: 0.8, crit: 0.95 }
  it('is none without data', () => {
    expect(accountStatus(undefined, T)).toEqual({ level: 'none', window: null, limited: false })
  })
  it('takes the worst window, not the first', () => {
    const s = accountStatus(parsed(0.1, 0.85, 0.5), T)
    expect(s.level).toBe('warn')
    expect(s.window?.key).toBe('w1')
  })
  it('is ok when every window is below warn', () => {
    expect(accountStatus(parsed(0.1, 0.79), T).level).toBe('ok')
  })
  it('honours custom thresholds', () => {
    expect(accountStatus(parsed(0.5), { warn: 0.4, crit: 0.6 }).level).toBe('warn')
  })
  it('forces crit while the API reports the limit as reached', () => {
    const s = accountStatus(parsed(0.1), T, 'limited')
    expect(s.level).toBe('crit')
    expect(s.limited).toBe(true)
  })
})

describe('claimWindowKey', () => {
  it('maps representative claims to window keys', () => {
    expect(claimWindowKey('five_hour')).toBe('5h')
    expect(claimWindowKey('seven_day')).toBe('7d')
    expect(claimWindowKey('seven_day_oi')).toBe('7d_oi')
    expect(claimWindowKey('seven_day_opus')).toBe('7d_oi')
  })
  it('returns null for unknown or missing claims', () => {
    expect(claimWindowKey('seven_day_overage_included')).toBeNull()
    expect(claimWindowKey(null)).toBeNull()
  })
})

describe('humanizeToken', () => {
  it('turns snake_case header values into readable words', () => {
    expect(humanizeToken('seven_day_overage_included')).toBe('seven day overage included')
  })
})

describe('worstUtilization', () => {
  it('returns the highest utilization across all accounts and windows, or null without data', () => {
    expect(worstUtilization({ a: parsed(0.2, 0.83), b: parsed(0.5), c: undefined })).toBe(0.83)
    expect(worstUtilization({ a: undefined })).toBeNull()
    expect(worstUtilization({})).toBeNull()
  })
})
