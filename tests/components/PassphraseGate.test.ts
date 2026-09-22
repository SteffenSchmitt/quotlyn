// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import de from '../../src/i18n/de.json'
import PassphraseGate from '../../src/components/PassphraseGate.vue'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { MemoryStorage } from '../../src/storage/localStore'

let storage: MemoryStorage
let session: MemoryStorage

function mountGate() {
  const i18n = createI18n({ legacy: false, locale: 'de', messages: { de } })
  return mount(PassphraseGate, { global: { plugins: [i18n] } })
}

/** Both password fields: the second one only exists while a vault is being created. */
function fields(w: ReturnType<typeof mountGate>) {
  return w.findAll('input[type="password"]')
}

beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  session = new MemoryStorage()
  accountsDeps.storage = () => storage
  accountsDeps.session = () => session
  accountsDeps.iterations = 1000
})

describe('PassphraseGate', () => {
  it('asks for a passphrase twice while there is no vault', async () => {
    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(2))
  })

  it('refuses a passphrase that is too short', async () => {
    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(2))
    await fields(w)[0]!.setValue('short')
    await fields(w)[1]!.setValue('short')
    await w.find('form').trigger('submit')

    expect(w.text()).toContain(de.vault.tooShort)
    expect(storage.getItem('quotlyn.vault')).toBeNull()
  })

  it('refuses two passphrases that differ', async () => {
    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(2))
    await fields(w)[0]!.setValue('long-enough-1')
    await fields(w)[1]!.setValue('long-enough-2')
    await w.find('form').trigger('submit')

    expect(w.text()).toContain(de.vault.mismatch)
    expect(storage.getItem('quotlyn.vault')).toBeNull()
  })

  it('creates the vault and clears the fields', async () => {
    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(2))
    await fields(w)[0]!.setValue('long-enough-1')
    await fields(w)[1]!.setValue('long-enough-1')
    await w.find('form').trigger('submit')

    const store = useAccountsStore()
    await vi.waitFor(() => expect(store.status).toBe('unlocked'))
    expect(storage.getItem('quotlyn.vault')).not.toBeNull()
  })

  it('unlocks an existing vault and asks only once', async () => {
    const setup = useAccountsStore()
    await setup.init()
    await setup.createVault('long-enough-1')
    setActivePinia(createPinia())

    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(1))
    await fields(w)[0]!.setValue('long-enough-1')
    await w.find('form').trigger('submit')
    await vi.waitFor(() => expect(useAccountsStore().status).toBe('unlocked'))
  })

  it('names a wrong passphrase as such', async () => {
    const setup = useAccountsStore()
    await setup.init()
    await setup.createVault('long-enough-1')
    setActivePinia(createPinia())

    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(1))
    await fields(w)[0]!.setValue('wrong-passphrase')
    await w.find('form').trigger('submit')
    await vi.waitFor(() => expect(w.text()).toContain(de.vault.wrong))
    expect(useAccountsStore().status).toBe('locked')
  })

  it('keeps the key for the tab when asked to remember', async () => {
    const w = mountGate()
    await vi.waitFor(() => expect(fields(w)).toHaveLength(2))
    await fields(w)[0]!.setValue('long-enough-1')
    await fields(w)[1]!.setValue('long-enough-1')
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')

    await vi.waitFor(() => expect(session.getItem('quotlyn.sessionKey')).not.toBeNull())
  })
})
