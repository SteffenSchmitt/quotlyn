import { describe, expect, it } from 'vitest'
import { SubscriptionWatcher } from '../../src/notify/subscriptionAlerts'
import type { SubscriptionCycle } from '../../src/lib/subscription'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-08T09:00:00Z')

function cycle(state: SubscriptionCycle['state'], endMs: number): SubscriptionCycle {
  return { state, startMs: endMs - 30 * DAY, endMs, day: 1, days: 30, progress: 0.5 }
}

function memory(initial: string[] = []) {
  let keys = [...initial]
  return { load: () => keys, save: (k: string[]) => (keys = [...k]), get keys() { return keys } }
}

describe('SubscriptionWatcher', () => {
  it('alerts once when a renewal comes within the lead time', () => {
    const w = new SubscriptionWatcher(memory())
    expect(w.evaluate('a', cycle('active', NOW + 2 * DAY), NOW, 3)).toEqual({ kind: 'renews', atMs: NOW + 2 * DAY, days: 2 })
    expect(w.evaluate('a', cycle('active', NOW + 2 * DAY), NOW + DAY, 3)).toBeNull()
  })

  it('alerts for the end of a cancelled subscription', () => {
    const w = new SubscriptionWatcher(memory())
    expect(w.evaluate('a', cycle('ending', NOW + DAY / 2), NOW, 3)).toEqual({ kind: 'ends', atMs: NOW + DAY / 2, days: 1 })
  })

  it('stays quiet when too far away, switched off, expired or without a subscription', () => {
    const w = new SubscriptionWatcher(memory())
    expect(w.evaluate('a', cycle('active', NOW + 5 * DAY), NOW, 3)).toBeNull()
    expect(w.evaluate('a', cycle('active', NOW + DAY), NOW, 0)).toBeNull()
    expect(w.evaluate('a', cycle('expired', NOW - DAY), NOW, 3)).toBeNull()
    expect(w.evaluate('a', { state: 'none', startMs: 0, endMs: 0, day: 0, days: 0, progress: 0 }, NOW, 3)).toBeNull()
  })

  it('remembers what it reported across instances, and alerts again for the next renewal', () => {
    const store = memory()
    new SubscriptionWatcher(store).evaluate('a', cycle('active', NOW + DAY), NOW, 3)
    const again = new SubscriptionWatcher(store)
    expect(again.evaluate('a', cycle('active', NOW + DAY), NOW, 3)).toBeNull()
    expect(again.evaluate('a', cycle('active', NOW + 31 * DAY), NOW + 29 * DAY, 3)).not.toBeNull()
  })

  it('drops remembered dates that have passed', () => {
    const store = memory([`a\u0000${NOW - DAY}`])
    new SubscriptionWatcher(store).evaluate('b', cycle('active', NOW + DAY), NOW, 3)
    expect(store.keys).toEqual([`b\u0000${NOW + DAY}`])
  })

  it('forgets an account', () => {
    const store = memory()
    const w = new SubscriptionWatcher(store)
    w.evaluate('a', cycle('active', NOW + DAY), NOW, 3)
    w.forget('a')
    expect(w.evaluate('a', cycle('active', NOW + DAY), NOW, 3)).not.toBeNull()
  })
})
