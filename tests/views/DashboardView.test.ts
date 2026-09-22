// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'

vi.mock('vue-echarts', () => ({ default: { name: 'VChart', props: ['option', 'autoresize'], template: '<div class="chart" />' } }))
const fetchMock = vi.fn()
vi.mock('../../src/api/usageClient', () => ({ fetchUsage: (...a: unknown[]) => fetchMock(...a) }))
vi.mock('../../src/notify/webNotify', () => ({ notify: vi.fn() }))

import DashboardView from '../../src/views/DashboardView.vue'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { useUsageStore } from '../../src/stores/usage'
import { MemoryStorage } from '../../src/storage/localStore'

function reading(u5: number, u7 = 0.1) {
  const reset = Math.floor((Date.now() + 7_200_000) / 1000)
  return {
    ok: true as const,
    status: 200,
    body: {
      fetchedAt: new Date().toISOString(),
      headers: {
        'anthropic-ratelimit-unified-status': 'allowed',
        'anthropic-ratelimit-unified-5h-utilization': String(u5),
        'anthropic-ratelimit-unified-5h-reset': String(reset),
        'anthropic-ratelimit-unified-7d-utilization': String(u7),
        'anthropic-ratelimit-unified-7d-reset': String(reset),
      },
      usage: { input_tokens: 34, output_tokens: 1 },
      probe: { model: 'claude-fable-5-1', fallbackUsed: false, primaryStatus: 200 },
    },
  }
}

async function setup(names: string[] = ['Alpha']) {
  setActivePinia(createPinia())
  accountsDeps.storage = () => new MemoryStorage()
  accountsDeps.session = () => new MemoryStorage()
  accountsDeps.iterations = 1000
  settingsDeps.storage = () => new MemoryStorage()
  const accounts = useAccountsStore()
  await accounts.init()
  await accounts.createVault('pass')
  for (const [i, name] of names.entries()) {
    await accounts.addAccount({ name, color: '#000', token: `sk-ant-oat01-${i}` })
  }
  const settings = useSettingsStore()
  settings.load()
  settings.update({ autoRefresh: false })
  const usage = useUsageStore()
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  const w = mount(DashboardView, { global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } } })
  return { accounts, settings, usage, w }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(reading(0.2))
})

describe('DashboardView', () => {
  it('points at the help page while there is no account', async () => {
    setActivePinia(createPinia())
    accountsDeps.storage = () => new MemoryStorage()
    accountsDeps.session = () => new MemoryStorage()
    settingsDeps.storage = () => new MemoryStorage()
    const accounts = useAccountsStore()
    await accounts.init()
    await accounts.createVault('pass')
    useSettingsStore().load()
    const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
    const w = mount(DashboardView, { global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } } })

    expect(w.text()).toContain(de.dashboard.emptyHelp)
    expect(w.findAll('article')).toHaveLength(0)
  })

  it('shows one card per account', async () => {
    const { w } = await setup(['Alpha', 'Beta'])
    expect(w.findAll('article')).toHaveLength(2)
    expect(w.text()).toContain('Alpha')
    expect(w.text()).toContain('Beta')
  })

  it('refreshes every account on demand', async () => {
    const { w } = await setup(['Alpha', 'Beta'])
    const button = w.findAll('button').find((b) => b.text() === de.dashboard.refresh)!
    await button.trigger('click')
    // The poller staggers accounts by two seconds, so the second read arrives late.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 6000 })
  })

  it('takes the column count from the settings and keeps it as an upper bound', async () => {
    const { settings, w } = await setup()
    const grid = () => w.findAll('div').find((d) => d.classes().includes('grid'))!
    expect(grid().classes()).toContain('xl:grid-cols-3')
    expect(grid().classes()).not.toContain('2xl:grid-cols-4')

    settings.update({ dashboardColumns: 4 })
    await w.vm.$nextTick()
    expect(grid().classes()).toContain('2xl:grid-cols-4')

    settings.update({ dashboardColumns: 2 })
    await w.vm.$nextTick()
    expect(grid().classes()).not.toContain('xl:grid-cols-3')
  })

  it('changes the column count through the toolbar', async () => {
    const { settings, w } = await setup()
    const select = w.findAll('select').find((s) => s.findAll('option').some((o) => o.attributes('value') === '4'))!
    await select.setValue('4')
    expect(settings.settings.dashboardColumns).toBe(4)
  })

  it('switches the order and the auto-refresh interval', async () => {
    const { settings, w } = await setup()
    const sort = w.findAll('select').find((s) => s.findAll('option').some((o) => o.attributes('value') === 'headroom'))!
    await sort.setValue('headroom')
    expect(settings.settings.dashboardSort).toBe('headroom')

    const auto = w.findAll('select').find((s) => s.findAll('option').some((o) => o.attributes('value') === 'off'))!
    await auto.setValue('off')
    expect(settings.settings.autoRefresh).toBe(false)
    await auto.setValue('600')
    expect(settings.settings.autoRefresh).toBe(true)
    expect(settings.settings.intervalSeconds).toBe(600)
  })

  it('orders the cards by remaining room when asked to', async () => {
    const { settings, usage, w } = await setup(['Alpha', 'Beta'])
    const accounts = useAccountsStore().accounts
    fetchMock.mockResolvedValueOnce(reading(0.9)).mockResolvedValueOnce(reading(0.1))
    await usage.start()
    await usage.refreshAccount(accounts[0]!.id)
    await usage.refreshAccount(accounts[1]!.id)
    settings.update({ dashboardSort: 'headroom' })
    await w.vm.$nextTick()

    const names = w.findAll('article h3').map((h) => h.text().trim())
    expect(names[0]).toContain('Beta')
  })

  it('names the account to use next once there is more than one', async () => {
    const { usage, w } = await setup(['Alpha', 'Beta'])
    const accounts = useAccountsStore().accounts
    fetchMock.mockResolvedValueOnce(reading(0.9)).mockResolvedValueOnce(reading(0.1))
    await usage.start()
    await usage.refreshAccount(accounts[0]!.id)
    await usage.refreshAccount(accounts[1]!.id)
    await w.vm.$nextTick()

    expect(w.text()).toContain(de.dashboard.recommend.title)
  })

  it('folds the recommendation open and shut', async () => {
    const { usage, w } = await setup(['Alpha', 'Beta'])
    const accounts = useAccountsStore().accounts
    fetchMock.mockResolvedValue(reading(0.3))
    await usage.start()
    await usage.refreshAccount(accounts[0]!.id)
    await usage.refreshAccount(accounts[1]!.id)
    await w.vm.$nextTick()

    const toggle = w.find('section button[aria-expanded]')
    const before = toggle.attributes('aria-expanded')
    await toggle.trigger('click')
    expect(w.find('section button[aria-expanded]').attributes('aria-expanded')).not.toBe(before)
  })

  it('says so for the half of the recommendation that has no account left', async () => {
    const { usage, w } = await setup(['Alpha', 'Beta'])
    const ids = useAccountsStore().accounts.map((a) => a.id)
    // Sessions are used up, the week still has room: one half of the strip has nothing to name.
    fetchMock.mockResolvedValue(reading(1, 0.2))
    await usage.start()
    for (const id of ids) await usage.refreshAccount(id)
    await w.vm.$nextTick()

    const strip = w.findAll('section').find((x) => x.classes().includes('rounded-lg'))!
    expect(strip).toBeDefined()
    expect(strip.text()).toContain(de.dashboard.recommend.none)
  })

  it('keeps a single account off the recommendation strip', async () => {
    const { usage, w } = await setup(['Alpha'])
    fetchMock.mockResolvedValue(reading(0.3))
    await usage.start()
    await usage.refreshAccount(useAccountsStore().accounts[0]!.id)
    await w.vm.$nextTick()

    // The stars still sit on the card; only the strip above the cards stays away.
    expect(w.findAll('section').some((x) => x.classes().includes('rounded-lg'))).toBe(false)
  })

  it('reserves the billing line only once an account carries one', async () => {
    const { accounts, w } = await setup(['Alpha'])
    expect(w.find('[data-test="billing"]').exists()).toBe(false)

    await accounts.updateAccount(accounts.accounts[0]!.id, { billingAccount: 'Northwind Ltd' })
    await w.vm.$nextTick()
    expect(w.find('[data-test="billing"]').text()).toBe('Northwind Ltd')
  })
})
