const { chromium } = require('playwright-core')
const fs = require('fs')
const out = process.argv[2] || 'shots'
const base = 'http://localhost:15173'
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const b = await chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForSelector('input[type=password]')
  const pws = await page.$$('input[type=password]')
  await pws[0].fill('test-pass-1234'); await pws[1].fill('test-pass-1234')
  await page.check('input[type=checkbox]')
  await page.click('button[type=submit]')
  await page.waitForSelector('nav')
  await page.goto(base + '/accounts')
  const accounts = [
    ['Account A', '#eab308', 'sk-ant-oat01-AAAA'],
    ['Account B', '#f97316', 'sk-ant-oat01-BBBB'],
    ['Account C', '#ec4899', 'sk-ant-oat01-CCCC'],
    ['Account D', '#8b5cf6', 'sk-ant-oat01-DDDD'],
  ]
  for (const [name, color, token] of accounts) {
    await page.click('text=Add account')
    await page.waitForSelector('form')
    await page.fill('form input[required]', name)
    await page.$eval('form input[type=color]', (el, c) => { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })) }, color)
    await page.fill('form input[type=password]', token)
    await page.click('form button[type=submit]')
    await page.waitForSelector('form', { state: 'detached' })
  }
  await page.screenshot({ path: `${out}/accounts.png`, fullPage: true })
  // open edit form of the first account by clicking its name
  await page.click('text=Account A')
  await page.waitForSelector('form')
  await page.screenshot({ path: `${out}/accounts-edit.png`, fullPage: true })
  await page.click('form >> text=Cancel')
  await page.goto(base + '/')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/dashboard-fetching.png`, fullPage: true })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${out}/dashboard.png`, fullPage: true })
  await page.hover('article >> nth=0 >> canvas', { position: { x: 10, y: 92 } })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/dashboard-hover.png`, fullPage: true })
  await page.mouse.move(0, 0)
  await page.hover('article >> nth=0 >> li >> nth=1')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/dashboard-hover-legend.png`, fullPage: true })
  await page.mouse.move(0, 0)
  await page.click('text=Raw headers >> nth=0')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/dashboard-raw.png`, fullPage: true })
  for (const p of ['history', 'timeline', 'settings', 'help']) {
    await page.goto(base + '/' + p); await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/${p}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto(base + '/'); await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/dashboard-narrow.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
  // dark theme
  await page.goto(base + '/settings'); await page.waitForTimeout(500)
  await page.selectOption('select:has(option[value="dark"])', 'dark')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/settings-dark.png`, fullPage: true })
  await page.goto(base + '/'); await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/dashboard-dark.png`, fullPage: true })
  await page.goto(base + '/accounts'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/accounts-dark.png`, fullPage: true })
  await b.close()
  console.log('done', out)
})().catch((e) => { console.error(e); process.exit(1) })
