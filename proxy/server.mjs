// Stateless usage probe for Claude subscription accounts.
// Sends a one-token Messages request and returns Anthropic's rate-limit headers as JSON.
// No dependencies. Never logs headers or bodies.
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const BETA_HEADER = 'oauth-2025-04-20'
const API_VERSION = '2023-06-01'
const MESSAGES_PATH = '/v1/messages'
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...extraHeaders })
  res.end(JSON.stringify(payload))
}

function pickHeaders(headers) {
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith('anthropic-') || name === 'request-id') {
      out[name] = Array.isArray(value) ? value.join(', ') : String(value)
    }
  }
  return out
}

export function createProxyServer({ upstream, port, model } = {}) {
  const base = new URL(upstream ?? process.env.QUOTLYN_UPSTREAM ?? 'https://api.anthropic.com')
  const probeModel = model ?? process.env.QUOTLYN_PROBE_MODEL ?? DEFAULT_MODEL
  const client = base.protocol === 'https:' ? https : http
  const probeBody = JSON.stringify({
    model: probeModel,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  })

  const server = http.createServer((req, res) => {
    const started = Date.now()
    const url = new URL(req.url ?? '/', 'http://localhost')

    res.on('finish', () => {
      console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started} ms)`)
    })

    if (url.pathname === '/healthz') return json(res, 200, { ok: true })
    if (url.pathname !== '/usage') return json(res, 404, { error: 'not_found' })
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' })

    const auth = req.headers.authorization
    if (!auth) return json(res, 401, { error: 'missing_authorization' })

    const upstreamReq = client.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || undefined,
        path: MESSAGES_PATH,
        method: 'POST',
        headers: {
          authorization: auth,
          'anthropic-beta': BETA_HEADER,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(probeBody),
        },
      },
      (upstreamRes) => {
        let raw = ''
        upstreamRes.setEncoding('utf8')
        upstreamRes.on('data', (chunk) => (raw += chunk))
        upstreamRes.on('end', () => {
          const status = upstreamRes.statusCode ?? 502
          let parsed = null
          try {
            parsed = JSON.parse(raw)
          } catch {
            parsed = null
          }

          const payload = {
            fetchedAt: new Date().toISOString(),
            upstreamStatus: status,
            headers: pickHeaders(upstreamRes.headers),
          }
          if (status >= 200 && status < 300) {
            payload.usage = parsed?.usage ?? null
          } else {
            payload.error = parsed?.error ?? { type: 'upstream_error', message: raw.slice(0, 200) }
          }
          const retryAfter = upstreamRes.headers['retry-after']
          json(res, status, payload, retryAfter ? { 'retry-after': retryAfter } : {})
        })
      },
    )

    upstreamReq.on('error', (err) => {
      json(res, 502, {
        fetchedAt: new Date().toISOString(),
        upstreamStatus: null,
        headers: {},
        error: { type: 'upstream_unreachable', message: err.message },
      })
    })
    upstreamReq.end(probeBody)
  })

  if (port !== undefined) server.listen(port, '0.0.0.0')
  return server
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirectRun) {
  const port = Number(process.env.QUOTLYN_PROXY_PORT ?? 8787)
  createProxyServer({ port })
  console.log(`quotlyn proxy listening on :${port}`)
}
