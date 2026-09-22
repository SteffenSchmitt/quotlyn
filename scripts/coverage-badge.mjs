#!/usr/bin/env node
// Turns coverage/coverage-summary.json into a shields.io endpoint file.
//
//   node scripts/coverage-badge.mjs <out.json> [metric]
//
// The metric defaults to "lines". shields.io reads the result through
// https://img.shields.io/endpoint?url=<raw url of this file>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const out = process.argv[2]
const metric = process.argv[3] ?? 'lines'
if (!out) {
  console.error('usage: node scripts/coverage-badge.mjs <out.json> [statements|branches|functions|lines]')
  process.exit(1)
}

const summaryPath = resolve(root, 'coverage/coverage-summary.json')
let summary
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
} catch {
  console.error(`coverage-badge: no ${summaryPath}; run npm run coverage first`)
  process.exit(1)
}

const pct = summary.total?.[metric]?.pct
if (typeof pct !== 'number') {
  console.error(`coverage-badge: no ${metric} in the summary`)
  process.exit(1)
}

/** Green from 90 %, then down through amber to red, so the colour carries the same news as the number. */
function colour(value) {
  if (value >= 90) return 'brightgreen'
  if (value >= 80) return 'green'
  if (value >= 70) return 'yellow'
  if (value >= 60) return 'orange'
  return 'red'
}

const badge = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${pct.toFixed(1)} %`,
  color: colour(pct),
}

mkdirSync(dirname(resolve(root, out)), { recursive: true })
writeFileSync(resolve(root, out), `${JSON.stringify(badge, null, 2)}\n`)
console.log(`coverage-badge: ${badge.message} (${metric}) -> ${out}`)
