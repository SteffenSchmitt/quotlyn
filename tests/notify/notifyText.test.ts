import { describe, expect, it } from 'vitest'
import { crossingNotification } from '../../src/notify/notifyText'
import type { Crossing } from '../../src/notify/thresholds'

const T = { warn: 0.8, crit: 0.95 }
const NOW = Date.parse('2026-09-21T17:00:00Z')

/** Minimal translator: renders "key{param=value,...}" so the assertions see keys and values. */
function t(key: string, params: Record<string, unknown> = {}): string {
  const p = Object.entries(params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',')
  return p ? `${key}{${p}}` : key
}
const windowLabel = (key: string) => (key === '5h' ? 'Sitzung · 5 h' : key)

function crossing(over: Partial<Crossing> = {}): Crossing {
  return { accountId: 'a', windowKey: '5h', level: 'warn', utilization: 0.823, resetsAt: '2026-09-21T18:12:00Z', ...over }
}

describe('crossingNotification', () => {
  it('titles with account name and level', () => {
    const n = crossingNotification(crossing(), 'Work', T, NOW, t, windowLabel)
    expect(n.title).toBe('notify.title{account=Work,level=notify.level.warn}')
  })

  it('bodies with window label, rounded percent, crossed threshold and countdown', () => {
    const n = crossingNotification(crossing(), 'Work', T, NOW, t, windowLabel)
    expect(n.body).toBe('notify.body{window=Sitzung · 5 h,percent=82,threshold=80,countdown=1h 12m}')
  })

  it('names the critical threshold for crit crossings', () => {
    const n = crossingNotification(crossing({ level: 'crit', utilization: 0.96 }), 'Work', T, NOW, t, windowLabel)
    expect(n.title).toContain('notify.level.crit')
    expect(n.body).toContain('threshold=95')
  })

  it('omits the countdown when the reset time is unknown', () => {
    const n = crossingNotification(crossing({ resetsAt: null }), 'Work', T, NOW, t, windowLabel)
    expect(n.body).toBe('notify.bodyNoReset{window=Sitzung · 5 h,percent=82,threshold=80}')
  })
})
