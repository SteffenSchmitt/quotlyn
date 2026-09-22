import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createProxyServer } from '../../proxy/server.mjs'

type Seen = { auth?: string; beta?: string; version?: string; path?: string; method?: string; body?: string }

let upstream: http.Server
let proxy: http.Server
let proxyBase: string
let seen: Seen = {}
let upstreamStatus = 200
let upstreamBody = '{"usage":{"input_tokens":22,"output_tokens":1}}'
let upstreamHeaders: Record<string, string> = {}
let perModel: Record<string, { status: number; headers?: Record<string, string>; body?: string }> = {}
let seenModels: string[] = []
let upstreamBaseUrl = ''

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

const RATE_HEADERS = {
  'anthropic-ratelimit-unified-status': 'allowed',
  'anthropic-ratelimit-unified-5h-utilization': '0.28',
  'anthropic-ratelimit-unified-5h-reset': '1789999800',
  'anthropic-ratelimit-unified-7d-utilization': '0.51',
  'anthropic-ratelimit-unified-7d-reset': '1790002800',
  'anthropic-organization-id': 'org-test',
  'request-id': 'req_test',
  'cf-ray': 'should-not-pass',
}

/** A Fable probe turned away by its own weekly window while the shared windows still have room. */
const LIMITED_FABLE = {
  ...RATE_HEADERS,
  'anthropic-ratelimit-unified-status': 'rejected',
  'anthropic-ratelimit-unified-representative-claim': 'seven_day_overage_included',
  'anthropic-ratelimit-unified-5h-status': 'allowed',
  'anthropic-ratelimit-unified-7d-status': 'allowed',
  'anthropic-ratelimit-unified-7d_oi-status': 'rejected',
  'anthropic-ratelimit-unified-7d_oi-utilization': '1.0',
  'anthropic-ratelimit-unified-7d_oi-reset': '1790359200',
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen = {
        auth: req.headers.authorization,
        beta: req.headers['anthropic-beta'] as string | undefined,
        version: req.headers['anthropic-version'] as string | undefined,
        path: req.url,
        method: req.method,
        body,
      }
      let model = ''
      try {
        model = JSON.parse(body).model
      } catch {
        model = ''
      }
      seenModels.push(model)
      const special = perModel[model]
      if (special) {
        res.writeHead(special.status, { 'content-type': 'application/json', ...(special.headers ?? {}) })
        res.end(special.body ?? '{"type":"error","error":{"type":"rate_limit_error","message":"Error"}}')
        return
      }
      res.writeHead(upstreamStatus, { 'content-type': 'application/json', ...upstreamHeaders })
      res.end(upstreamBody)
    })
  })
  upstreamBaseUrl = await listen(upstream)
  proxy = createProxyServer({ upstream: upstreamBaseUrl, model: 'test-model', fallbackModel: 'fallback-model' })
  proxyBase = await listen(proxy)
})

afterAll(() => {
  proxy.close()
  upstream.close()
})

describe('GET /usage', () => {
  it('sends a minimal messages request with the bearer token', async () => {
    upstreamStatus = 200
    upstreamHeaders = RATE_HEADERS
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer sk-ant-oat-test' } })
    expect(res.status).toBe(200)
    expect(seen.method).toBe('POST')
    expect(seen.path).toBe('/v1/messages')
    expect(seen.auth).toBe('Bearer sk-ant-oat-test')
    expect(seen.beta).toBe('oauth-2025-04-20')
    expect(seen.version).toBe('2023-06-01')
    expect(JSON.parse(seen.body!)).toEqual({
      model: 'test-model',
      max_tokens: 1,
      system: [{ type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." }],
      messages: [{ role: 'user', content: 'hi' }],
    })
  })

  it('returns anthropic headers, usage, probe info and fetchedAt as JSON', async () => {
    upstreamStatus = 200
    upstreamHeaders = RATE_HEADERS
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    const json = await res.json()
    expect(json.upstreamStatus).toBe(200)
    expect(json.probe).toEqual({ model: 'test-model', fallbackUsed: false, primaryStatus: 200 })
    expect(typeof json.fetchedAt).toBe('string')
    expect(json.headers['anthropic-ratelimit-unified-5h-utilization']).toBe('0.28')
    expect(json.headers['anthropic-organization-id']).toBe('org-test')
    expect(json.headers['request-id']).toBe('req_test')
    expect(json.headers['cf-ray']).toBeUndefined()
    expect(json.usage).toEqual({ input_tokens: 22, output_tokens: 1 })
  })

  it('passes upstream errors through with headers and error body', async () => {
    upstreamStatus = 429
    upstreamBody = '{"type":"error","error":{"type":"rate_limit_error","message":"limit"}}'
    upstreamHeaders = { ...RATE_HEADERS, 'anthropic-ratelimit-unified-status': 'rejected', 'retry-after': '30' }
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    const json = await res.json()
    expect(json.upstreamStatus).toBe(429)
    expect(json.headers['anthropic-ratelimit-unified-status']).toBe('rejected')
    expect(json.error).toEqual({ type: 'rate_limit_error', message: 'limit' })
  })

  it('rejects requests without Authorization with 401 and does not call upstream', async () => {
    seen = { auth: 'untouched' }
    const res = await fetch(`${proxyBase}/usage`)
    expect(res.status).toBe(401)
    expect(seen.auth).toBe('untouched')
  })
})

describe('fallback probe', () => {
  it('retries with the fallback model when the primary is rate limited without headers', async () => {
    upstreamStatus = 200
    upstreamHeaders = RATE_HEADERS
    perModel = { 'test-model': { status: 429 } }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(seenModels).toEqual(['test-model', 'fallback-model'])
    expect(json.probe).toEqual({ model: 'fallback-model', fallbackUsed: true, primaryStatus: 429 })
    expect(json.headers['anthropic-ratelimit-unified-5h-utilization']).toBe('0.28')
    perModel = {}
  })

  it('does not retry when the 429 carries rate-limit headers', async () => {
    perModel = {
      'test-model': { status: 429, headers: { ...RATE_HEADERS, 'anthropic-ratelimit-unified-status': 'rejected' } },
    }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(429)
    expect(seenModels).toEqual(['test-model'])
    const json = await res.json()
    expect(json.probe).toEqual({ model: 'test-model', fallbackUsed: false, primaryStatus: 429 })
    perModel = {}
  })

  it('retries with the fallback model when only a model-specific window is rejected', async () => {
    upstreamStatus = 200
    upstreamHeaders = { ...RATE_HEADERS, 'anthropic-ratelimit-unified-5h-utilization': '0.42' }
    perModel = { 'test-model': { status: 429, headers: LIMITED_FABLE } }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(seenModels).toEqual(['test-model', 'fallback-model'])
    expect(json.probe).toEqual({ model: 'fallback-model', fallbackUsed: true, primaryStatus: 429 })
    // Fresh numbers from the request that actually ran ...
    expect(json.headers['anthropic-ratelimit-unified-5h-utilization']).toBe('0.42')
    expect(json.headers['anthropic-ratelimit-unified-7d-utilization']).toBe('0.51')
    // ... plus the exhausted window the fallback model is not subject to.
    expect(json.headers['anthropic-ratelimit-unified-7d_oi-utilization']).toBe('1.0')
    expect(json.headers['anthropic-ratelimit-unified-7d_oi-status']).toBe('rejected')
    expect(json.headers['anthropic-ratelimit-unified-7d_oi-reset']).toBe('1790359200')
    perModel = {}
    upstreamHeaders = RATE_HEADERS
  })

  it('does not retry when a window every model shares is rejected', async () => {
    perModel = {
      'test-model': {
        status: 429,
        headers: {
          ...LIMITED_FABLE,
          'anthropic-ratelimit-unified-5h-status': 'rejected',
          'anthropic-ratelimit-unified-5h-utilization': '1.0',
        },
      },
    }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(429)
    expect(seenModels).toEqual(['test-model'])
    const json = await res.json()
    expect(json.probe).toEqual({ model: 'test-model', fallbackUsed: false, primaryStatus: 429 })
    perModel = {}
  })

  it('keeps the primary answer when the fallback probe carries nothing usable', async () => {
    perModel = {
      'test-model': { status: 429, headers: LIMITED_FABLE },
      'fallback-model': { status: 500, body: '{"type":"error","error":{"type":"api_error","message":"boom"}}' },
    }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(seenModels).toEqual(['test-model', 'fallback-model'])
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.probe).toEqual({ model: 'test-model', fallbackUsed: false, primaryStatus: 429 })
    expect(json.headers['anthropic-ratelimit-unified-7d_oi-utilization']).toBe('1.0')
    perModel = {}
  })

  it('does not retry on 401', async () => {
    perModel = { 'test-model': { status: 401, body: '{"type":"error","error":{"type":"authentication_error","message":"bad"}}' } }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(401)
    expect(seenModels).toEqual(['test-model'])
    perModel = {}
  })
})

describe('odd answers from upstream', () => {
  it('reports an unreachable upstream as 502 without inventing headers', async () => {
    const dead = createProxyServer({ upstream: 'http://127.0.0.1:1' })
    const base = await listen(dead)
    const res = await fetch(`${base}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.upstreamStatus).toBeNull()
    expect(json.headers).toEqual({})
    expect(json.error.type).toBe('upstream_unreachable')
    dead.close()
  })

  it('answers with a null usage when the body carries none', async () => {
    upstreamStatus = 200
    upstreamHeaders = RATE_HEADERS
    upstreamBody = '{}'
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(200)
    expect((await res.json()).usage).toBeNull()
    upstreamBody = '{"usage":{"input_tokens":22,"output_tokens":1}}'
  })

  it('passes an error body through even when it is not JSON', async () => {
    perModel = { 'test-model': { status: 500, headers: {}, body: 'gateway exploded' } }
    seenModels = []
    const res = await fetch(`${proxyBase}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error.type).toBe('upstream_error')
    expect(json.error.message).toContain('gateway exploded')
    perModel = {}
  })

  it('does not retry when the fallback model is the primary one', async () => {
    const same = createProxyServer({ upstream: upstreamBaseUrl, model: 'only-model', fallbackModel: 'only-model' })
    const base = await listen(same)
    perModel = { 'only-model': { status: 429, headers: {} } }
    seenModels = []
    const res = await fetch(`${base}/usage`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(429)
    expect(seenModels).toEqual(['only-model'])
    perModel = {}
    same.close()
  })
})

describe('other routes', () => {
  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${proxyBase}/anything`)
    expect(res.status).toBe(404)
  })

  it('returns 405 for POST /usage', async () => {
    const res = await fetch(`${proxyBase}/usage`, { method: 'POST' })
    expect(res.status).toBe(405)
  })

  it('answers /healthz with 200', async () => {
    const res = await fetch(`${proxyBase}/healthz`)
    expect(res.status).toBe(200)
  })
})
