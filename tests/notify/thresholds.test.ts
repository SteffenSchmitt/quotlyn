import { describe, expect, it } from 'vitest'
import { ThresholdWatcher } from '../../src/notify/thresholds'
import type { UsageWindow } from '../../src/api/usageParser'

const T = { warn: 0.8, crit: 0.95 }
function w(key: string, utilization: number, resetsAt: string | null = null): UsageWindow {
  return { key, utilization, resetsAt, status: null }
}

describe('ThresholdWatcher', () => {
  it('emits warn on first crossing and nothing on repeat', () => {
    const tw = new ThresholdWatcher()
    expect(tw.evaluate('a', [w('5h', 0.85)], T)).toEqual([
      { accountId: 'a', windowKey: '5h', level: 'warn', utilization: 0.85, resetsAt: null },
    ])
    expect(tw.evaluate('a', [w('5h', 0.86)], T)).toEqual([])
  })

  it('emits crit when rising further and warn again after a drop', () => {
    const tw = new ThresholdWatcher()
    tw.evaluate('a', [w('5h', 0.85)], T)
    expect(tw.evaluate('a', [w('5h', 0.96)], T)).toEqual([
      { accountId: 'a', windowKey: '5h', level: 'crit', utilization: 0.96, resetsAt: null },
    ])
    expect(tw.evaluate('a', [w('5h', 0.5)], T)).toEqual([])
    expect(tw.evaluate('a', [w('5h', 0.85)], T)).toEqual([
      { accountId: 'a', windowKey: '5h', level: 'warn', utilization: 0.85, resetsAt: null },
    ])
  })

  it('carries the reset time of the crossed window', () => {
    const tw = new ThresholdWatcher()
    expect(tw.evaluate('a', [w('5h', 0.85, '2026-09-21T18:00:00Z')], T)[0]!.resetsAt).toBe('2026-09-21T18:00:00Z')
  })

  it('emits nothing below warn', () => {
    const tw = new ThresholdWatcher()
    expect(tw.evaluate('a', [w('5h', 0.1), w('7d', 0.79)], T)).toEqual([])
  })

  it('tracks windows and accounts independently', () => {
    const tw = new ThresholdWatcher()
    expect(tw.evaluate('a', [w('5h', 0.85), w('7d', 0.96)], T)).toHaveLength(2)
    expect(tw.evaluate('b', [w('5h', 0.85)], T)).toHaveLength(1)
    expect(tw.evaluate('a', [w('5h', 0.85), w('7d', 0.96)], T)).toEqual([])
  })

  it('jumps straight to crit', () => {
    const tw = new ThresholdWatcher()
    expect(tw.evaluate('a', [w('5h', 0.99)], T)[0]!.level).toBe('crit')
  })

  it('forget resets an account', () => {
    const tw = new ThresholdWatcher()
    tw.evaluate('a', [w('5h', 0.85)], T)
    tw.forget('a')
    expect(tw.evaluate('a', [w('5h', 0.85)], T)).toHaveLength(1)
  })
})
