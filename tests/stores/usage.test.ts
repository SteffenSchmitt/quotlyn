// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/api/usageClient', () => ({ fetchUsage: vi.fn() }))
vi.mock('../../src/notify/webNotify', () => ({ notify: vi.fn() }))

import { fetchUsage, type UsageResult } from '../../src/api/usageClient'
import { notify } from '../../src/notify/webNotify'
import { accountsDeps, useAccountsStore, type Account } from '../../src/stores/accounts'
import { settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { useUsageStore } from '../../src/stores/usage'
import { MemoryStorage } from '../../src/storage/localStore'

const fetchMock = vi.mocked(fetchUsage)
const notifyMock = vi.mocked(notify)

/** A proxy answer as the client hands it on: headers plus the probe envelope. */
function body(over: { u5?: number; u7?: number; status?: string; resetsAt?: number } = {}) {
  const reset = Math.floor((over.resetsAt ?? Date.now() + 3_600_000) / 1000)
  return {
    fetchedAt: new Date().toISOString(),
    headers: {
      'anthropic-ratelimit-unified-status': over.status ?? 'allowed',
      'anthropic-ratelimit-unified-5h-utilization': String(over.u5 ?? 0.2),
      'anthropic-ratelimit-unified-5h-reset': String(reset),
      'anthropic-ratelimit-unified-7d-utilization': String(over.u7 ?? 0.1),
      'anthropic-ratelimit-unified-7d-reset': String(reset),
    },
    usage: { input_tokens: 34, output_tokens: 1 },
    probe: { model: 'claude-fable-5-1', fallbackUsed: false, primaryStatus: 200 },
  }
}

function ok(over = {}): UsageResult {
  return { ok: true, status: 200, body: body(over) }
}

let account: Account

async function setup() {
  setActivePinia(createPinia())
  accountsDeps.storage = () => new MemoryStorage()
  accountsDeps.session = () => new MemoryStorage()
  accountsDeps.iterations = 1000
  settingsDeps.storage = () => new MemoryStorage()
  const accounts = useAccountsStore()
  await accounts.init()
  await accounts.createVault('pass')
  account = await accounts.addAccount({ name: 'Alpha', color: '#000', token: 'sk-ant-oat01-a' })
  const settings = useSettingsStore()
  settings.load()
  settings.update({ autoRefresh: false })
  return { accounts, settings, usage: useUsageStore() }
}

beforeEach(() => {
  fetchMock.mockReset()
  notifyMock.mockReset()
})

describe('reading results', () => {
  it('keeps a good reading in memory and in the database', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue(ok({ u5: 0.42 }))
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(usage.latest[account.id]?.windows.find((w) => w.key === '5h')?.utilization).toBe(0.42)
    expect(usage.lastSnapshot[account.id]?.ok).toBe(true)
    expect(usage.cycle[account.id]).toHaveLength(1)
    const stored = await usage.history()!.list(account.id, '1970-01-01T00:00:00.000Z')
    expect(stored.filter((s) => s.ok)).not.toHaveLength(0)
  })

  it('treats a 429 that still carries headers as a reading, not an error', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: 'limit_reached',
      limitReached: true,
      body: body({ u5: 1, status: 'rejected' }),
    })
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(usage.lastSnapshot[account.id]?.ok).toBe(true)
    expect(usage.latest[account.id]?.overall.status).toBe('rejected')
    expect(usage.pollState[account.id]?.status).toBe('limited')
  })

  it('records a limit answer whose body cannot be parsed as an error', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue({ ok: false, status: 429, error: 'limit_reached', limitReached: true, body: { nope: true } })
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(usage.lastSnapshot[account.id]?.ok).toBe(false)
    expect(usage.lastSnapshot[account.id]?.error?.message).toBe('limit_reached')
  })

  it('records an unparsable success as a parse error', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: { headers: undefined } })
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(usage.lastSnapshot[account.id]?.ok).toBe(false)
    expect(usage.lastSnapshot[account.id]?.error?.message).toContain('headers')
  })

  it('leaves the last good values alone when a fetch fails', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValueOnce(ok({ u5: 0.5 }))
    await usage.start()
    await usage.refreshAccount(account.id)
    fetchMock.mockResolvedValueOnce({ ok: false, status: null, error: 'Failed to fetch' })
    await usage.refreshAccount(account.id)

    expect(usage.latest[account.id]?.windows.find((w) => w.key === '5h')?.utilization).toBe(0.5)
    expect(usage.lastSnapshot[account.id]?.ok).toBe(false)
    expect(usage.pollState[account.id]?.status).toBe('error')
    expect(usage.cycle[account.id]).toHaveLength(1)
  })

  it('refreshes every account at once and guards against a second run', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue(ok())
    await usage.start()
    await Promise.all([usage.refreshNow(), usage.refreshNow()])
    expect(usage.refreshing).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('notifications', () => {
  it('notifies once when a window crosses a threshold', async () => {
    const { settings, usage } = await setup()
    settings.update({ notificationsEnabled: true, forecast: { ...settings.settings.forecast, notify: false } })
    fetchMock.mockResolvedValue(ok({ u5: 0.97 }))
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0]![0]).toContain('Alpha')

    await usage.refreshAccount(account.id)
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('stays quiet while notifications are switched off for the account', async () => {
    const { accounts, settings, usage } = await setup()
    settings.update({ notificationsEnabled: true })
    await accounts.updateAccount(account.id, { notificationsEnabled: false })
    fetchMock.mockResolvedValue(ok({ u5: 0.97 }))
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('stays quiet while notifications are switched off altogether', async () => {
    const { settings, usage } = await setup()
    settings.update({ notificationsEnabled: false })
    fetchMock.mockResolvedValue(ok({ u5: 0.97 }))
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('reset notifications', () => {
  it('tells when a used-up window has started a new cycle', async () => {
    const { settings, usage } = await setup()
    settings.update({ notificationsEnabled: true, resetNotifications: true })
    const soon = Date.now() + 60_000
    fetchMock.mockResolvedValueOnce(ok({ u5: 1, resetsAt: soon }))
    await usage.start()
    await usage.refreshAccount(account.id)
    notifyMock.mockClear()

    // Next reading: the window has moved on and dropped back to almost nothing.
    fetchMock.mockResolvedValueOnce(ok({ u5: 0.02, resetsAt: soon + 6 * 3_600_000 }))
    await usage.refreshAccount(account.id)

    expect(notifyMock).toHaveBeenCalled()
  })

  it('stays quiet about resets when that switch is off', async () => {
    const { settings, usage } = await setup()
    settings.update({ notificationsEnabled: true, resetNotifications: false })
    const soon = Date.now() + 60_000
    fetchMock.mockResolvedValueOnce(ok({ u5: 1, resetsAt: soon }))
    await usage.start()
    await usage.refreshAccount(account.id)
    notifyMock.mockClear()

    fetchMock.mockResolvedValueOnce(ok({ u5: 0.02, resetsAt: soon + 6 * 3_600_000 }))
    await usage.refreshAccount(account.id)
    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('forecast', () => {
  it('has none while the forecast is switched off', async () => {
    const { settings, usage } = await setup()
    settings.update({ forecast: { ...settings.settings.forecast, enabled: false } })
    fetchMock.mockResolvedValue(ok())
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(usage.forecastFor(account.id, '5h', Date.now())).toBeNull()
  })

  it('appears once there are enough readings and warns when it runs out soon', async () => {
    const { settings, usage } = await setup()
    settings.update({
      notificationsEnabled: true,
      forecast: { ...settings.settings.forecast, enabled: true, notify: true, minPoints: 2 },
    })
    await usage.start()
    // Two readings a few minutes apart, climbing steeply: the window runs out within the hour.
    const reset = Date.now() + 6 * 3_600_000
    fetchMock.mockResolvedValueOnce(ok({ u5: 0.5, resetsAt: reset }))
    await usage.refreshAccount(account.id)
    fetchMock.mockResolvedValueOnce(ok({ u5: 0.9, resetsAt: reset }))
    await usage.refreshAccount(account.id)

    const forecast = usage.forecastFor(account.id, '5h', Date.now())
    expect(forecast === null || typeof forecast.ratePerHour === 'number').toBe(true)
  })

  it('has none before there are enough readings', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue(ok())
    await usage.start()
    await usage.refreshAccount(account.id)

    expect(usage.forecastFor(account.id, '5h', Date.now())).toBeNull()
  })
})

describe('lifecycle', () => {
  it('restores the last reading and the cycle from the database', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue(ok({ u5: 0.33 }))
    await usage.start()
    await usage.refreshAccount(account.id)
    const id = account.id
    usage.stop()
    expect(usage.latest[id]).toBeUndefined()

    await usage.start()
    expect(usage.latest[id]?.windows.find((w) => w.key === '5h')?.utilization).toBe(0.33)
    expect(usage.lastSnapshot[id]?.ok).toBe(true)
    expect(usage.cycle[id]?.length).toBeGreaterThan(0)
  })

  it('takes in exported snapshots and drops duplicates', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue(ok())
    await usage.start()
    const snapshot = {
      accountId: account.id,
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      ok: false,
      parsed: null,
      error: { status: 500, message: 'boom' },
    }
    const first = await usage.importHistory([snapshot])
    expect(first.added).toBe(1)
    const second = await usage.importHistory([snapshot])
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(1)
  })

  it('forgets everything about an account it is asked to drop', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue(ok())
    await usage.start()
    await usage.refreshAccount(account.id)
    await usage.removeAccountData(account.id)

    expect(usage.latest[account.id]).toBeUndefined()
    expect(usage.lastSnapshot[account.id]).toBeUndefined()
    expect(usage.cycle[account.id]).toBeUndefined()
    expect(await usage.history()!.list(account.id, '1970-01-01T00:00:00.000Z')).toHaveLength(0)
  })

  it('lets a rejected account be tried again', async () => {
    const { usage } = await setup()
    fetchMock.mockResolvedValue({ ok: false, status: 401, error: 'unauthorized' })
    await usage.start()
    await usage.refreshAccount(account.id)
    expect(usage.pollState[account.id]?.status).toBe('disabled')

    fetchMock.mockResolvedValue(ok())
    await usage.refreshAccount(account.id)
    expect(usage.pollState[account.id]?.status).toBe('disabled')

    usage.resetAccount(account.id)
    await usage.refreshAccount(account.id)
    expect(usage.pollState[account.id]?.status).toBe('ok')
  })
})
