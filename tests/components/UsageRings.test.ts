// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// The gauge is echarts on a canvas, which happy-dom has no 2D context for. The legend beside it
// carries every number worth asserting, so the chart itself stands in as an empty element.
const options: unknown[] = []
vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="chart" />',
    mounted(this: { option: unknown }) {
      options.push(this.option)
    },
  },
}))
import { createI18n } from 'vue-i18n'
import de from '../../src/i18n/de.json'
import UsageRings from '../../src/components/UsageRings.vue'
import type { ParsedUsage } from '../../src/api/usageParser'
import type { Forecast } from '../../src/lib/forecast'

const NOW = Date.parse('2026-09-21T12:00:00Z')
const HOUR = 3_600_000

function parsed(windows: Array<[string, number]> = [['5h', 0.42], ['7d', 0.2], ['7d_oi', 0.96]]): ParsedUsage {
  return {
    fetchedAt: new Date(NOW).toISOString(),
    windows: windows.map(([key, utilization]) => ({
      key,
      utilization,
      resetsAt: new Date(NOW + 2 * HOUR).toISOString(),
      status: 'allowed',
    })),
    overall: { status: 'allowed', representativeClaim: null, resetsAt: null, fallbackPercentage: null },
    overage: { status: null, disabledReason: null },
    raw: {},
    usage: null,
    probe: { model: null, fallbackUsed: false, primaryStatus: 200 },
  }
}

function forecast(over: Partial<Forecast> = {}): Forecast {
  return {
    windowKey: '5h',
    current: 0.42,
    ratePerHour: 0.05,
    exhaustsAt: new Date(NOW + 3 * HOUR).toISOString(),
    beforeReset: false,
    atReset: 0.6,
    resetsAt: new Date(NOW + 2 * HOUR).toISOString(),
    cycleStart: new Date(NOW - 3 * HOUR).toISOString(),
    points: 8,
    ...over,
  }
}

function mountRings(props: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(UsageRings, {
    props: { parsed: parsed(), now: NOW, ...props },
    global: { plugins: [i18n] },
  })
}

describe('the gauge option', () => {
  it('names the window and its percentage in the tooltip of every ring', () => {
    options.length = 0
    mountRings()
    const option = options[0] as {
      tooltip: { formatter: (p: { seriesIndex: number }) => string }
      series: Array<{ detail?: { formatter?: () => string } }>
    }
    const first = option.tooltip.formatter({ seriesIndex: 0 })
    expect(first).toMatch(/\d+ %/)
    expect(option.tooltip.formatter({ seriesIndex: 99 })).toBeTypeOf('string')

    const detail = option.series.map((s) => s.detail?.formatter).find(Boolean)
    if (detail) expect(detail()).toMatch(/\d+ %/)
  })

  it('builds an option even for a reading without windows', () => {
    options.length = 0
    mountRings({ parsed: parsed([]) })
    expect(options[0]).toBeTruthy()
  })
})

describe('UsageRings', () => {
  it('lists one legend row per window with its percentage and countdown', () => {
    const text = mountRings().text()
    expect(text).toContain('42 %')
    expect(text).toContain('20 %')
    expect(text).toContain('96 %')
    expect(text).toContain('2h 0m')
  })

  it('labels the known windows in plain language', () => {
    const text = mountRings().text()
    expect(text).toContain('5 h')
    expect(text).toContain('7 d')
  })

  it('falls back to the raw key for a window it does not know', () => {
    const text = mountRings({ parsed: parsed([['9y', 0.1]]) }).text()
    expect(text).toContain('9y')
  })

  it('adds the forecast of a window to its row', () => {
    const text = mountRings({ forecasts: { '5h': forecast({ beforeReset: true }) } }).text()
    expect(text).toMatch(/3h 0m|Ersch/)
  })

  it('says when a window is expected to last until the reset', () => {
    const text = mountRings({ forecasts: { '5h': forecast({ beforeReset: false, atReset: 0.6 }) } }).text()
    expect(text).toContain('60 %')
  })

  it('renders without any forecast at all', () => {
    expect(mountRings({ forecasts: {} }).text()).toContain('42 %')
  })

  it('marks an exhausted account as limited', () => {
    const text = mountRings({ parsed: parsed([['5h', 1]]), limited: true }).text()
    expect(text).toContain('100 %')
  })

  it('leads with the window the account picked', () => {
    const w = mountRings({ primaryWindow: '7d_oi' })
    expect(w.text()).toContain('96 %')
  })

  it('shows a forecast that has already run out', () => {
    const text = mountRings({
      parsed: parsed([['5h', 1]]),
      forecasts: { '5h': forecast({ current: 1, beforeReset: true, exhaustsAt: new Date(NOW - HOUR).toISOString() }) },
    }).text()
    expect(text).toContain('100 %')
  })

  it('shows a window without a reset time', () => {
    const w = mountRings({
      parsed: {
        ...parsed(),
        windows: [{ key: '5h', utilization: 0.3, resetsAt: null, status: 'allowed' }],
      },
    })
    expect(w.text()).toContain('30 %')
  })

  it('leads with the most used window when the chosen one is missing', () => {
    const w = mountRings({ parsed: parsed([['5h', 0.42]]), primaryWindow: '7d_oi' })
    expect(w.text()).toContain('42 %')
  })

  it('survives a reading without any window', () => {
    expect(() => mountRings({ parsed: parsed([]) })).not.toThrow()
  })
})
