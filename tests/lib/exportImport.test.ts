import { describe, expect, it } from 'vitest'
import type { UsageSnapshot } from '../../src/storage/historyDb'
import { snapshotsToCsv, snapshotsToJson } from '../../src/lib/exportImport'

const okSnap: UsageSnapshot = {
  id: 1,
  accountId: 'a',
  fetchedAt: '2026-09-21T10:00:00.000Z',
  ok: true,
  parsed: {
    fetchedAt: '2026-09-21T10:00:00.000Z',
    windows: [
      { key: '5h', utilization: 0.28, resetsAt: '2026-09-21T15:00:00.000Z', status: 'allowed' },
      { key: '7d', utilization: 0.51, resetsAt: null, status: null },
    ],
    overall: { status: 'allowed', representativeClaim: 'five_hour', resetsAt: null, fallbackPercentage: 0.5 },
    overage: { status: 'rejected', disabledReason: null },
    raw: { 'anthropic-organization-id': 'org-secret', 'anthropic-ratelimit-unified-status': 'allowed' },
    usage: { inputTokens: 8, outputTokens: 1 },
  },
  error: null,
}
const errSnap: UsageSnapshot = {
  id: 2,
  accountId: 'a',
  fetchedAt: '2026-09-21T10:05:00.000Z',
  ok: false,
  parsed: null,
  error: { status: 429, message: 'rate_limited' },
}
const names = { a: 'Alpha, "Prod"' }

describe('snapshotsToCsv', () => {
  it('writes a header and one row per window, quoting as needed', () => {
    const csv = snapshotsToCsv([okSnap, errSnap], names)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('account,fetchedAt,window,utilization,resetsAt,status,ok,error')
    expect(lines[1]).toBe('"Alpha, ""Prod""",2026-09-21T10:00:00.000Z,5h,0.28,2026-09-21T15:00:00.000Z,allowed,true,')
    expect(lines[2]).toBe('"Alpha, ""Prod""",2026-09-21T10:00:00.000Z,7d,0.51,,,true,')
    expect(lines[3]).toBe('"Alpha, ""Prod""",2026-09-21T10:05:00.000Z,,,,,false,429 rate_limited')
    expect(lines).toHaveLength(4)
  })
})

describe('snapshotsToJson', () => {
  it('strips identifying headers by default and keeps them on request', () => {
    const plain = JSON.parse(snapshotsToJson([okSnap], names, false))
    expect(plain[0].account).toBe('Alpha, "Prod"')
    expect(plain[0].parsed.raw).toEqual({ 'anthropic-ratelimit-unified-status': 'allowed' })
    expect(plain[0].id).toBeUndefined()
    const full = JSON.parse(snapshotsToJson([okSnap], names, true))
    expect(full[0].parsed.raw['anthropic-organization-id']).toBe('org-secret')
  })
})
