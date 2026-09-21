import { describe, expect, it } from 'vitest'
import { ResetWatcher } from '../../src/notify/resetAlerts'
import type { UsageWindow } from '../../src/api/usageParser'

const R1 = '2026-09-21T15:00:00Z'
const R2 = '2026-09-21T20:00:00Z'
function w(key: string, utilization: number, resetsAt: string | null = R1): UsageWindow {
  return { key, utilization, resetsAt, status: null }
}

describe('ResetWatcher', () => {
  it('fires when a window that was exhausted starts a new cycle', () => {
    const rw = new ResetWatcher()
    expect(rw.evaluate('a', [w('5h', 1.0)], false)).toEqual([])
    expect(rw.evaluate('a', [w('5h', 0.02, R2)], false)).toEqual([{ accountId: 'a', windowKey: '5h', utilization: 0.02 }])
    expect(rw.evaluate('a', [w('5h', 0.05, R2)], false)).toEqual([])
  })

  it('treats a limited account as exhausted even below 100 %', () => {
    const rw = new ResetWatcher()
    rw.evaluate('a', [w('5h', 0.97)], true)
    expect(rw.evaluate('a', [w('5h', 0.01, R2)], false)).toHaveLength(1)
  })

  it('stays quiet when a window resets that was not exhausted', () => {
    const rw = new ResetWatcher()
    rw.evaluate('a', [w('5h', 0.6)], false)
    expect(rw.evaluate('a', [w('5h', 0.0, R2)], false)).toEqual([])
  })

  it('does not mistake a drifting reset time for a new cycle', () => {
    const rw = new ResetWatcher()
    rw.evaluate('a', [w('5h', 1.0)], false)
    expect(rw.evaluate('a', [w('5h', 1.0, '2026-09-21T15:02:00Z')], false)).toEqual([])
  })

  it('keeps accounts and windows apart and forgets an account', () => {
    const rw = new ResetWatcher()
    rw.evaluate('a', [w('5h', 1.0), w('7d', 1.0, R2)], false)
    rw.evaluate('b', [w('5h', 1.0)], false)
    expect(rw.evaluate('a', [w('5h', 0.0, R2), w('7d', 1.0, R2)], false)).toHaveLength(1)
    rw.forget('b')
    expect(rw.evaluate('b', [w('5h', 0.0, R2)], false)).toEqual([])
  })
})
