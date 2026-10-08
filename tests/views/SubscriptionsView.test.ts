// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'

vi.mock('../../src/api/usageClient', () => ({ fetchUsage: vi.fn().mockResolvedValue({ ok: false, status: null, error: 'offline' }) }))

import SubscriptionsView from '../../src/views/SubscriptionsView.vue'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { usageDeps, useUsageStore } from '../../src/stores/usage'
import { MemoryStorage } from '../../src/storage/localStore'

function inDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function setup() {
  setActivePinia(createPinia())
  accountsDeps.storage = () => new MemoryStorage()
  accountsDeps.session = () => new MemoryStorage()
  accountsDeps.iterations = 1000
  settingsDeps.storage = () => new MemoryStorage()
  usageDeps.storage = () => new MemoryStorage()
  const accounts = useAccountsStore()
  await accounts.init()
  await accounts.createVault('pass')
  const settings = useSettingsStore()
  settings.load()
  settings.update({ autoRefresh: false })
  await useUsageStore().start()
  return { accounts, settings }
}

function mountView() {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(SubscriptionsView, { global: { plugins: [i18n] } })
}

describe('SubscriptionsView', () => {
  it('says how to get started while no account has subscription details', async () => {
    const { accounts } = await setup()
    await accounts.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
    const w = mountView()
    expect(w.text()).toContain(de.subscriptions.empty)
  })

  it('shows the monthly total, the next date and one row per subscription', async () => {
    const { accounts } = await setup()
    await accounts.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a', plan: 'max20x', monthlyPrice: 216, subscriptionDate: inDays(5) })
    await accounts.addAccount({ name: 'Beta', color: '#000', token: 'sk-ant-oat01-b', plan: 'max5x', monthlyPrice: 108.5, subscriptionDate: inDays(2), subscriptionCancelled: true })
    await accounts.addAccount({ name: 'Gamma', color: '#000', token: 'sk-ant-oat01-c' })
    const w = mountView()

    // Beta is cancelled: left out of the total by default, named beneath it.
    const total = w.find('[data-test="sub-total"]').text()
    expect(total).toContain('216,00')
    expect(total).toContain('€')
    expect(w.find('[data-test="sub-cancelled"]').text()).toContain('ohne 108,50')
    expect(w.find('[data-test="sub-next"]').text()).toContain('Beta')
    const rows = w.findAll('tbody tr')
    expect(rows.map((r) => r.find('td').text())).toEqual(['Alpha', 'Beta'])
    expect(rows[0]!.text()).toContain('Max 20x')
    expect(rows[1]!.text()).toContain('endet')
    expect(rows[0]!.text()).toContain(de.subscriptions.noData)
  })

  it('counts cancelled subscriptions in once switched on, and remembers that', async () => {
    const { accounts, settings } = await setup()
    await accounts.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a', monthlyPrice: 216, subscriptionDate: inDays(5) })
    await accounts.addAccount({ name: 'Beta', color: '#000', token: 'sk-ant-oat01-b', monthlyPrice: 108.5, subscriptionDate: inDays(2), subscriptionCancelled: true })
    const w = mountView()
    expect(w.findAll('tbody tr')[1]!.classes()).toContain('opacity-50')

    await w.find('[data-test="sub-include-cancelled"]').setValue(true)
    expect(settings.settings.subscriptionsIncludeCancelled).toBe(true)
    expect(w.find('[data-test="sub-total"]').text()).toContain('324,50')
    expect(w.find('[data-test="sub-cancelled"]').text()).toContain('inkl. 108,50')
    expect(w.findAll('tbody tr')[1]!.classes()).not.toContain('opacity-50')
  })

  it('formats prices in the currency from the settings', async () => {
    const { accounts, settings } = await setup()
    settings.update({ currency: 'USD' })
    await accounts.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a', monthlyPrice: 200 })
    const w = mountView()
    expect(w.find('[data-test="sub-total"]').text()).toContain('$')
  })
})
