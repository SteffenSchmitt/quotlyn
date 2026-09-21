import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { accountsDeps, useAccountsStore } from '../../src/stores/accounts'
import { MemoryStorage, VAULT_KEY, SESSION_KEY_KEY } from '../../src/storage/localStore'
import { VaultError, sealVault } from '../../src/crypto/vault'

let storage: MemoryStorage
let session: MemoryStorage

beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  session = new MemoryStorage()
  accountsDeps.storage = () => storage
  accountsDeps.session = () => session
  accountsDeps.iterations = 1000
})

describe('vault lifecycle', () => {
  it('starts with no_vault when storage is empty', async () => {
    const store = useAccountsStore()
    await store.init()
    expect(store.status).toBe('no_vault')
  })

  it('creates a vault and is unlocked afterwards', async () => {
    const store = useAccountsStore()
    await store.init()
    await store.createVault('pass')
    expect(store.status).toBe('unlocked')
    expect(storage.getItem(VAULT_KEY)).not.toBeNull()
    expect(storage.getItem(VAULT_KEY)).not.toContain('pass')
  })

  it('is locked after reload and unlocks with the right passphrase', async () => {
    const a = useAccountsStore()
    await a.init()
    await a.createVault('pass')
    await a.addAccount({ name: 'Alpha', color: '#ff0000', token: 'sk-ant-oat-test-1' })

    setActivePinia(createPinia())
    const b = useAccountsStore()
    await b.init()
    expect(b.status).toBe('locked')
    await expect(b.unlock('nope')).rejects.toBeInstanceOf(VaultError)
    await b.unlock('pass')
    expect(b.status).toBe('unlocked')
    expect(b.accounts.map((x) => x.name)).toEqual(['Alpha'])
  })

  it('lock clears accounts from memory', async () => {
    const store = useAccountsStore()
    await store.init()
    await store.createVault('pass')
    await store.addAccount({ name: 'A', color: '#000', token: 'sk-ant-oat-test' })
    store.lock()
    expect(store.status).toBe('locked')
    expect(store.accounts).toEqual([])
  })
})

describe('accounts CRUD', () => {
  async function unlocked() {
    const store = useAccountsStore()
    await store.init()
    await store.createVault('pass')
    return store
  }

  it('adds accounts with id and increasing order', async () => {
    const store = await unlocked()
    const a = await store.addAccount({ name: 'A', color: '#000', token: 'sk-ant-oat-a' })
    const b = await store.addAccount({ name: 'B', color: '#111', token: 'sk-ant-oat-b' })
    expect(a.id).not.toBe(b.id)
    expect(store.accounts.map((x) => x.order)).toEqual([0, 1])
    expect(a.notificationsEnabled).toBe(true)
  })

  it('honours notificationsEnabled on add', async () => {
    const store = await unlocked()
    const a = await store.addAccount({ name: 'A', color: '#000', token: 't', notificationsEnabled: false })
    expect(a.notificationsEnabled).toBe(false)
  })

  it('persists every change encrypted', async () => {
    const store = await unlocked()
    await store.addAccount({ name: 'A', color: '#000', token: 'sk-ant-oat-secret' })
    const raw = storage.getItem(VAULT_KEY)!
    expect(raw).not.toContain('sk-ant-oat-secret')
    expect(raw).not.toContain('"A"')
  })

  it('updates, removes and reorders', async () => {
    const store = await unlocked()
    const a = await store.addAccount({ name: 'A', color: '#000', token: 't1' })
    const b = await store.addAccount({ name: 'B', color: '#111', token: 't2' })
    const c = await store.addAccount({ name: 'C', color: '#222', token: 't3' })
    await store.updateAccount(b.id, { name: 'Bee', notificationsEnabled: false })
    expect(store.accounts[1]).toMatchObject({ name: 'Bee', notificationsEnabled: false, token: 't2' })
    await store.moveAccount(c.id, -1)
    expect(store.accounts.map((x) => x.name)).toEqual(['A', 'C', 'Bee'])
    await store.moveAccount(a.id, -1)
    expect(store.accounts.map((x) => x.name)).toEqual(['A', 'C', 'Bee'])
    await store.removeAccount(a.id)
    expect(store.accounts.map((x) => x.name)).toEqual(['C', 'Bee'])
    expect(store.accounts.map((x) => x.order)).toEqual([0, 1])
  })
})

describe('remember session', () => {
  it('stores the key in session storage and restores without passphrase', async () => {
    const a = useAccountsStore()
    await a.init()
    await a.createVault('pass')
    await a.addAccount({ name: 'A', color: '#000', token: 't' })
    await a.setRememberSession(true)
    expect(session.getItem(SESSION_KEY_KEY)).not.toBeNull()

    setActivePinia(createPinia())
    const b = useAccountsStore()
    await b.init()
    expect(b.status).toBe('unlocked')
    expect(b.accounts).toHaveLength(1)
    expect(b.rememberSession).toBe(true)
  })

  it('turning it off removes the session key', async () => {
    const store = useAccountsStore()
    await store.init()
    await store.createVault('pass')
    await store.setRememberSession(true)
    await store.setRememberSession(false)
    expect(session.getItem(SESSION_KEY_KEY)).toBeNull()
  })

  it('lock always clears the session key', async () => {
    const store = useAccountsStore()
    await store.init()
    await store.createVault('pass')
    await store.setRememberSession(true)
    store.lock()
    expect(session.getItem(SESSION_KEY_KEY)).toBeNull()
  })
})

describe('importVault', () => {
  async function unlockedWith(names: string[]) {
    const store = useAccountsStore()
    await store.init()
    await store.createVault('pass')
    for (const n of names) await store.addAccount({ name: n, color: '#000', token: `t-${n}` })
    return store
  }

  it('merges by id, imported wins, and renumbers', async () => {
    const store = await unlockedWith(['A', 'B'])
    const existing = store.accounts[0]!
    const blob = await sealVault(
      'other',
      { accounts: [{ ...existing, name: 'A2', token: 't-A2', order: 5 }, { id: 'new', name: 'C', color: '#111', token: 't-C', notificationsEnabled: true, order: 9 }] },
      { iterations: 1000 },
    )
    const result = await store.importVault(blob, 'other', 'merge')
    expect(result).toEqual({ imported: 2, total: 3 })
    expect(store.accounts.map((a) => a.name)).toEqual(['A2', 'B', 'C'])
    expect(store.accounts.map((a) => a.order)).toEqual([0, 1, 2])
    expect(store.accounts[0]!.token).toBe('t-A2')
  })

  it('replaces everything in replace mode', async () => {
    const store = await unlockedWith(['A'])
    const blob = await sealVault('other', { accounts: [{ id: 'x', name: 'X', color: '#111', token: 't', notificationsEnabled: false, order: 0 }] }, { iterations: 1000 })
    await store.importVault(blob, 'other', 'replace')
    expect(store.accounts.map((a) => a.name)).toEqual(['X'])
  })

  it('rejects wrong passphrase and malformed data without changing anything', async () => {
    const store = await unlockedWith(['A'])
    const blob = await sealVault('other', { accounts: [] }, { iterations: 1000 })
    await expect(store.importVault(blob, 'wrong', 'merge')).rejects.toBeInstanceOf(VaultError)
    await expect(store.importVault({ nope: 1 }, 'other', 'merge')).rejects.toBeInstanceOf(VaultError)
    const junk = await sealVault('other', { accounts: 'nope' }, { iterations: 1000 })
    await expect(store.importVault(junk, 'other', 'merge')).rejects.toThrow('invalid_vault_data')
    expect(store.accounts.map((a) => a.name)).toEqual(['A'])
  })

  it('persists the imported set under the current passphrase', async () => {
    const store = await unlockedWith([])
    const blob = await sealVault('other', { accounts: [{ id: 'x', name: 'X', color: '#111', token: 't', notificationsEnabled: true, order: 0 }] }, { iterations: 1000 })
    await store.importVault(blob, 'other', 'merge')
    setActivePinia(createPinia())
    const again = useAccountsStore()
    await again.init()
    await again.unlock('pass')
    expect(again.accounts.map((a) => a.name)).toEqual(['X'])
  })
})
