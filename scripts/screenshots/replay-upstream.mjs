// Mock Messages API that replays the LAST OK snapshot per account from a Quotlyn history export.
// Time is shifted so that the newest snapshot in the export counts as "now"; reset headers move along.
// Usage: node replay-upstream.mjs <history-export.json>   (tokens: sk-ant-oat01-0001, -0002, ... in account order)
import http from 'node:http'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node replay-upstream.mjs <history-export.json>'); process.exit(1) }
const snaps = JSON.parse(readFileSync(file, 'utf8'))
const newest = Math.max(...snaps.map((s) => Date.parse(s.fetchedAt)))
const shiftMs = Date.now() - newest
export const SHIFT_MS = shiftMs

const names = [...new Set(snaps.map((s) => s.account))]
const byToken = {}
names.forEach((name, i) => {
  const last = snaps.filter((s) => s.account === name && s.ok && s.parsed).sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt)).pop()
  if (last) byToken[`sk-ant-oat01-${String(i + 1).padStart(4, '0')}`] = { name, raw: last.parsed.raw, usage: last.parsed.usage }
})
console.log('replay accounts:', Object.entries(byToken).map(([t, a]) => `${a.name} -> ${t}`).join(', '), `| shift ${Math.round(shiftMs / 60000)} min`)

function shifted(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    out[k] = /-reset$/.test(k) && /^\d+$/.test(v) ? String(Number(v) + Math.round(shiftMs / 1000)) : v
  }
  return out
}

http.createServer((req, res) => {
  const tok = (req.headers.authorization || '').replace('Bearer ', '')
  const a = byToken[tok]
  if (!a) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"type":"authentication_error"}}') }
  const h = { 'content-type': 'application/json', ...shifted(a.raw) }
  const limited = h['anthropic-ratelimit-unified-status'] === 'rejected'
  if (limited) { res.writeHead(429, h); return res.end('{"error":{"type":"rate_limit_error","message":"limit"}}') }
  res.writeHead(200, h)
  res.end(JSON.stringify({ usage: a.usage ? { input_tokens: a.usage.inputTokens, output_tokens: a.usage.outputTokens } : { input_tokens: 34, output_tokens: 1 } }))
}).listen(18999, () => console.log('replay upstream :18999'))
