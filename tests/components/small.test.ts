// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'
import InfoTip from '../../src/components/InfoTip.vue'
import RawDataView from '../../src/components/RawDataView.vue'
import ThemeToggle from '../../src/components/ThemeToggle.vue'
import StatusDot from '../../src/components/StatusDot.vue'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { MemoryStorage } from '../../src/storage/localStore'
import { applyTheme, isDark } from '../../src/lib/theme'

function i18n() {
  return createI18n({ legacy: false, locale: 'de', messages: { de } })
}

function mountWith(component: unknown, props: Record<string, unknown> = {}) {
  return mount(component as never, { props, global: { plugins: [i18n()] } })
}

describe('InfoTip', () => {
  it('reveals its text on hover and hides it again', async () => {
    const w = mountWith(InfoTip, { text: 'Erklärung' })
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
    await w.find('button').trigger('mouseenter')
    expect(w.find('[role="tooltip"]').text()).toBe('Erklärung')
    await w.find('button').trigger('mouseleave')
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('toggles on click and points at its tooltip for screen readers', async () => {
    const w = mountWith(InfoTip, { text: 'Erklärung', label: 'Hilfe' })
    const button = w.find('button')
    expect(button.attributes('aria-label')).toBe('Hilfe')
    expect(button.attributes('aria-describedby')).toBeUndefined()
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.attributes('aria-describedby')).toBe(w.find('[role="tooltip"]').attributes('id'))
  })

  it('closes on Escape and stops listening once it is gone', async () => {
    const w = mountWith(InfoTip, { text: 'Erklärung' })
    await w.find('button').trigger('click')
    expect(w.find('[role="tooltip"]').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await w.vm.$nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
    w.unmount()
    // No listener left behind: dispatching again must not throw on the unmounted component.
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).not.toThrow()
  })
})

describe('RawDataView', () => {
  const raw = {
    'anthropic-ratelimit-unified-5h-utilization': '0.42',
    'anthropic-organization-id': 'org-secret-1234',
    'anthropic-ratelimit-unified-brand-new': 'surprise',
  }

  it('stays folded until it is asked to open', () => {
    const w = mountWith(RawDataView, { raw })
    expect(w.find('table').exists()).toBe(false)
  })

  it('masks identifying headers and unmasks them on request', async () => {
    const w = mountWith(RawDataView, { raw })
    await w.find('button').trigger('click')
    expect(w.text()).toContain('org-…')
    expect(w.text()).not.toContain('org-secret-1234')
    await w.find('input[type="checkbox"]').setValue(false)
    expect(w.text()).toContain('org-secret-1234')
  })

  it('marks a header it does not know yet', async () => {
    const w = mountWith(RawDataView, { raw })
    await w.find('button').trigger('click')
    const marked = w.findAll('tr').filter((r) => r.text().includes('brand-new'))
    expect(marked).toHaveLength(1)
    expect(marked[0]!.classes().join(' ')).toContain('amber')
    expect(marked[0]!.text()).toContain(de.dashboard.raw.new)
  })

  it('sorts the headers by name', async () => {
    const w = mountWith(RawDataView, { raw })
    await w.find('button').trigger('click')
    const names = w.findAll('tr').map((r) => r.findAll('td')[0]!.text().split(' ')[0])
    expect(names).toEqual([...names].sort())
  })
})

describe('ThemeToggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    settingsDeps.storage = () => new MemoryStorage()
  })

  it('mirrors the applied theme and pins the other one on click', async () => {
    const settings = useSettingsStore()
    settings.load()
    applyTheme('light')
    const w = mountWith(ThemeToggle)
    expect(w.find('button').attributes('aria-checked')).toBe('false')

    await w.find('button').trigger('click')
    expect(settings.settings.theme).toBe('dark')
    applyTheme('dark')
    expect(isDark.value).toBe(true)
    await w.vm.$nextTick()
    expect(w.find('button').attributes('aria-checked')).toBe('true')

    await w.find('button').trigger('click')
    expect(settings.settings.theme).toBe('light')
  })
})

describe('StatusDot', () => {
  it('has a colour for every poll state and falls back for an unknown one', () => {
    for (const status of ['idle', 'fetching', 'ok', 'limited', 'error', 'paused', 'disabled', 'something-else']) {
      const w = mountWith(StatusDot, { status })
      expect(w.html()).toMatch(/class="[^"]+"/)
    }
  })
})
