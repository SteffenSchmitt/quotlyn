import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  DEFAULT_ITERATIONS,
  exportKey,
  fromBase64,
  importKey,
  openVault,
  openWithKey,
  sealVault,
  sealWithKey,
  type VaultBlob,
} from '../crypto/vault'
import { SESSION_KEY_KEY, VAULT_KEY, readJson, remove, writeJson } from '../storage/localStore'

export interface Account {
  id: string
  name: string
  color: string
  token: string
  notificationsEnabled: boolean
  order: number
}

export type NewAccount = Pick<Account, 'name' | 'color' | 'token'> & { notificationsEnabled?: boolean }
export type AccountPatch = Partial<Pick<Account, 'name' | 'color' | 'token' | 'notificationsEnabled'>>

interface VaultData {
  accounts: Account[]
}

export const accountsDeps = {
  storage: (): Storage => localStorage,
  session: (): Storage => sessionStorage,
  iterations: DEFAULT_ITERATIONS,
}

export const useAccountsStore = defineStore('accounts', () => {
  const list = ref<Account[]>([])
  const status = ref<'no_vault' | 'locked' | 'unlocked'>('no_vault')
  const rememberSession = ref(false)

  let key: CryptoKey | null = null
  let salt: Uint8Array | null = null
  let iterations = accountsDeps.iterations

  const accounts = computed(() => [...list.value].sort((a, b) => a.order - b.order))

  function loadBlob(): VaultBlob | null {
    return readJson<VaultBlob>(accountsDeps.storage(), VAULT_KEY)
  }

  function applyData(data: unknown) {
    const parsed = (data as Partial<VaultData>) ?? {}
    list.value = Array.isArray(parsed.accounts) ? parsed.accounts : []
  }

  async function persist() {
    if (!key || !salt) throw new Error('vault_locked')
    const blob = await sealWithKey(key, salt, iterations, { accounts: list.value } satisfies VaultData)
    writeJson(accountsDeps.storage(), VAULT_KEY, blob)
  }

  async function init() {
    const blob = loadBlob()
    if (!blob) {
      status.value = 'no_vault'
      return
    }
    status.value = 'locked'
    const raw = accountsDeps.session().getItem(SESSION_KEY_KEY)
    if (!raw) return
    try {
      const restored = await importKey(raw)
      applyData(await openWithKey(restored, blob))
      key = restored
      salt = fromBase64(blob.salt)
      iterations = blob.iterations
      rememberSession.value = true
      status.value = 'unlocked'
    } catch {
      remove(accountsDeps.session(), SESSION_KEY_KEY)
    }
  }

  async function createVault(passphrase: string) {
    iterations = accountsDeps.iterations
    const blob = await sealVault(passphrase, { accounts: [] } satisfies VaultData, { iterations })
    writeJson(accountsDeps.storage(), VAULT_KEY, blob)
    const opened = await openVault(passphrase, blob)
    key = opened.key
    salt = fromBase64(blob.salt)
    list.value = []
    status.value = 'unlocked'
  }

  async function unlock(passphrase: string) {
    const blob = loadBlob()
    if (!blob) throw new Error('no_vault')
    const opened = await openVault(passphrase, blob)
    key = opened.key
    salt = fromBase64(blob.salt)
    iterations = blob.iterations
    applyData(opened.data)
    status.value = 'unlocked'
  }

  function lock() {
    key = null
    salt = null
    list.value = []
    rememberSession.value = false
    remove(accountsDeps.session(), SESSION_KEY_KEY)
    status.value = loadBlob() ? 'locked' : 'no_vault'
  }

  async function setRememberSession(on: boolean) {
    rememberSession.value = on
    if (on && key) {
      accountsDeps.session().setItem(SESSION_KEY_KEY, await exportKey(key))
    } else {
      remove(accountsDeps.session(), SESSION_KEY_KEY)
    }
  }

  async function addAccount(input: NewAccount): Promise<Account> {
    const account: Account = {
      id: globalThis.crypto.randomUUID(),
      name: input.name,
      color: input.color,
      token: input.token,
      notificationsEnabled: input.notificationsEnabled ?? true,
      order: list.value.length,
    }
    list.value = [...list.value, account]
    await persist()
    return account
  }

  async function updateAccount(id: string, patch: AccountPatch) {
    list.value = list.value.map((a) => (a.id === id ? { ...a, ...patch } : a))
    await persist()
  }

  function renumber(sorted: Account[]) {
    list.value = sorted.map((a, i) => ({ ...a, order: i }))
  }

  async function removeAccount(id: string) {
    renumber(accounts.value.filter((a) => a.id !== id))
    await persist()
  }

  async function moveAccount(id: string, direction: -1 | 1) {
    const sorted = [...accounts.value]
    const from = sorted.findIndex((a) => a.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= sorted.length) return
    const [item] = sorted.splice(from, 1)
    sorted.splice(to, 0, item!)
    renumber(sorted)
    await persist()
  }

  return {
    accounts,
    status,
    rememberSession,
    init,
    createVault,
    unlock,
    lock,
    setRememberSession,
    addAccount,
    updateAccount,
    removeAccount,
    moveAccount,
  }
})
