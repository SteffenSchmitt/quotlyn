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
import type { PrimaryWindow } from '../lib/usageView'
import { DEFAULT_BILLING_VISIBILITY, type BillingVisibility } from '../lib/accountMeta'

export interface Account {
  id: string
  name: string
  color: string
  token: string
  notificationsEnabled: boolean
  primaryWindow: PrimaryWindow
  order: number
  /** Who the usage is billed to; shown on the cards and in the tooltips. '' when unset. */
  billingAccount: string
  billingVisibility: BillingVisibility
  /** Who or what works on this account, one per line. '' when unset. */
  usedBy: string
}

export type NewAccount = Pick<Account, 'name' | 'color' | 'token'> & {
  notificationsEnabled?: boolean
  primaryWindow?: PrimaryWindow
  billingAccount?: string
  billingVisibility?: BillingVisibility
  usedBy?: string
}
export type AccountPatch = Partial<
  Pick<
    Account,
    'name' | 'color' | 'token' | 'notificationsEnabled' | 'primaryWindow' | 'billingAccount' | 'billingVisibility' | 'usedBy'
  >
>

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

  function normalize(a: Account): Account {
    return {
      ...a,
      notificationsEnabled: a.notificationsEnabled ?? true,
      primaryWindow: a.primaryWindow ?? 'critical',
      billingAccount: a.billingAccount ?? '',
      billingVisibility: a.billingVisibility ?? DEFAULT_BILLING_VISIBILITY,
      usedBy: a.usedBy ?? '',
    }
  }

  function applyData(data: unknown) {
    const parsed = (data as Partial<VaultData>) ?? {}
    list.value = Array.isArray(parsed.accounts) ? parsed.accounts.map(normalize) : []
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
      primaryWindow: input.primaryWindow ?? 'critical',
      order: list.value.length,
      billingAccount: input.billingAccount ?? '',
      billingVisibility: input.billingVisibility ?? DEFAULT_BILLING_VISIBILITY,
      usedBy: input.usedBy ?? '',
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

  function isAccount(x: unknown): x is Account {
    const a = x as Partial<Account> | null
    return (
      !!a &&
      typeof a.id === 'string' &&
      typeof a.name === 'string' &&
      typeof a.color === 'string' &&
      typeof a.token === 'string'
    )
  }

  async function importVault(
    blob: unknown,
    passphrase: string,
    mode: 'merge' | 'replace',
  ): Promise<{ imported: number; total: number }> {
    if (!key || !salt) throw new Error('vault_locked')
    const opened = await openVault(passphrase, blob as VaultBlob)
    const data = opened.data as Partial<VaultData> | null
    if (!data || !Array.isArray(data.accounts) || !data.accounts.every(isAccount)) {
      throw new Error('invalid_vault_data')
    }
    const imported: Account[] = data.accounts.map(normalize)
    let merged: Account[]
    if (mode === 'replace') {
      merged = [...imported].sort((a, b) => a.order - b.order)
    } else {
      const byId = new Map(accounts.value.map((a) => [a.id, a]))
      const seen = new Set<string>()
      merged = accounts.value.map((a) => {
        const inc = imported.find((i) => i.id === a.id)
        if (inc) seen.add(inc.id)
        return inc ? { ...inc, order: a.order } : a
      })
      for (const inc of imported) if (!seen.has(inc.id) && !byId.has(inc.id)) merged.push(inc)
    }
    renumber(merged)
    await persist()
    return { imported: imported.length, total: list.value.length }
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
    importVault,
  }
})
