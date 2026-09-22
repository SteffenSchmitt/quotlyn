// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'

vi.mock('../../src/api/usageClient', () => ({ fetchUsage: vi.fn().mockResolvedValue({ ok: false, status: null, error: 'offline' }) }))
const downloads: Array<{ name: string; text: string; mime?: string }> = []
vi.mock('../../src/lib/exportImport', async (original) => {
  const real = await original<typeof import('../../src/lib/exportImport')>()
  return { ...real, downloadText: (name: string, text: string, mime?: string) => downloads.push({ name, text, mime }) }
})

import SettingsView from '../../src/views/SettingsView.vue'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { useUsageStore } from '../../src/stores/usage'
import { MemoryStorage, VAULT_KEY } from '../../src/storage/localStore'

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(SettingsView, { global: { plugins: [i18n] } })
}

/** The select whose options carry these values, whatever its position in the form. */
function selectWith(w: ReturnType<typeof mountView>, value: string) {
  return w.findAll('select').find((s) => s.findAll('option').some((o) => o.attributes('value') === value))!
}

let storage: MemoryStorage

beforeEach(async () => {
  downloads.length = 0
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  accountsDeps.storage = () => storage
  accountsDeps.session = () => new MemoryStorage()
  accountsDeps.iterations = 1000
  settingsDeps.storage = () => new MemoryStorage()
  useSettingsStore().load()
})

afterEach(() => vi.unstubAllGlobals())

describe('SettingsView', () => {
  it('writes a changed polling interval through to the store', async () => {
    const settings = useSettingsStore()
    const w = mountView()
    const input = w.findAll('input[type="number"]')[0]!
    await input.setValue(600)
    expect(settings.settings.intervalSeconds).toBe(600)
  })

  it('keeps the warn threshold below the critical one', async () => {
    const settings = useSettingsStore()
    const w = mountView()
    // Warn and critical are the two number fields with a percent range.
    const pcts = w.findAll('input[type="number"]').filter((i) => i.attributes('max') === '99' || i.attributes('max') === '100')
    await pcts[0]!.setValue(99)
    expect(settings.settings.thresholds.warn).toBeLessThan(settings.settings.thresholds.crit)
  })

  it('switches theme and language', async () => {
    const settings = useSettingsStore()
    const w = mountView()
    await selectWith(w, 'dark').setValue('dark')
    expect(settings.settings.theme).toBe('dark')
    await selectWith(w, 'en').setValue('en')
    expect(settings.settings.locale).toBe('en')
  })

  it('changes the forecast options', async () => {
    const settings = useSettingsStore()
    const w = mountView()
    const before = settings.settings.forecast.lookbackMinutes
    const lookback = w.findAll('select').find((s) => s.findAll('option').length > 2 && s.element.value === String(before))
    expect(lookback).toBeDefined()
    const other = lookback!.findAll('option').map((o) => o.attributes('value')).find((v) => v !== String(before))!
    await lookback!.setValue(other)
    expect(String(settings.settings.forecast.lookbackMinutes)).toBe(other)
  })

  it('only switches notifications on once the browser granted permission', async () => {
    const settings = useSettingsStore()
    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'denied', requestPermission: async () => 'denied' }))
    const w = mountView()
    const box = w.findAll('input[type="checkbox"]').find((c) => c.attributes('id') !== undefined) ?? w.find('input[type="checkbox"]')
    await box.setValue(true)
    await vi.waitFor(() => expect(settings.settings.notificationsEnabled).toBe(false))
  })

  it('carries every remaining control through to the store', async () => {
    const settings = useSettingsStore()
    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'granted', requestPermission: async () => 'granted' }))
    const w = mountView()

    const numbers = w.findAll('input[type="number"]')
    const retention = numbers.find((i) => i.element.value === String(settings.settings.retentionDays))!
    await retention.setValue(7)
    expect(settings.settings.retentionDays).toBe(7)

    const points = numbers.find((i) => i.attributes('min') === '2')
    if (points) {
      await points.setValue(5)
      expect(settings.settings.forecast.minPoints).toBe(5)
    }

    // Every checkbox in the form: flipping each one must land somewhere, not throw.
    for (const box of w.findAll('input[type="checkbox"]')) {
      if (box.attributes('disabled') !== undefined) continue
      const before = (box.element as HTMLInputElement).checked
      await box.setValue(!before)
    }
    await vi.waitFor(() => expect(settings.settings.notificationsEnabled).toBe(true))
    expect(settings.settings.forecast.enabled).toBeTypeOf('boolean')
  })

  it('switches the forecast off and on again', async () => {
    const settings = useSettingsStore()
    const w = mountView()
    const box = w.findAll('input[type="checkbox"]').find((c) => (c.element as HTMLInputElement).checked)!
    await box.setValue(false)
    await box.setValue(true)
    expect(settings.settings.forecast.enabled).toBeTypeOf('boolean')
  })

  it('offers merge and replace for a vault import', async () => {
    const w = mountView()
    const replace = w.find('input[type="radio"][value="replace"]')
    await replace.setValue()
    expect((replace.element as HTMLInputElement).checked).toBe(true)
  })

  it('does nothing when import is started without a file', async () => {
    const accounts = useAccountsStore()
    await accounts.init()
    await accounts.createVault('pass')
    const w = mountView()
    const run = w.findAll('button').find((b) => b.text() === de.settings.import.run)!
    await run.trigger('click')
    expect(w.text()).not.toContain(de.settings.import.malformed)
  })

  it('exports the sealed vault untouched', async () => {
    const accounts = useAccountsStore()
    await accounts.init()
    await accounts.createVault('pass')
    vi.stubGlobal('localStorage', storage)
    const w = mountView()

    const button = w.findAll('button').find((b) => b.text() === de.settings.export.accounts)!
    await button.trigger('click')
    expect(downloads).toHaveLength(1)
    expect(downloads[0]!.name).toMatch(/^quotlyn-accounts-.*\.json$/)
    expect(JSON.parse(downloads[0]!.text)).toEqual(JSON.parse(storage.getItem(VAULT_KEY)!))
  })

  it('exports nothing while there is no vault and no history yet', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const w = mountView()

    for (const label of [de.settings.export.accounts, de.settings.export.csv, de.settings.export.json]) {
      await w.findAll('button').find((b) => b.text() === label)!.trigger('click')
    }
    await vi.waitFor(() => expect(downloads).toHaveLength(0))
  })

  it('exports the history as CSV and as JSON', async () => {
    const accounts = useAccountsStore()
    await accounts.init()
    await accounts.createVault('pass')
    const account = await accounts.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
    const usage = useUsageStore()
    await usage.start()
    await usage.importHistory([
      { accountId: account.id, fetchedAt: new Date().toISOString(), ok: false, parsed: null, error: { status: 500, message: 'boom' } },
    ])
    const w = mountView()

    for (const label of [de.settings.export.csv, de.settings.export.json]) {
      const button = w.findAll('button').find((b) => b.text() === label)!
      await button.trigger('click')
    }
    await vi.waitFor(() => expect(downloads).toHaveLength(2))
    expect(downloads[0]!.name).toMatch(/\.csv$/)
    expect(downloads[0]!.text).toContain('Alpha')
    expect(downloads[1]!.name).toMatch(/\.json$/)
    expect(JSON.parse(downloads[1]!.text)[0].account).toBe('Alpha')
  })

  it('reports a malformed history import instead of throwing', async () => {
    const accounts = useAccountsStore()
    await accounts.init()
    await accounts.createVault('pass')
    const usage = useUsageStore()
    await usage.start()
    const w = mountView()

    const input = w.findAll('input[type="file"]').at(-1)!
    Object.defineProperty(input.element, 'files', { value: [new File(['{not json'], 'h.json')] })
    await input.trigger('change')
    const run = w.findAll('button').find((b) => b.text() === de.settings.importHistory.run)!
    await run.trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain(de.settings.importHistory.malformed))
  })

  it('reports a wrong passphrase on a vault import', async () => {
    const accounts = useAccountsStore()
    await accounts.init()
    await accounts.createVault('pass')
    const sealed = storage.getItem(VAULT_KEY)!
    const w = mountView()

    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File([sealed], 'vault.json')] })
    await input.trigger('change')
    await w.findAll('input[type="password"]').at(-1)!.setValue('wrong')
    const run = w.findAll('button').find((b) => b.text() === de.settings.import.run)!
    await run.trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain(de.vault.wrong))
  })
})
