// Retakes the README screenshots against the mock stack, dark theme, with a seeded 24h history.
const { chromium } = require('playwright-core')
const out = process.argv[2]
const base = 'http://localhost:15173'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForSelector('input[type=password]')
  const pws = await page.$$('input[type=password]')
  await pws[0].fill('demo-passphrase'); await pws[1].fill('demo-passphrase')
  await page.check('input[type=checkbox]')
  await page.click('button[type=submit]')
  await page.waitForSelector('nav')
  // dark theme first so every shot matches
  await page.goto(base + '/settings'); await page.waitForTimeout(300)
  await page.selectOption('select:has(option[value="dark"])', 'dark')
  await page.goto(base + '/accounts')
  const accounts = [
    ['Account A', '#eab308', 'sk-ant-oat01-AAAA'],
    ['Account B', '#f97316', 'sk-ant-oat01-BBBB'],
    ['Account C', '#ec4899', 'sk-ant-oat01-CCCC'],
  ]
  for (const [name, color, token] of accounts) {
    await page.click('text=Add account'); await page.waitForSelector('form')
    await page.fill('form input[required]', name)
    await page.$eval('form input[type=color]', (el, c) => { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })) }, color)
    await page.fill('form input[type=password]', token)
    await page.click('form button[type=submit]')
    await page.waitForSelector('form', { state: 'detached' })
  }
  // wait until every account has an OK snapshot (C answers late, polls are staggered)
  await page.goto(base + '/')
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000)
    const ok = await page.evaluate(() => document.querySelectorAll('article canvas').length)
    if (ok >= 3) break
  }

  // seed 24 h of snapshots per account: sawtooth per 5 h window, slow rise for the 7 d windows
  const seeded = await page.evaluate(async () => {
    const H = 3600e3
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('quotlyn', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const db = await open()
    const all = await new Promise((res) => { const r = db.transaction('snapshots').objectStore('snapshots').getAll(); r.onsuccess = () => res(r.result) })
    const ids = [...new Set(all.map((s) => s.accountId))]
    const now = Date.now()
    const tx = db.transaction('snapshots', 'readwrite')
    const store = tx.objectStore('snapshots')
    const shape = (f) => Math.min(1, Math.pow(f / 0.9, 1.35))
    let n = 0
    ids.forEach((id, ai) => {
      const last = all.filter((s) => s.accountId === id && s.ok).slice(-1)[0]
      if (!last) return
      const get = (k) => last.parsed.windows.find((w) => w.key === k)?.utilization ?? 0
      const target5h = get('5h'), target7d = get('7d'), targetOi = get('7d_oi')
      const anchor = now - (1.6 + ai * 0.45) * H // last session reset
      const peaks = [0.88, 0.7, 0.55]
      for (let m = 24 * 60; m >= 5; m -= 5) {
        const t = now - m * 60e3
        const k = Math.floor((t - anchor) / (5 * H))
        const cycleStart = anchor + k * 5 * H
        const frac = (t - cycleStart) / (5 * H)
        const current = cycleStart === anchor
        const peak = current ? target5h / shape((now - anchor) / (5 * H)) : peaks[ai % 3] * (0.9 + 0.1 * Math.sin(k))
        const u5 = Math.min(1, peak * shape(frac) * (1 + 0.03 * Math.sin(m / 23)))
        const u7 = Math.max(0, target7d * (1 - 0.35 * (m / 1440)))
        const uo = Math.max(0, targetOi * (1 - 0.5 * (m / 1440)))
        const parsed = JSON.parse(JSON.stringify(last.parsed))
        parsed.fetchedAt = new Date(t).toISOString()
        for (const w of parsed.windows) {
          if (w.key === '5h') { w.utilization = Math.round(u5 * 100) / 100; w.resetsAt = new Date(cycleStart + 5 * H).toISOString() }
          if (w.key === '7d') w.utilization = Math.round(u7 * 100) / 100
          if (w.key === '7d_oi') w.utilization = Math.round(uo * 100) / 100
        }
        store.add({ accountId: id, fetchedAt: parsed.fetchedAt, ok: true, parsed, error: null })
        n++
      }
    })
    await new Promise((res) => { tx.oncomplete = res })
    return `${ids.length} accounts, ${n} snapshots`
  })
  console.log('seeded accounts:', seeded)

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
  await page.click('text=Account A'); await page.waitForSelector('form'); await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/accounts.png`, fullPage: true })
  await page.goto(base + '/settings'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/settings.png`, fullPage: true })
  await page.goto(base + '/help'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/help.png`, fullPage: true })
  await b.close()
  console.log('done', out)
})().catch((e) => { console.error(e); process.exit(1) })
