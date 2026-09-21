import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { fetchUsage, type UsageResult } from '../api/usageClient'
import { parseUsage, type ParsedUsage } from '../api/usageParser'
import { Poller, type AccountPollState, type PollTarget } from '../scheduler/poller'
import { HistoryDb, type UsageSnapshot } from '../storage/historyDb'
import { ThresholdWatcher } from '../notify/thresholds'
import { notify } from '../notify/webNotify'
import { crossingNotification } from '../notify/notifyText'
import { i18n } from '../i18n'
import { windowOneLine } from '../lib/windowLabels'
import { forecastWindow, type Forecast } from '../lib/forecast'
import { ForecastWatcher } from '../notify/forecastAlerts'
import { forecastLine } from '../lib/forecastText'
import { useAccountsStore } from './accounts'
import { useSettingsStore } from './settings'

const DAY_MS = 24 * 60 * 60 * 1000
/** How much history the forecast keeps in memory: the longest window is seven days. */
const CYCLE_MS = 7 * DAY_MS

export const useUsageStore = defineStore('usage', () => {
  const accounts = useAccountsStore()
  const settingsStore = useSettingsStore()

  const latest = reactive<Record<string, ParsedUsage | undefined>>({})
  const pollState = reactive<Record<string, AccountPollState | undefined>>({})
  const lastSnapshot = reactive<Record<string, UsageSnapshot | undefined>>({})
  /** OK snapshots of the last seven days per account, ascending, for the forecast. */
  const cycle = reactive<Record<string, UsageSnapshot[] | undefined>>({})
  const refreshing = ref(false)

  let db: HistoryDb | null = null
  let poller: Poller | null = null
  let pruneTimer: ReturnType<typeof setInterval> | null = null
  const watcher = new ThresholdWatcher()
  const forecastWatcher = new ForecastWatcher()
  const FORECAST_HORIZON_MS = 3_600_000

  function targets(): PollTarget[] {
    return accounts.accounts.map((a) => ({ id: a.id, token: a.token }))
  }

  async function onResult(target: PollTarget, result: UsageResult) {
    const fetchedAt = new Date().toISOString()
    let snapshot: Omit<UsageSnapshot, 'id'>
    if (result.ok) {
      try {
        const parsed = parseUsage(result.body)
        latest[target.id] = parsed
        notifyCrossings(target.id, parsed)
        snapshot = { accountId: target.id, fetchedAt: parsed.fetchedAt, ok: true, parsed, error: null }
      } catch (err) {
        snapshot = {
          accountId: target.id,
          fetchedAt,
          ok: false,
          parsed: null,
          error: { status: result.status, message: err instanceof Error ? err.message : 'parse_error' },
        }
      }
    } else if (result.limitReached && result.body) {
      let parsed: ParsedUsage | null = null
      try {
        parsed = parseUsage(result.body)
        latest[target.id] = parsed
        notifyCrossings(target.id, parsed)
      } catch {
        parsed = null
      }
      snapshot = {
        accountId: target.id,
        fetchedAt: parsed?.fetchedAt ?? fetchedAt,
        ok: parsed !== null,
        parsed,
        error: parsed ? null : { status: result.status, message: result.error },
      }
    } else {
      snapshot = {
        accountId: target.id,
        fetchedAt,
        ok: false,
        parsed: null,
        error: { status: result.status, message: result.error },
      }
    }
    lastSnapshot[target.id] = snapshot
    if (snapshot.ok) {
      remember(target.id, snapshot)
      notifyForecasts(target.id)
    }
    if (db) await db.add(snapshot)
  }

  function notifyForecasts(accountId: string) {
    const account = accounts.accounts.find((a) => a.id === accountId)
    const opts = settingsStore.settings.forecast
    if (!account || !opts.enabled || !opts.notify) return
    const now = Date.now()
    const forecasts = (latest[accountId]?.windows ?? []).map((w) => forecastFor(accountId, w.key, now))
    const due = forecastWatcher.evaluate(accountId, forecasts, now, FORECAST_HORIZON_MS)
    if (!settingsStore.settings.notificationsEnabled || !account.notificationsEnabled) return
    const { t, te } = i18n.global
    for (const f of due) {
      const window = windowOneLine((k) => t(k), te, f.windowKey)
      const line = forecastLine(f, now, (key, params) => t(key, params ?? {}))
      notify(t('notify.forecastTitle', { account: account.name }), `${window}: ${line}`)
    }
  }

  function remember(accountId: string, snapshot: Omit<UsageSnapshot, 'id'>) {
    const cutoff = new Date(Date.now() - CYCLE_MS).toISOString()
    const kept = (cycle[accountId] ?? []).filter((s) => s.fetchedAt >= cutoff)
    kept.push(snapshot)
    cycle[accountId] = kept
  }

  /** Forecast for one window of an account, or null when disabled or not enough data. */
  function forecastFor(accountId: string, windowKey: string, nowMs: number): Forecast | null {
    const opts = settingsStore.settings.forecast
    if (!opts.enabled) return null
    return forecastWindow(cycle[accountId] ?? [], windowKey, opts, nowMs)
  }

  function notifyCrossings(accountId: string, parsed: ParsedUsage) {
    const account = accounts.accounts.find((a) => a.id === accountId)
    const crossings = watcher.evaluate(accountId, parsed.windows, settingsStore.settings.thresholds)
    if (!account || !settingsStore.settings.notificationsEnabled || !account.notificationsEnabled) return
    const { t, te } = i18n.global
    const now = Date.now()
    for (const c of crossings) {
      const text = crossingNotification(
        c,
        account.name,
        settingsStore.settings.thresholds,
        now,
        (key, params) => t(key, params ?? {}),
        (key) => windowOneLine((k) => t(k), te, key),
      )
      notify(text.title, text.body)
    }
  }

  function ensurePoller(): Poller {
    if (poller) return poller
    poller = new Poller({
      intervalMs: settingsStore.settings.intervalSeconds * 1000,
      targets,
      fetch: (t) => fetchUsage(t.token),
      onResult: (t, r) => void onResult(t, r),
      onStateChange: (id, s) => {
        pollState[id] = s
      },
    })
    return poller
  }

  async function prune() {
    if (!db) return
    const cutoff = new Date(Date.now() - settingsStore.settings.retentionDays * DAY_MS).toISOString()
    await db.pruneOlderThan(cutoff)
  }

  async function start() {
    if (!db) db = await HistoryDb.open()
    for (const a of accounts.accounts) {
      const snap = await db.latestOk(a.id)
      if (snap?.parsed) latest[a.id] = snap.parsed
      const last = await db.latest(a.id)
      if (last) lastSnapshot[a.id] = last
      const since = new Date(Date.now() - CYCLE_MS).toISOString()
      cycle[a.id] = (await db.list(a.id, since)).filter((s) => s.ok)
    }
    await prune()
    if (pruneTimer) clearInterval(pruneTimer)
    pruneTimer = setInterval(() => void prune(), DAY_MS)
    const p = ensurePoller()
    p.setIntervalMs(settingsStore.settings.intervalSeconds * 1000)
    if (settingsStore.settings.autoRefresh) p.start()
  }

  function stop() {
    poller?.stop()
    if (pruneTimer) clearInterval(pruneTimer)
    pruneTimer = null
    for (const k of Object.keys(latest)) delete latest[k]
    for (const k of Object.keys(pollState)) delete pollState[k]
    for (const k of Object.keys(lastSnapshot)) delete lastSnapshot[k]
    for (const k of Object.keys(cycle)) delete cycle[k]
  }

  async function refreshNow() {
    if (refreshing.value) return
    refreshing.value = true
    try {
      await ensurePoller().refreshAll()
    } finally {
      refreshing.value = false
    }
  }

  function refreshAccount(id: string): Promise<void> {
    return ensurePoller().refreshOne(id)
  }

  async function removeAccountData(id: string) {
    watcher.forget(id)
    forecastWatcher.forget(id)
    delete latest[id]
    delete pollState[id]
    delete lastSnapshot[id]
    delete cycle[id]
    if (db) await db.deleteAccount(id)
  }

  function resetAccount(id: string) {
    poller?.resetAccount(id)
  }

  function history(): HistoryDb | null {
    return db
  }

  watch(
    () => settingsStore.settings.autoRefresh,
    (on) => {
      if (!poller) return
      if (on) poller.start()
      else poller.stop()
    },
  )
  watch(
    () => settingsStore.settings.intervalSeconds,
    (s) => poller?.setIntervalMs(s * 1000),
  )

  return {
    latest,
    pollState,
    lastSnapshot,
    cycle,
    refreshing,
    forecastFor,
    start,
    stop,
    refreshNow,
    refreshAccount,
    removeAccountData,
    resetAccount,
    history,
  }
})
