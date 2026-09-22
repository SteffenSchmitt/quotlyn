// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'

vi.mock('../../src/api/usageClient', () => ({ fetchUsage: vi.fn().mockResolvedValue({ ok: false, status: null, error: 'offline' }) }))

import AccountsView from '../../src/views/AccountsView.vue'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { settingsDeps } from '../../src/stores/settings'
import { MemoryStorage } from '../../src/storage/localStore'

async function mountView() {
  setActivePinia(createPinia())
  accountsDeps.storage = () => new MemoryStorage()
  accountsDeps.session = () => new MemoryStorage()
  accountsDeps.iterations = 1000
  settingsDeps.storage = () => new MemoryStorage()
  const store = useAccountsStore()
  await store.init()
  await store.createVault('pass')
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  const w = mount(AccountsView, { global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } } })
  return { store, w }
}

/** Fills the add/edit form the view is showing and submits it. */
async function fillForm(w: Awaited<ReturnType<typeof mountView>>['w'], name: string, token = 'sk-ant-oat01-test') {
  await w.find('form input[required]').setValue(name)
  await w.find('form input[type="password"]').setValue(token)
  await w.find('form').trigger('submit')
}

beforeEach(() => vi.clearAllMocks())

describe('AccountsView', () => {
  it('says so while there is no account yet', async () => {
    const { w } = await mountView()
    expect(w.text()).toContain(de.accounts.empty)
  })

  it('adds an account through the form and closes it afterwards', async () => {
    const { store, w } = await mountView()
    await w.find('button.btn-primary').trigger('click')
    await fillForm(w, 'Alpha')
    // Saving seals the vault, which is real crypto: wait for the form to close rather than for a tick.
    await vi.waitFor(() => expect(w.find('form').exists()).toBe(false))

    expect(store.accounts.map((a) => a.name)).toEqual(['Alpha'])
    expect(w.text()).not.toContain(de.accounts.empty)
  })

  it('refuses a token that is not an OAuth token', async () => {
    const { store, w } = await mountView()
    await w.find('button.btn-primary').trigger('click')
    await fillForm(w, 'Alpha', 'nope')

    expect(store.accounts).toHaveLength(0)
    expect(w.text()).toContain(de.accounts.invalidToken)
  })

  it('opens an account for editing by its name and saves the change', async () => {
    const { store, w } = await mountView()
    await store.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
    await w.vm.$nextTick()
    await w.find('li button.font-bold').trigger('click')
    expect(w.find('form').exists()).toBe(true)

    await w.find('form input[required]').setValue('Beta')
    await w.find('form').trigger('submit')
    await vi.waitFor(() => expect(w.find('form').exists()).toBe(false))
    expect(store.accounts[0]!.name).toBe('Beta')
  })

  it('leaves the account untouched when editing is cancelled', async () => {
    const { store, w } = await mountView()
    await store.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
    await w.vm.$nextTick()
    await w.find('li button.font-bold').trigger('click')
    await w.find('form input[required]').setValue('Beta')
    await w.find('form button.btn-ghost').trigger('click')
    await w.vm.$nextTick()

    expect(store.accounts[0]!.name).toBe('Alpha')
    expect(w.find('form').exists()).toBe(false)
  })

  it('asks before deleting and only then removes the account', async () => {
    const { store, w } = await mountView()
    await store.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
    await w.vm.$nextTick()

    await w.findAll('li button').find((b) => b.classes().includes('btn-danger'))!.trigger('click')
    await w.vm.$nextTick()
    expect(w.text()).toContain('Alpha')
    expect(store.accounts).toHaveLength(1)

    await w.find('li button.btn-secondary').trigger('click')
    await w.vm.$nextTick()
    expect(store.accounts).toHaveLength(1)

    await w.findAll('li button').find((b) => b.classes().includes('btn-danger'))!.trigger('click')
    await w.vm.$nextTick()
    await w.find('li button.btn-danger-solid').trigger('click')
    await w.vm.$nextTick()
    expect(store.accounts).toHaveLength(0)
  })

  it('moves accounts and disables the arrow at either end', async () => {
    const { store, w } = await mountView()
    await store.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
    await store.addAccount({ name: 'Beta', color: '#111', token: 'sk-ant-oat01-b' })
    await w.vm.$nextTick()

    const ups = () => w.findAll('li').map((li) => li.findAll('button.btn-icon')[0]!)
    expect(ups()[0]!.attributes('disabled')).toBeDefined()
    expect(ups()[1]!.attributes('disabled')).toBeUndefined()

    await ups()[1]!.trigger('click')
    await w.vm.$nextTick()
    expect(store.accounts.map((a) => a.name)).toEqual(['Beta', 'Alpha'])
  })

  it('shows only the beginning of a token', async () => {
    const { store, w } = await mountView()
    await store.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-secret-tail' })
    await w.vm.$nextTick()
    expect(w.text()).toContain('sk-ant-oat01-s…')
    expect(w.text()).not.toContain('secret-tail')
  })
})
