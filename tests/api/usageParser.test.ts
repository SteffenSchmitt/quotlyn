import { describe, expect, it } from 'vitest'
import { ParseError, epochSecondsToIso, parseUsage } from '../../src/api/usageParser'

const body = {
  fetchedAt: '2026-09-21T11:34:45.000Z',
  upstreamStatus: 200,
  headers: {
    'anthropic-ratelimit-unified-status': 'allowed',
    'anthropic-ratelimit-unified-representative-claim': 'five_hour',
    'anthropic-ratelimit-unified-reset': '1789999800',
    'anthropic-ratelimit-unified-fallback-percentage': '0.5',
    'anthropic-ratelimit-unified-5h-status': 'allowed',
    'anthropic-ratelimit-unified-5h-utilization': '0.28',
    'anthropic-ratelimit-unified-5h-reset': '1789999800',
    'anthropic-ratelimit-unified-7d-status': 'allowed',
    'anthropic-ratelimit-unified-7d-utilization': '0.51',
    'anthropic-ratelimit-unified-7d-reset': '1790002800',
    'anthropic-ratelimit-unified-overage-status': 'rejected',
    'anthropic-ratelimit-unified-overage-disabled-reason': 'org_level_disabled',
    'anthropic-organization-id': 'org-x',
    'request-id': 'req_x',
  },
  usage: { input_tokens: 8, output_tokens: 1 },
  probe: { model: 'claude-fable-5-1', fallbackUsed: false, primaryStatus: 200 },
}

describe('epochSecondsToIso', () => {
  it('converts unix seconds', () => {
    expect(epochSecondsToIso('1789999800')).toBe(new Date(1789999800 * 1000).toISOString())
  })
  it('returns null for garbage', () => {
    expect(epochSecondsToIso(undefined)).toBeNull()
    expect(epochSecondsToIso('abc')).toBeNull()
  })
})

describe('parseUsage', () => {
  it('extracts windows generically from *-utilization headers', () => {
    const parsed = parseUsage(body)
    expect(parsed.windows).toEqual([
      { key: '5h', utilization: 0.28, resetsAt: new Date(1789999800000).toISOString(), status: 'allowed' },
      { key: '7d', utilization: 0.51, resetsAt: new Date(1790002800000).toISOString(), status: 'allowed' },
    ])
  })

  it('extracts overall and overage', () => {
    const parsed = parseUsage(body)
    expect(parsed.overall).toEqual({
      status: 'allowed',
      representativeClaim: 'five_hour',
      resetsAt: new Date(1789999800000).toISOString(),
      fallbackPercentage: 0.5,
    })
    expect(parsed.overage).toEqual({ status: 'rejected', disabledReason: 'org_level_disabled' })
  })

  it('keeps raw headers, usage and fetchedAt', () => {
    const parsed = parseUsage(body)
    expect(parsed.raw['anthropic-organization-id']).toBe('org-x')
    expect(parsed.usage).toEqual({ inputTokens: 8, outputTokens: 1 })
    expect(parsed.fetchedAt).toBe('2026-09-21T11:34:45.000Z')
  })

  it('carries probe info and defaults it when missing', () => {
    expect(parseUsage(body).probe).toEqual({ model: 'claude-fable-5-1', fallbackUsed: false, primaryStatus: 200 })
    const { probe: _p, ...withoutProbe } = body
    expect(parseUsage(withoutProbe).probe).toEqual({ model: null, fallbackUsed: false, primaryStatus: null })
  })

  it('picks up unknown windows such as 7d-opus', () => {
    const parsed = parseUsage({
      ...body,
      headers: { ...body.headers, 'anthropic-ratelimit-unified-7d-opus-utilization': '0.9' },
    })
    expect(parsed.windows.map((w) => w.key)).toEqual(['5h', '7d', '7d-opus'])
    expect(parsed.windows[2]).toEqual({ key: '7d-opus', utilization: 0.9, resetsAt: null, status: null })
  })

  it('tolerates missing optional headers', () => {
    const parsed = parseUsage({ fetchedAt: 'x', upstreamStatus: 200, headers: {} })
    expect(parsed.windows).toEqual([])
    expect(parsed.overall.status).toBeNull()
    expect(parsed.usage).toBeNull()
  })

  it('throws ParseError without a headers object', () => {
    expect(() => parseUsage({ nope: true })).toThrow(ParseError)
    expect(() => parseUsage(null)).toThrow(ParseError)
  })
})
