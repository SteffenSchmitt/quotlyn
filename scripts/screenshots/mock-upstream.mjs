import http from 'node:http'
const now = Math.floor(Date.now() / 1000)
const ACCOUNTS = {
  'sk-ant-oat01-AAAA': { u5: 0.27, u7: 0.05, uo: 0.09, delay: 0 },
  'sk-ant-oat01-BBBB': { u5: 0.83, u7: 0.44, uo: 0.61, delay: 0 },
  'sk-ant-oat01-CCCC': { u5: 0.02, u7: 0.40, uo: 0.47, delay: 6000 },
  'sk-ant-oat01-DDDD': { u5: 1.0, u7: 0.72, uo: 0.9, delay: 0, limited: true },
}
http.createServer((req, res) => {
  const tok = (req.headers.authorization || '').replace('Bearer ', '')
  const a = ACCOUNTS[tok]
  if (!a) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"type":"authentication_error"}}') }
  setTimeout(() => {
    const h = {
      'content-type': 'application/json',
      'anthropic-ratelimit-unified-status': a.limited ? 'rejected' : 'allowed',
      'anthropic-ratelimit-unified-representative-claim': 'five_hour',
      'anthropic-ratelimit-unified-reset': String(now + 12120),
      'anthropic-ratelimit-unified-fallback-percentage': '0.5',
      'anthropic-ratelimit-unified-5h-status': a.limited ? 'rejected' : 'allowed',
      'anthropic-ratelimit-unified-5h-utilization': String(a.u5),
      'anthropic-ratelimit-unified-5h-reset': String(now + 12120),
      'anthropic-ratelimit-unified-7d-status': 'allowed',
      'anthropic-ratelimit-unified-7d-utilization': String(a.u7),
      'anthropic-ratelimit-unified-7d-reset': String(now + 6 * 86400 + 82800),
      'anthropic-ratelimit-unified-7d_oi-status': 'allowed',
      'anthropic-ratelimit-unified-7d_oi-utilization': String(a.uo),
      'anthropic-ratelimit-unified-7d_oi-reset': String(now + 4 * 86400 + 7200),
      'anthropic-ratelimit-unified-overage-status': 'rejected',
      'anthropic-ratelimit-unified-overage-disabled-reason': 'org_level_disabled',
      'anthropic-organization-id': 'org-mock-1234',
      'request-id': 'req_mock_abcdef',
    }
    if (a.limited) { res.writeHead(429, h); return res.end('{"error":{"type":"rate_limit_error","message":"limit"}}') }
    res.writeHead(200, h)
    res.end(JSON.stringify({ usage: { input_tokens: 34, output_tokens: 1 } }))
  }, a.delay)
}).listen(18999, () => console.log('mock upstream :18999'))
