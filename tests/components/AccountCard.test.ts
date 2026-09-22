// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
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

  it('emits refresh when the poll button is clicked and disables it while fetching', async () => {
    const w = mountCard()
    await w.find('button[aria-label="Diesen Account jetzt abfragen"]').trigger('click')
    expect(w.emitted('refresh')).toHaveLength(1)
    const busy = mountCard({ state: state({ status: 'fetching' }) })
    expect(busy.find('button[aria-label="Diesen Account jetzt abfragen"]').attributes('disabled')).toBeDefined()
  })
})
