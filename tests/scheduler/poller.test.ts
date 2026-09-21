import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Poller, type PollTarget } from '../../src/scheduler/poller'
import type { UsageResult } from '../../src/api/usageClient'

const ok: UsageResult = { ok: true, status: 200, body: {} }
const targets: PollTarget[] = [
  { id: 'a', token: 'ta' },
  { id: 'b', token: 'tb' },
]

let calls: Array<{ id: string; t: number }>
let results: Array<{ id: string; result: UsageResult }>
let responder: (t: PollTarget) => UsageResult

function make(intervalMs = 10_000) {
  return new Poller({
    intervalMs,
    staggerMs: 2000,
    targets: () => targets,
    fetch: async (t) => {
      calls.push({ id: t.id, t: Date.now() })
      return responder(t)
    },
    onResult: (t, r) => results.push({ id: t.id, result: r }),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  calls = []
  results = []
  responder = () => ok
})
afterEach(() => vi.useRealTimers())

describe('Poller', () => {
  it('polls all targets sequentially with stagger on start', async () => {
    const p = make()
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual([{ id: 'a', t: 0 }])
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toEqual([
      { id: 'a', t: 0 },
      { id: 'b', t: 2000 },
    ])
    expect(results).toHaveLength(2)
    expect(p.getState('a').status).toBe('ok')
    expect(p.getState('a').lastFetchedAt).toBe(new Date(0).toISOString())
    p.stop()
  })

  it('repeats every interval and stops', async () => {
    const p = make(10_000)
    p.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toHaveLength(2)
    // the interval counts from the end of the previous cycle (t=2000)
    await vi.advanceTimersByTimeAsync(10_000 + 2000)
    expect(calls).toHaveLength(4)
    p.stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toHaveLength(4)
  })

  it('disables an account on 401 and skips it afterwards', async () => {
    responder = (t) => (t.id === 'a' ? { ok: false, status: 401, error: 'unauthorized' } : ok)
    const p = make(10_000)
    p.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(p.getState('a').status).toBe('disabled')
    expect(p.getState('a').lastError).toBe('unauthorized')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls.filter((c) => c.id === 'a')).toHaveLength(1)
    expect(calls.filter((c) => c.id === 'b')).toHaveLength(2)
    p.resetAccount('a')
    expect(p.getState('a').status).toBe('idle')
    p.stop()
  })

  it('pauses an account on 429 for twice the interval or retry-after', async () => {
    responder = (t) =>
      t.id === 'a' ? { ok: false, status: 429, error: 'rate_limited', retryAfterSeconds: 5 } : ok
    const p = make(10_000)
    p.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(p.getState('a').status).toBe('paused')
    expect(p.getState('a').pausedUntil).toBe(new Date(20_000).toISOString())
    responder = () => ok
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls.filter((c) => c.id === 'a')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls.filter((c) => c.id === 'a')).toHaveLength(2)
    expect(p.getState('a').status).toBe('ok')
    p.stop()
  })

  it('records network errors as error state but keeps polling', async () => {
    responder = () => ({ ok: false, status: null, error: 'Failed to fetch' })
    const p = make(10_000)
    p.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(p.getState('a').status).toBe('error')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls.filter((c) => c.id === 'a')).toHaveLength(2)
    p.stop()
  })

  it('refreshAll ignores pause but not disabled, and does not overlap a running cycle', async () => {
    responder = (t) =>
      t.id === 'a'
        ? { ok: false, status: 429, error: 'rate_limited' }
        : { ok: false, status: 401, error: 'unauthorized' }
    const p = make(10_000)
    p.start()
    await vi.advanceTimersByTimeAsync(2000)
    responder = () => ok
    const first = p.refreshAll()
    const second = p.refreshAll()
    await vi.advanceTimersByTimeAsync(2000)
    await first
    await second
    expect(calls.filter((c) => c.id === 'a')).toHaveLength(2)
    expect(calls.filter((c) => c.id === 'b')).toHaveLength(1)
    p.stop()
  })

  it('setIntervalMs reschedules the next cycle', async () => {
    const p = make(10_000)
    p.start()
    await vi.advanceTimersByTimeAsync(2000)
    p.setIntervalMs(5000)
    await vi.advanceTimersByTimeAsync(5000 + 2000)
    expect(calls).toHaveLength(4)
    p.stop()
  })

  it('emits state changes', async () => {
    const seen: string[] = []
    const p = new Poller({
      intervalMs: 10_000,
      targets: () => [targets[0]!],
      fetch: async () => ok,
      onResult: () => {},
      onStateChange: (id, s) => seen.push(`${id}:${s.status}`),
    })
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual(['a:fetching', 'a:ok'])
    p.stop()
  })
})
