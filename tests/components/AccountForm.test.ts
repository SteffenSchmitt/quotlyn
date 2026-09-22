// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import de from '../../src/i18n/de.json'

const fetchMock = vi.fn()
vi.mock('../../src/api/usageClient', () => ({ fetchUsage: (...a: unknown[]) => fetchMock(...a) }))

import AccountForm from '../../src/components/AccountForm.vue'
import type { Account } from '../../src/stores/accounts'

const account: Account = {
  id: 'a',
  name: 'Alpha',
  color: '#eab308',
  token: 'sk-ant-oat01-existing',
  notificationsEnabled: true,
  primaryWindow: 'critical',
  order: 0,
  billingAccount: 'Northwind Ltd',
  billingVisibility: 'masked',
  usedBy: 'Design team',
}

function mountForm(props: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(AccountForm, { props, global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } } })
}

function ok(u5 = '0.42', u7 = '0.51') {
  return {
    ok: true,
    status: 200,
    body: {
      headers: {
        'anthropic-ratelimit-unified-5h-utilization': u5,
        'anthropic-ratelimit-unified-7d-utilization': u7,
      },
    },
  }
}

beforeEach(() => fetchMock.mockReset())

describe('AccountForm', () => {
  it('starts empty for a new account', () => {
    const w = mountForm()
    expect((w.find('input[required]').element as HTMLInputElement).value).toBe('')
    expect(w.find('fieldset input').element).toHaveProperty('value', '')
  })

  it('carries an existing account into the fields, meta information included', () => {
    const w = mountForm({ account })
    expect((w.find('input[required]').element as HTMLInputElement).value).toBe('Alpha')
    expect((w.find('fieldset input').element as HTMLInputElement).value).toBe('Northwind Ltd')
    expect((w.find('fieldset select').element as HTMLSelectElement).value).toBe('masked')
    expect((w.find('fieldset textarea').element as HTMLTextAreaElement).value).toBe('Design team')
  })

  it('emits everything it was given, trimmed', async () => {
    const w = mountForm()
    await w.find('input[required]').setValue('  Beta  ')
    await w.find('input[type="password"]').setValue('sk-ant-oat01-new')
    await w.find('fieldset input').setValue('  Contoso GmbH  ')
    await w.find('fieldset select').setValue('hideOnDashboard')
    await w.find('fieldset textarea').setValue('  Ops on-call  ')
    await w.find('form').trigger('submit')

    const saved = w.emitted('save')![0]![0] as Record<string, unknown>
    expect(saved).toMatchObject({
      name: 'Beta',
      token: 'sk-ant-oat01-new',
      billingAccount: 'Contoso GmbH',
      billingVisibility: 'hideOnDashboard',
      usedBy: 'Ops on-call',
    })
  })

  it('keeps the stored token when the field is left empty', async () => {
    const w = mountForm({ account })
    await w.find('form').trigger('submit')
    expect((w.emitted('save')![0]![0] as { token: string }).token).toBe('sk-ant-oat01-existing')
  })

  it('says nothing and saves nothing without a name', async () => {
    const w = mountForm()
    await w.find('input[type="password"]').setValue('sk-ant-oat01-new')
    await w.find('form').trigger('submit')
    expect(w.emitted('save')).toBeUndefined()
  })

  it('refuses a token of the wrong shape', async () => {
    const w = mountForm()
    await w.find('input[required]').setValue('Beta')
    await w.find('input[type="password"]').setValue('not-a-token')
    await w.find('form').trigger('submit')

    expect(w.emitted('save')).toBeUndefined()
    expect(w.text()).toContain(de.accounts.invalidToken)
  })

  it('reports a successful token test with the current percentages', async () => {
    fetchMock.mockResolvedValue(ok())
    const w = mountForm({ account })
    await w.findAll('button').find((b) => b.text() === de.accounts.test)!.trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('42'))
    expect(w.text()).toContain('51')
  })

  it('reports a failed token test', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, error: 'unauthorized' })
    const w = mountForm({ account })
    await w.findAll('button').find((b) => b.text() === de.accounts.test)!.trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('unauthorized'))
  })

  it('does not even ask when the token has the wrong shape', async () => {
    const w = mountForm()
    await w.find('input[type="password"]').setValue('nope')
    await w.findAll('button').find((b) => b.text() === de.accounts.test)!.trigger('click')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.text()).toContain(de.accounts.invalidToken)
  })

  it('copes with a test answer that carries no numbers', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: {} })
    const w = mountForm({ account })
    await w.findAll('button').find((b) => b.text() === de.accounts.test)!.trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('?'))
  })

  it('asks to be closed again', async () => {
    const w = mountForm()
    await w.findAll('button').find((b) => b.text() === de.accounts.cancel)!.trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })
})
