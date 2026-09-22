// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AccountCard from '../../src/components/AccountCard.vue'
import de from '../../src/i18n/de.json'
import type { Account } from '../../src/stores/accounts'
import type { ParsedUsage } from '../../src/api/usageParser'
import type { AccountPollState } from '../../src/scheduler/poller'
import type { Forecast } from '../../src/lib/forecast'

const NOW = Date.parse('2026-09-21T12:00:00Z')
const HOUR = 3_600_000

const account: Account = {
  id: 'a',
  name: 'Work',
  color: '#eab308',
  token: 'sk-ant-oat01-test',
  primaryWindow: 'critical',
  notificationsEnabled: true,
  order: 0,
  billingAccount: '',
  billingVisibility: 'everywhere',
  usedBy: '',
}

function parsed(over: Partial<ParsedUsage> = {}): ParsedUsage {
  return {
    fetchedAt: new Date(NOW).toISOString(),
    windows: [
      { key: '5h', utilization: 0.42, resetsAt: new Date(NOW + 2 * HOUR).toISOString(), status: 'allowed' },
      { key: '7d_oi', utilization: 0.96, resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString(), status: 'allowed' },
    ],
    overall: { status: 'allowed_warning', representativeClaim: 'seven_day_overage_included', resetsAt: null, fallbackPercentage: null },
    overage: { status: null, disabledReason: null },
    raw: {},
    usage: { inputTokens: 34, outputTokens: 1 },
    probe: { model: 'claude-fable-5-1', fallbackUsed: false, primaryStatus: 200 },
    ...over,
  }
}

function state(over: Partial<AccountPollState> = {}): AccountPollState {
  return { status: 'ok', lastFetchedAt: new Date(NOW).toISOString(), lastOkAt: new Date(NOW).toISOString(), lastError: null, pausedUntil: null, ...over }
}

function forecast(over: Partial<Forecast> = {}): Forecast {
  return {
    windowKey: '7d_oi', current: 0.96, ratePerHour: 0.02, exhaustsAt: new Date(NOW + 2 * HOUR).toISOString(), beforeReset: true,
    atReset: 1, resetsAt: new Date(NOW + 3 * 24 * HOUR).toISOString(), cycleStart: new Date(NOW - 4 * 24 * HOUR).toISOString(), points: 12, ...over,
  }
}

function mountCard(props: Partial<InstanceType<typeof AccountCard>['$props']> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(AccountCard, {
    props: { account, parsed: parsed(), state: state(), thresholds: { warn: 0.8, crit: 0.95 }, now: NOW, ...props },
    global: { plugins: [i18n], stubs: { UsageRings: true, RawDataView: true } },
  })
}

// The unfolded state lives in localStorage and would otherwise carry from test to test.
beforeEach(() => localStorage.clear())

describe('AccountCard', () => {
  it('translates the API verdict and the binding window into plain language', () => {
    const text = mountCard().text()
    expect(text).toContain('Erlaubt, nahe am Limit · maßgeblich: 7 d inkl. Overage')
    expect(text).not.toContain('allowed_warning')
  })

  it('colours the right edge by the worst window and explains it on the status strip', () => {
    const w = mountCard()
    expect((w.element as HTMLElement).style.borderRight).toContain('#ef4444')
    const strip = w.find('[role="img"]')
    expect(strip.attributes('aria-label')).toContain('7 d · Fable bei 96 % (kritisch ab 95 %)')
  })

  it('shows the forecast of the lead window on its own line', () => {
    const text = mountCard({ forecasts: { '7d_oi': forecast(), '5h': null } }).text()
    expect(text).toContain('Erschöpft in: 2h 0m (+2 %/h)')
  })

  it('reports a failed attempt with its time and keeps the last successful read in the footer', () => {
    const later = new Date(NOW + 5 * 60_000).toISOString()
    const text = mountCard({ state: state({ status: 'error', lastError: 'Failed to fetch', lastFetchedAt: later }) }).text()
    expect(text).toContain('fehlgeschlagen: Failed to fetch')
    expect(text).toContain('Zuletzt gelesen')
  })

  it('shows the billing account under the name', () => {
    const text = mountCard({ account: { ...account, billingAccount: 'Acme GmbH · DE-1234' } }).text()
    expect(text).toContain('Acme GmbH · DE-1234')
  })

  it('masks the billing account when the account asks for it', () => {
    const text = mountCard({
      account: { ...account, billingAccount: 'Acme GmbH · DE-1234', billingVisibility: 'masked' },
    }).text()
    expect(text).toContain('Acme…1234')
    expect(text).not.toContain('Acme GmbH · DE-1234')
  })

  it('leaves the billing account off the card when it is hidden on the dashboard', () => {
    const text = mountCard({
      account: { ...account, billingAccount: 'Acme GmbH · DE-1234', billingVisibility: 'hideOnDashboard' },
    }).text()
    expect(text).not.toContain('Acme')
  })

  it('keeps the billing line reserved so cards stay aligned', () => {
    const without = mountCard({ reserveBillingLine: true })
    expect(without.find('[data-test="billing"]').exists()).toBe(true)
    expect(without.find('[data-test="billing"]').text()).toBe('')
    expect(mountCard().find('[data-test="billing"]').exists()).toBe(false)
  })

  it('reveals who uses the account only after the footer is expanded', async () => {
    const w = mountCard({ account: { ...account, usedBy: 'Steffen (MacBook)\nCI-Runner build-02' } })
    const toggle = w.find('[data-test="used-by-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(w.text()).not.toContain('CI-Runner build-02')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(w.text()).toContain('Steffen (MacBook)')
    expect(w.text()).toContain('CI-Runner build-02')
  })

  it('offers no toggle when nobody is noted', () => {
    expect(mountCard().find('[data-test="used-by-toggle"]').exists()).toBe(false)
  })

  it('opens the status strip on focus and shows one line per window', async () => {
    const w = mountCard()
    const strip = w.find('[role="img"]')
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
    await strip.trigger('focus')
    const tip = w.find('[role="tooltip"]')
    expect(tip.exists()).toBe(true)
    expect(tip.findAll('span').length).toBeGreaterThan(1)
    await strip.trigger('blur')
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('works where localStorage refuses to answer', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    try {
      const w = mountCard({ account: { ...account, usedBy: 'Design team' } })
      expect(w.find('[data-test="used-by-toggle"]').attributes('aria-expanded')).toBe('false')
    } finally {
      Object.defineProperty(window, 'localStorage', real)
    }
  })

  it('colours a merely warning window amber, not red', () => {
    const w = mountCard({
      parsed: parsed({
        windows: [{ key: '5h', utilization: 0.85, resetsAt: new Date(NOW + HOUR).toISOString(), status: 'allowed' }],
      }),
    })
    expect((w.element as HTMLElement).style.borderRight).toContain('#f59e0b')
  })

  it('colours a quiet account green', () => {
    const w = mountCard({
      parsed: parsed({
        windows: [{ key: '5h', utilization: 0.1, resetsAt: new Date(NOW + HOUR).toISOString(), status: 'allowed' }],
      }),
    })
    expect((w.element as HTMLElement).style.borderRight).toContain('#10b981')
  })

  it('carries both recommendation stars', () => {
    const w = mountCard({ starNow: true, starWeek: true })
    expect(w.findAll('h3 svg')).toHaveLength(2)
    expect(w.text()).toContain(de.dashboard.recommend.starNow)
    expect(w.text()).toContain(de.dashboard.recommend.starWeek)
  })

  it('names every poll state in the footer', () => {
    for (const status of ['idle', 'fetching', 'ok', 'limited', 'error', 'paused', 'disabled'] as const) {
      const text = mountCard({ state: state({ status }) }).text()
      expect(text).toContain(de.dashboard.state[status])
    }
  })

  it('explains a reached limit instead of treating it as an error', () => {
    const text = mountCard({ state: state({ status: 'limited' }) }).text()
    expect(text).toContain(de.dashboard.limitedHint)
  })

  it('says the Fable window is missing when the fallback brought nothing', () => {
    const text = mountCard({
      parsed: parsed({
        windows: [{ key: '5h', utilization: 0.4, resetsAt: new Date(NOW + HOUR).toISOString(), status: 'allowed' }],
        probe: { model: 'claude-haiku-4-5-20251001', fallbackUsed: true, primaryStatus: 429 },
      }),
    }).text()
    expect(text).toContain('fehlt')
  })

  it('says where the values come from when the fallback carried the window along', () => {
    const text = mountCard({
      parsed: parsed({
        windows: [
          { key: '5h', utilization: 0.4, resetsAt: new Date(NOW + HOUR).toISOString(), status: 'allowed' },
          { key: '7d_oi', utilization: 1, resetsAt: new Date(NOW + HOUR).toISOString(), status: 'rejected' },
        ],
        probe: { model: 'claude-haiku-4-5-20251001', fallbackUsed: true, primaryStatus: 429 },
      }),
    }).text()
    expect(text).toContain('Haiku')
    expect(text).not.toContain('fehlt')
  })

  it('says so while nothing has been read', () => {
    const w = mountCard({ parsed: undefined })
    expect(w.text()).toContain(de.dashboard.noData)
    expect(w.find('[data-test="used-by-toggle"]').exists()).toBe(false)
  })

  it('keeps the used-by note folded away for a second card of the same account', async () => {
    const withNote = { ...account, usedBy: 'Design team' }
    const first = mountCard({ account: withNote })
    await first.find('[data-test="used-by-toggle"]').trigger('click')
    expect(first.find('[data-test="used-by-toggle"]').attributes('aria-expanded')).toBe('true')

    // A fresh card for the same account picks the remembered state up again.
    const second = mountCard({ account: withNote })
    expect(second.find('[data-test="used-by-toggle"]').attributes('aria-expanded')).toBe('true')
  })

  it('emits refresh when the poll button is clicked and disables it while fetching', async () => {
    const w = mountCard()
    await w.find('button[aria-label="Diesen Account jetzt abfragen"]').trigger('click')
    expect(w.emitted('refresh')).toHaveLength(1)
    const busy = mountCard({ state: state({ status: 'fetching' }) })
    expect(busy.find('button[aria-label="Diesen Account jetzt abfragen"]').attributes('disabled')).toBeDefined()
  })
})
