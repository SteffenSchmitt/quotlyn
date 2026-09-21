// Smoke test: starts the mock stack, drives the app through every page with a headless browser and
// fails on any page error or console error. Runs locally (installed Chrome) and in CI (Chromium from
// `npx playwright-core install chromium`).
//
//   node scripts/smoke.js
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const base = 'http://localhost:15173'
const procs = []
function start(cmd, args, env = {}) {
  const p = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore' })
  procs.push(p)
  return p
}
function stopAll() {
  for (const p of procs) p.kill('SIGTERM')
}
async function waitFor(url, ms = 30_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timeout waiting for ${url}`)
}

;(async () => {
  start('node', ['scripts/screenshots/mock-upstream.mjs'])
  start('node', ['proxy/server.mjs'], { QUOTLYN_UPSTREAM: 'http://localhost:18999', QUOTLYN_PROXY_PORT: '18787' })
  start('npx', ['vite', '--port', '15173', '--strictPort'], { QUOTLYN_PROXY_PORT: '18787' })
  await waitFor('http://localhost:18787/healthz')
  await waitFor(base + '/')

  const launch = process.env.CI ? {} : { channel: 'chrome' }
  const b = await chromium.launch(launch)
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  const page = await ctx.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push(`pageerror ${page.url()}: ${e.message}`))
  page.on('console', (m) => {
    // The limited account answers 429 by design; the browser logs that response as an error.
    if (m.type() === 'error' && !/429 \(Too Many Requests\)/.test(m.text())) problems.push(`console ${page.url()}: ${m.text()}`)
  })

  await page.goto(base + '/')
  await page.waitForSelector('input[type=password]')
  const pws = await page.$$('input[type=password]')
  await pws[0].fill('smoke-passphrase')
  await pws[1].fill('smoke-passphrase')
  await page.check('input[type=checkbox]')
  await page.click('button[type=submit]')
  await page.waitForSelector('nav')
  await page.goto(base + '/accounts')
  for (const [name, token] of [
    ['Account A', 'sk-ant-oat01-AAAA'],
    ['Account B', 'sk-ant-oat01-BBBB'],
    ['Account D', 'sk-ant-oat01-DDDD'],
  ]) {
    await page.click('text=Add account')
    await page.waitForSelector('form')
    await page.fill('form input[required]', name)
    await page.fill('form input[type=password]', token)
    await page.click('form button[type=submit]')
    await page.waitForSelector('form', { state: 'detached' })
  }
  await page.goto(base + '/')
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000)
    if ((await page.evaluate(() => document.querySelectorAll('article canvas').length)) >= 3) break
  }
  const cards = await page.evaluate(() => document.querySelectorAll('article').length)
  if (cards !== 3) problems.push(`expected 3 cards, saw ${cards}`)
  const limited = await page.evaluate(() => document.body.innerText.includes('Limit reached'))
  if (!limited) problems.push('the limited account is not shown as limit reached')

  await page.hover('article >> nth=0 >> [role="img"]')
  await page.waitForTimeout(300)
  for (const route of ['/history', '/timeline', '/accounts', '/settings', '/help']) {
    await page.goto(base + route)
    await page.waitForTimeout(1200)
  }
  await page.goto(base + '/')
  await page.click('header >> button:has-text("Lock")')
  await page.waitForSelector('input[type=password]')

  await b.close()
  stopAll()
  if (problems.length) {
    console.error('smoke: FAILED')
    for (const p of problems) console.error('  ' + p)
    process.exit(1)
  }
  console.log('smoke: ok (dashboard, history, timeline, accounts, settings, help, lock)')
})().catch((e) => {
  stopAll()
  console.error(e)
  process.exit(1)
})
