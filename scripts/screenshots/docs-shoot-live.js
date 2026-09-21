// README screenshots from a real history export (see replay-upstream.mjs): dark theme, accounts in export
// order, the export's snapshots seeded into IndexedDB with their timestamps shifted so the newest is "now".
// Usage: node docs-shoot-live.js <outdir> <history-export.json>
// page.evaluate / page.$eval are Playwright's page-context calls with our own literal code, not eval() on input.
const { chromium } = require('playwright-core')
const { readFileSync } = require('node:fs')
const out = process.argv[2]
const file = process.argv[3]
const base = 'http://localhost:15173'
const COLORS = ['#eab308', '#f97316', '#ec4899', '#22d3ee', '#a3e635']
;(async () => {
  const snaps = JSON.parse(readFileSync(file, 'utf8'))
  const newest = Math.max(...snaps.map((s) => Date.parse(s.fetchedAt)))
  const shiftMs = Date.now() - newest
  const names = [...new Set(snaps.map((s) => s.account))]

  const b = await chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', page.url(), e.message))
  await page.goto(base + '/')
  await page.waitForSelector('input[type=password]')
  const pws = await page.$$('input[type=password]')
  await pws[0].fill('demo-passphrase'); await pws[1].fill('demo-passphrase')
  await page.check('input[type=checkbox]')
  await page.click('button[type=submit]')
  await page.waitForSelector('nav')
  await page.goto(base + '/settings'); await page.waitForTimeout(300)
  await page.selectOption('select:has(option[value="dark"])', 'dark')
  await page.goto(base + '/accounts')
  for (const [i, name] of names.entries()) {
    await page.click('text=Add account'); await page.waitForSelector('form')
    await page.fill('form input[required]', name)
    await page.$eval('form input[type=color]', (el, c) => { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })) }, COLORS[i % COLORS.length])
    await page.fill('form input[type=password]', `sk-ant-oat01-${String(i + 1).padStart(4, '0')}`)
    await page.click('form button[type=submit]')
    await page.waitForSelector('form', { state: 'detached' })
  }
  await page.goto(base + '/')
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000)
    if ((await page.evaluate(() => document.querySelectorAll('article canvas').length)) >= names.length) break
  }

  // Seed the export: map account names to the ids the app created, shift every timestamp.
  const seeded = await page.evaluate(async ({ snaps, shiftMs }) => {
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('quotlyn', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const db = await open()
    const all = await new Promise((res) => { const r = db.transaction('snapshots').objectStore('snapshots').getAll(); r.onsuccess = () => res(r.result) })
    // The app's own first polls carry the created account ids in creation order; map export names onto them.
    const created = [...new Set(all.map((s) => s.accountId))]
    const names = [...new Set(snaps.map((s) => s.account))]
    const map = Object.fromEntries(names.map((n, i) => [n, created[i]]))
    const shift = (iso) => new Date(Date.parse(iso) + shiftMs).toISOString()
    const tx = db.transaction('snapshots', 'readwrite')
    const store = tx.objectStore('snapshots')
    let n = 0
    for (const s of snaps) {
      const accountId = map[s.account]
      if (!accountId) continue
      const parsed = s.parsed
        ? {
            ...s.parsed,
            fetchedAt: shift(s.parsed.fetchedAt),
            windows: s.parsed.windows.map((w) => ({ ...w, resetsAt: w.resetsAt ? shift(w.resetsAt) : null })),
            overall: { ...s.parsed.overall, resetsAt: s.parsed.overall.resetsAt ? shift(s.parsed.overall.resetsAt) : null },
          }
        : null
      store.add({ accountId, fetchedAt: shift(s.fetchedAt), ok: s.ok, parsed, error: s.error })
      n++
    }
    await new Promise((res) => { tx.oncomplete = res })
    return `${names.length} accounts -> ${created.length} ids, ${n} snapshots`
  }, { snaps, shiftMs })
  console.log('seeded:', seeded)

  await page.goto(base + '/')
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000)
    const text = await page.innerText('main')
    if (!text.includes('Not fetched yet') && !text.includes('Fetching')) break
  }
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/dashboard.png`, fullPage: true })
  await page.goto(base + '/history'); await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/history.png`, fullPage: true })
  await page.goto(base + '/timeline'); await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/timeline.png`, fullPage: true })
  await page.goto(base + '/accounts'); await page.waitForTimeout(500)
  await page.click(`text=${names[0]}`); await page.waitForSelector('form'); await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/accounts.png`, fullPage: true })
  await page.goto(base + '/settings'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/settings.png`, fullPage: true })
  await page.goto(base + '/help'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/help.png`, fullPage: true })
  await b.close()
  console.log('done', out)
})().catch((e) => { console.error(e); process.exit(1) })
