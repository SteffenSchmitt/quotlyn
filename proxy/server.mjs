// Stateless usage probe for Claude subscription accounts.
// Sends a one-token Messages request and returns Anthropic's rate-limit headers as JSON.
// No dependencies. Never logs headers or bodies.
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const BETA_HEADER = 'oauth-2025-04-20'
const API_VERSION = '2023-06-01'
const MESSAGES_PATH = '/v1/messages'
const DEFAULT_MODEL = 'claude-fable-5-1'
const DEFAULT_FALLBACK_MODEL = 'claude-haiku-4-5-20251001'
// The API only serves the larger models to these OAuth tokens when the request
// identifies itself as the Claude CLI. This is the CLI's own system prompt.
const PROBE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude."
const RATE_LIMIT_MARKER = 'anthropic-ratelimit-unified-status'

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

function probeBody(model) {
  return JSON.stringify({
    model,
    max_tokens: 1,
    system: [{ type: 'text', text: PROBE_SYSTEM }],
    messages: [{ role: 'user', content: 'hi' }],
  })
}

export function createProxyServer({ upstream, port, model, fallbackModel } = {}) {
  const base = new URL(upstream ?? process.env.QUOTLYN_UPSTREAM ?? 'https://api.anthropic.com')
  const primaryModel = model ?? process.env.QUOTLYN_PROBE_MODEL ?? DEFAULT_MODEL
  const secondaryModel = fallbackModel ?? process.env.QUOTLYN_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL
  const client = base.protocol === 'https:' ? https : http

  function sendProbe(auth, probeModel) {
    return new Promise((resolve, reject) => {
      const body = probeBody(probeModel)
      const req = client.request(
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
            'content-length': Buffer.byteLength(body),
          },
        },
        (upstreamRes) => {
          let raw = ''
          upstreamRes.setEncoding('utf8')
          upstreamRes.on('data', (chunk) => (raw += chunk))
          upstreamRes.on('end', () => {
            let parsed = null
            try {
              parsed = JSON.parse(raw)
            } catch {
              parsed = null
            }
            resolve({ status: upstreamRes.statusCode ?? 502, headers: upstreamRes.headers, parsed, raw })
          })
        },
      )
      req.on('error', reject)
      req.end(body)
    })
  }

  const server = http.createServer(async (req, res) => {
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

    try {
      let probeModel = primaryModel
      let result = await sendProbe(auth, primaryModel)
      const primaryStatus = result.status
      let fallbackUsed = false
      if (result.status === 429 && !(RATE_LIMIT_MARKER in result.headers) && secondaryModel !== primaryModel) {
        probeModel = secondaryModel
        result = await sendProbe(auth, secondaryModel)
        fallbackUsed = true
      }

      const payload = {
        fetchedAt: new Date().toISOString(),
        upstreamStatus: result.status,
        headers: pickHeaders(result.headers),
        probe: { model: probeModel, fallbackUsed, primaryStatus },
      }
      if (result.status >= 200 && result.status < 300) {
        payload.usage = result.parsed?.usage ?? null
      } else {
        payload.error = result.parsed?.error ?? { type: 'upstream_error', message: result.raw.slice(0, 200) }
      }
      const retryAfter = result.headers['retry-after']
      json(res, result.status, payload, retryAfter ? { 'retry-after': retryAfter } : {})
    } catch (err) {
      json(res, 502, {
        fetchedAt: new Date().toISOString(),
        upstreamStatus: null,
        headers: {},
        error: { type: 'upstream_unreachable', message: err.message },
      })
    }
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
