// @vitest-environment happy-dom
// Timeline and history: both are echarts on a canvas, so the chart stands in as an empty element
// and the assertions cover what the views themselves decide — controls, empty states, series.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'

const options: unknown[] = []
vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="chart" />',
    // Capture on every redraw, not just the first, so a changed selection is visible here.
    mounted(this: { option: unknown }) {
      options.push(this.option)
    },
    updated(this: { option: unknown }) {
      options.push(this.option)
    },
  },
}))
vi.mock('../../src/api/usageClient', () => ({ fetchUsage: vi.fn().mockResolvedValue({ ok: false, status: null, error: 'offline' }) }))
vi.mock('../../src/notify/webNotify', () => ({ notify: vi.fn() }))

import TimelineView from '../../src/views/TimelineView.vue'
import HistoryView from '../../src/views/HistoryView.vue'
import { accountsDeps, useAccountsStore, type Account } from '../../src/stores/accounts'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { useUsageStore } from '../../src/stores/usage'
import { MemoryStorage } from '../../src/storage/localStore'
import type { UsageSnapshot } from '../../src/storage/historyDb'

const HOUR = 3_600_000

function snapshot(accountId: string, minutesAgo: number, u5: number): Omit<UsageSnapshot, 'id'> {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  return {
    accountId,
    fetchedAt: at,
    ok: true,
    parsed: {
      fetchedAt: at,
      windows: [
        { key: '5h', utilization: u5, resetsAt: new Date(Date.now() + 2 * HOUR).toISOString(), status: 'allowed' },
        { key: '7d', utilization: 0.3, resetsAt: new Date(Date.now() + 48 * HOUR).toISOString(), status: 'allowed' },
      ],
      overall: { status: 'allowed', representativeClaim: null, resetsAt: null, fallbackPercentage: null },
      overage: { status: null, disabledReason: null },
      raw: {},
      usage: null,
      probe: { model: null, fallbackUsed: false, primaryStatus: 200 },
    },
    error: null,
  }
}

let accounts: Account[]

async function setup(names = ['Alpha', 'Beta']) {
  setActivePinia(createPinia())
  accountsDeps.storage = () => new MemoryStorage()
  accountsDeps.session = () => new MemoryStorage()
  accountsDeps.iterations = 1000
  settingsDeps.storage = () => new MemoryStorage()
  const store = useAccountsStore()
  await store.init()
  await store.createVault('pass')
  accounts = []
  for (const [i, name] of names.entries()) {
    accounts.push(await store.addAccount({ name, color: '#000', token: `sk-ant-oat01-${i}` }))
  }
  const settings = useSettingsStore()
  settings.load()
  settings.update({ autoRefresh: false })
  const usage = useUsageStore()
  await usage.start()
  return { store, settings, usage }
}

function mountView(view: unknown) {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(view as never, { global: { plugins: [i18n] } })
}

/** Seeds readings so both views have something to draw. */
async function seed(usage: ReturnType<typeof useUsageStore>) {
  const snaps = accounts.flatMap((a, i) => [
    snapshot(a.id, 90, 0.2 + i * 0.1),
    snapshot(a.id, 45, 0.4 + i * 0.1),
    snapshot(a.id, 5, 0.6 + i * 0.1),
  ])
  await usage.importHistory(snaps)
}

beforeEach(() => {
  options.length = 0
})

describe('TimelineView', () => {
  it('says so while nothing has been read yet', async () => {
    await setup()
    const w = mountView(TimelineView)
    expect(w.text()).toContain(de.timeline.empty)
    expect(w.find('.chart').exists()).toBe(false)
  })

  it('draws a row per account and window once there are readings', async () => {
    const { usage } = await setup()
    await seed(usage)
    const w = mountView(TimelineView)
    await w.vm.$nextTick()

    expect(w.find('.chart').exists()).toBe(true)
    expect(options).toHaveLength(1)
    const option = options[0] as { series: Array<{ data: unknown[] }> }
    expect(option.series[0]!.data.length).toBeGreaterThanOrEqual(4)
  })

  it('remembers a different order in the settings', async () => {
    const { settings, usage } = await setup()
    await seed(usage)
    const w = mountView(TimelineView)
    const select = w.find('select')
    const other = select.findAll('option').map((o) => o.attributes('value')).find((v) => v !== settings.settings.timelineSort)!
    await select.setValue(other)
    expect(settings.settings.timelineSort).toBe(other)
  })
})

describe('the text the charts render', () => {
  it('builds a timeline tooltip with account, window, countdown and reset', async () => {
    const { store, usage } = await setup(['Alpha'])
    await seed(usage)
    await store.updateAccount(accounts[0]!.id, { billingAccount: 'Northwind Ltd · INV-4821' })
    mountView(TimelineView)
    await vi.waitFor(() => expect(options).toHaveLength(1))

    const option = options[0] as {
      tooltip: { formatter: (p: unknown) => string }
      yAxis: { axisLabel: { formatter: (v: string) => string } }
      xAxis: { axisLabel: { formatter: (v: number) => string } }
      series: Array<{ data: Array<Record<string, unknown>> }>
    }
    const bar = option.series[0]!.data[0]!
    const tip = option.tooltip.formatter({ data: bar })
    expect(tip).toContain('Alpha')
    expect(tip).toContain('Northwind Ltd · INV-4821')
    expect(tip).toContain('5 h')

    expect(option.xAxis.axisLabel.formatter(0.25)).toBe('25 %')
    expect(option.yAxis.axisLabel.formatter(`Alpha\u0001 5 h`)).toContain('Alpha')
  })

  it('draws every bar as a group, with or without a forecast clock', async () => {
    const { usage } = await setup(['Alpha'])
    await seed(usage)
    mountView(TimelineView)
    await vi.waitFor(() => expect(options).toHaveLength(1))

    type Shape = { type: string; children: Array<{ type: string }> }
    const option = options[0] as {
      series: Array<{
        data: Array<Record<string, unknown>>
        renderItem: (p: { dataIndex: number }, api: unknown) => Shape | null
      }>
    }
    const series = option.series[0]!
    // echarts hands the renderer a coordinate helper; a linear stand-in is enough to exercise it.
    const api = {
      coord: ([x, row]: [number, number]) => [100 + x * 400, 20 + row * 30],
      size: () => [0, 24],
    }

    const withClock = series.renderItem({ dataIndex: 0 }, api)
    expect(withClock!.type).toBe('group')
    expect(withClock!.children.length).toBeGreaterThan(1)

    // A row the data does not have must not throw, it simply draws nothing.
    expect(series.renderItem({ dataIndex: 99 }, api)).toBeNull()

    // A bar that lasts until the reset draws a solid clock instead of a split one.
    series.data[0]!.exhaustsAtMs = null
    series.data[0]!.lasts = true
    expect(series.renderItem({ dataIndex: 0 }, api)!.type).toBe('group')

    // And one without any forecast at all draws no clock.
    series.data[0]!.lasts = false
    expect(series.renderItem({ dataIndex: 0 }, api)!.type).toBe('group')
  })

  it('builds a history tooltip with the time and every series at that moment', async () => {
    const { usage } = await setup(['Alpha'])
    await seed(usage)
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.find('.chart').exists()).toBe(true))

    const option = options.at(-1) as {
      tooltip: { formatter: (p: unknown) => string }
      yAxis: { axisLabel: { formatter: (v: number) => string } }
    }
    const at = new Date()
    const tip = option.tooltip.formatter([
      { marker: '<i></i>', seriesName: 'Alpha', value: [at.toISOString(), 42] },
    ])
    expect(tip).toContain('Alpha')
    expect(tip).toContain('42 %')
    expect(option.tooltip.formatter([])).toBe('')
    expect(String(option.yAxis.axisLabel.formatter)).toContain('%')
  })
})

describe('HistoryView', () => {
  it('says so while there is no history', async () => {
    await setup()
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.text()).toContain(de.history.empty))
  })

  it('draws one series per selected account', async () => {
    const { usage } = await setup()
    await seed(usage)
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.find('.chart').exists()).toBe(true))

    const option = options.at(-1) as { series: Array<{ name: string }> }
    const names = option.series.map((s) => s.name)
    expect(names.some((n) => n.includes('Alpha'))).toBe(true)
    expect(names.some((n) => n.includes('Beta'))).toBe(true)
  })

  it('drops an account from the chart when it is unticked', async () => {
    const { usage } = await setup()
    await seed(usage)
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.find('.chart').exists()).toBe(true))

    await w.findAll('input[type="checkbox"]')[0]!.setValue(false)
    await vi.waitFor(() => {
      const option = options.at(-1) as { series: Array<{ name: string }> }
      expect(option.series.some((s) => s.name.includes('Alpha'))).toBe(false)
    })
  })

  it('switches the window it charts', async () => {
    const { usage } = await setup()
    await seed(usage)
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.find('.chart').exists()).toBe(true))

    const select = w.find('select')
    const other = select.findAll('option').map((o) => o.attributes('value')).find((v) => v !== select.element.value)
    if (other) {
      await select.setValue(other)
      await w.vm.$nextTick()
      expect(select.element.value).toBe(other)
    }
  })

  it('narrows and widens the time range', async () => {
    const { usage } = await setup()
    await seed(usage)
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.find('.chart').exists()).toBe(true))

    const labels = [de.history.range24h, de.history.range7d, de.history.range30d]
    const ranges = w.findAll('button').filter((b) => labels.includes(b.text().trim()))
    expect(ranges.length).toBeGreaterThan(1)
    await ranges.at(-1)!.trigger('click')
    await w.vm.$nextTick()
    expect(ranges.at(-1)!.classes()).toContain('btn-primary')
  })

  it('carries the billing account into the selector tooltip', async () => {
    const { store, usage } = await setup()
    await seed(usage)
    await store.updateAccount(accounts[0]!.id, { billingAccount: 'Northwind Ltd', billingVisibility: 'hideOnDashboard' })
    const w = mountView(HistoryView)
    await vi.waitFor(() => expect(w.find('.chart').exists()).toBe(true))

    const labels = w.findAll('label').filter((l) => l.text().includes('Alpha'))
    expect(labels[0]!.attributes('title')).toContain('Northwind Ltd')
  })
})
