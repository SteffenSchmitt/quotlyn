import { describe, expect, it } from 'vitest'
import { forecastLine, forecastTone } from '../../src/lib/forecastText'
import type { Forecast } from '../../src/lib/forecast'

const NOW = Date.parse('2026-09-21T12:00:00Z')
function t(key: string, params: Record<string, unknown> = {}): string {
  const p = Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')
  return p ? `${key}{${p}}` : key
}
function f(over: Partial<Forecast>): Forecast {
  return {
    windowKey: '5h', current: 0.4, ratePerHour: 0.2, exhaustsAt: '2026-09-21T15:00:00Z', beforeReset: true,
    atReset: 1, resetsAt: '2026-09-21T16:00:00Z', cycleStart: '2026-09-21T11:00:00Z', points: 4, ...over,
  }
}

describe('forecastLine', () => {
  it('says when the window will be full if that is before the reset', () => {
    expect(forecastLine(f({}), NOW, t)).toBe('dashboard.forecast.exhausts{t=3h 0m,rate=20}')
  })
  it('says how full the window will be at the reset otherwise', () => {
    expect(forecastLine(f({ beforeReset: false, atReset: 0.71, exhaustsAt: '2026-09-21T18:00:00Z' }), NOW, t)).toBe(
      'dashboard.forecast.lasts{p=71,rate=20}',
    )
  })
})

describe('forecastLine at 100 %', () => {
  it('says exhausted instead of a zero countdown', () => {
    expect(forecastLine(f({ current: 1, ratePerHour: 0, exhaustsAt: '2026-09-21T12:00:00Z' }), NOW, t)).toBe('dashboard.forecast.exhausted')
  })
})

describe('forecastTone', () => {
  it('is crit within an hour of exhaustion, warn before the reset, ok otherwise', () => {
    expect(forecastTone(f({ exhaustsAt: '2026-09-21T12:30:00Z' }), NOW)).toBe('crit')
    expect(forecastTone(f({}), NOW)).toBe('warn')
    expect(forecastTone(f({ beforeReset: false }), NOW)).toBe('ok')
  })
})
