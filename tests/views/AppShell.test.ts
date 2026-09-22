// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount, RouterLinkStub } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'
import en from '../../src/i18n/en.json'

vi.mock('vue-echarts', () => ({ default: { name: 'VChart', props: ['option', 'autoresize'], template: '<div class="chart" />' } }))
vi.mock('../../src/api/usageClient', () => ({ fetchUsage: vi.fn().mockResolvedValue({ ok: false, status: null, error: 'offline' }) }))
vi.mock('../../src/notify/webNotify', () => ({ notify: vi.fn() }))

import App from '../../src/App.vue'
import HelpView from '../../src/views/HelpView.vue'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { MemoryStorage } from '../../src/storage/localStore'

function i18n() {
  return createI18n({ legacy: false, locale: 'de', fallbackLocale: 'en', messages: { de, en } })
}

/**
 * The shell on its own. The passphrase card re-runs the vault's init() on mount, which locks and
 * reopens asynchronously; that dance has its own test file, and letting it run here would only make
 * these assertions race it. `gated: false` puts a pass-through in its place.
 */
function mountApp({ gated = true } = {}) {
  const gate = gated ? {} : { PassphraseGate: { template: '<div><slot /></div>' } }
  return mount(App, {
    global: {
      plugins: [i18n()],
      stubs: { RouterLink: RouterLinkStub, RouterView: { template: '<div class="view" />' }, ...gate },
    },
  })
}

// Every mounted App keeps watchers alive; without this they pile up across the file.
enableAutoUnmount(afterEach)

let storage: MemoryStorage
let session: MemoryStorage
// App.vue calls settings.load() itself, so this has to be one storage per test, not one per call.
let settingsStorage: MemoryStorage

beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  session = new MemoryStorage()
  accountsDeps.storage = () => storage
  accountsDeps.session = () => session
  accountsDeps.iterations = 1000
  settingsStorage = new MemoryStorage()
  settingsDeps.storage = () => settingsStorage
  // "auto" would follow navigator.language, which is English here; pin it so the assertions can
  // name the German strings. The language test switches it on purpose.
  const settings = useSettingsStore()
  settings.load()
  settings.update({ locale: 'de' })
  document.title = ''
})

/**
 * An open vault that survives the gate's own init(): without a remembered session key the gate
 * finds the sealed blob on mount and locks again, which is exactly what a reload does.
 */
async function openVault() {
  const store = useAccountsStore()
  await store.init()
  await store.createVault('long-enough-1')
  await store.setRememberSession(true)
  return store
}

describe('App shell', () => {
  it('shows the passphrase gate instead of the app while the vault is closed', async () => {
    const w = mountApp()
    await vi.waitFor(() => expect(w.find('input[type="password"]').exists()).toBe(true))
    expect(w.find('.view').exists()).toBe(false)
  })

  it('shows the navigation and the routed view once the vault is open', async () => {
    await openVault()
    const w = mountApp({ gated: false })
    expect(w.find('nav').exists()).toBe(true)
    expect(w.find('.view').exists()).toBe(true)
    expect(w.text()).toContain(de.nav.dashboard)
  })

  it('carries the version in the header', async () => {
    const w = mountApp()
    expect(w.text()).toMatch(/v\d+\.\d+\.\d+/)
  })

  it('puts the worst utilization into the tab title and takes it out again', async () => {
    await openVault()
    mountApp({ gated: false })
    await vi.waitFor(() => expect(document.title).toBe(de.app.title), { timeout: 5000 })
  })

  it('follows the language setting', async () => {
    const settings = useSettingsStore()
    const w = mountApp()
    await vi.waitFor(() => expect(w.find('input[type="password"]').exists()).toBe(true))

    settings.update({ locale: 'en' })
    await w.vm.$nextTick()
    expect(w.text()).toContain(en.app.tagline)

    settings.update({ locale: 'de' })
    await w.vm.$nextTick()
    expect(w.text()).toContain(de.app.tagline)
  })

  it('applies the theme to the document', async () => {
    const settings = useSettingsStore()
    mountApp()
    settings.update({ theme: 'dark' })
    await vi.waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
    settings.update({ theme: 'light' })
    await vi.waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false))
  })

  it('locks the vault again on request', async () => {
    const store = await openVault()
    const w = mountApp({ gated: false })

    const lock = w.findAll('button').find((b) => b.text() === de.vault.lock)!
    await lock.trigger('click')
    expect(store.status).toBe('locked')
    await w.vm.$nextTick()
    expect(w.find('nav').exists()).toBe(false)
  })
})

describe('HelpView', () => {
  it('walks through the steps and links to the documentation', () => {
    const w = mount(HelpView, { global: { plugins: [i18n()], stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain(de.help_page.title)
    for (const step of de.help_page.steps.items) expect(w.text()).toContain(step.h)
    for (const note of de.help_page.notes.items) expect(w.text()).toContain(note)
    expect(w.find('a[href^="http"]').exists()).toBe(true)
  })

  it('shows the command that mints a token', () => {
    const w = mount(HelpView, { global: { plugins: [i18n()], stubs: { RouterLink: RouterLinkStub } } })
    expect(w.find('code, pre').text()).toContain('claude')
  })
})
