import { describe, expect, it } from 'vitest'
import { ForecastWatcher } from '../../src/notify/forecastAlerts'
import type { Forecast } from '../../src/lib/forecast'

const NOW = Date.parse('2026-09-21T12:00:00Z')
const HOUR = 3_600_000
function f(over: Partial<Forecast> = {}): Forecast {
  return {
    windowKey: '5h', current: 0.7, ratePerHour: 0.4, exhaustsAt: new Date(NOW + 45 * 60_000).toISOString(), beforeReset: true,
    atReset: 1, resetsAt: new Date(NOW + 3 * HOUR).toISOString(), cycleStart: new Date(NOW - 2 * HOUR).toISOString(), points: 5, ...over,
  }
}

describe('ForecastWatcher', () => {
  it('alerts once per window and cycle when exhaustion is within the horizon', () => {
    const w = new ForecastWatcher()
    expect(w.evaluate('a', [f()], NOW, HOUR)).toHaveLength(1)
    expect(w.evaluate('a', [f({ exhaustsAt: new Date(NOW + 30 * 60_000).toISOString() })], NOW, HOUR)).toHaveLength(0)
  })

  it('alerts again in the next cycle', () => {
    const w = new ForecastWatcher()
    w.evaluate('a', [f()], NOW, HOUR)
    const next = f({ resetsAt: new Date(NOW + 8 * HOUR).toISOString(), exhaustsAt: new Date(NOW + 5.5 * HOUR).toISOString() })
    expect(w.evaluate('a', [next], NOW + 5 * HOUR, HOUR)).toHaveLength(1)
  })

  it('stays quiet when the window lasts, is beyond the horizon, already exhausted, or has no forecast', () => {
    const w = new ForecastWatcher()
    expect(w.evaluate('a', [f({ beforeReset: false })], NOW, HOUR)).toHaveLength(0)
    expect(w.evaluate('a', [f({ exhaustsAt: new Date(NOW + 2 * HOUR).toISOString() })], NOW, HOUR)).toHaveLength(0)
    expect(w.evaluate('a', [f({ current: 1 })], NOW, HOUR)).toHaveLength(0)
    expect(w.evaluate('a', [null], NOW, HOUR)).toHaveLength(0)
  })

  it('keeps accounts and windows apart and forgets an account', () => {
    const w = new ForecastWatcher()
    expect(w.evaluate('a', [f(), f({ windowKey: '7d' })], NOW, HOUR)).toHaveLength(2)
    expect(w.evaluate('b', [f()], NOW, HOUR)).toHaveLength(1)
    w.forget('a')
    expect(w.evaluate('a', [f()], NOW, HOUR)).toHaveLength(1)
  })
})
