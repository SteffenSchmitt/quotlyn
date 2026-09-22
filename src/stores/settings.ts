import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { SETTINGS_KEY, readJson, writeJson } from '../storage/localStore'
import { DEFAULT_THRESHOLDS, type Thresholds } from '../lib/usageView'
import { DEFAULT_FORECAST, LOOKBACK_CHOICES, type ForecastOptions } from '../lib/forecast'
import { TIMELINE_SORTS, type TimelineSort } from '../lib/timelineBars'
import { DASHBOARD_COLUMNS, DEFAULT_DASHBOARD_COLUMNS, type DashboardColumns } from '../lib/dashboardGrid'

export type Theme = 'system' | 'light' | 'dark'
export type LocaleSetting = 'auto' | 'de' | 'en'
export type DashboardSort = 'manual' | 'headroom'

export interface ForecastSettings extends ForecastOptions {
  enabled: boolean
  /** Notify once per cycle when a window is expected to run out within the hour. */
  notify: boolean
}

export interface Settings {
  intervalSeconds: number
  autoRefresh: boolean
  retentionDays: number
  thresholds: Thresholds
  forecast: ForecastSettings
  notificationsEnabled: boolean
  /** Notify when a window that was used up is free again. */
  resetNotifications: boolean
  theme: Theme
  locale: LocaleSetting
  dashboardSort: DashboardSort
  /** Cards per row on a wide window; narrower windows still step down. */
  dashboardColumns: DashboardColumns
  timelineSort: TimelineSort
}

export const DEFAULT_SETTINGS: Settings = {
  intervalSeconds: 300,
  autoRefresh: true,
  retentionDays: 30,
  thresholds: { ...DEFAULT_THRESHOLDS },
  forecast: { enabled: true, notify: true, ...DEFAULT_FORECAST },
  notificationsEnabled: false,
  resetNotifications: true,
  theme: 'system',
  locale: 'auto',
  dashboardSort: 'manual',
  dashboardColumns: DEFAULT_DASHBOARD_COLUMNS,
  timelineSort: 'accounts',
}
export const MIN_INTERVAL_SECONDS = 60
export const MIN_FORECAST_POINTS = 2
export const MAX_FORECAST_POINTS = 10
const THEMES: Theme[] = ['system', 'light', 'dark']
const LOCALES: LocaleSetting[] = ['auto', 'de', 'en']
const SORTS: DashboardSort[] = ['manual', 'headroom']

export const settingsDeps = {
  storage: (): Storage => localStorage,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function sanitize(input: Partial<Settings>, base: Settings): Settings {
  const out: Settings = { ...base, thresholds: { ...base.thresholds }, forecast: { ...base.forecast } }
  if (typeof input.intervalSeconds === 'number' && Number.isFinite(input.intervalSeconds)) {
    out.intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, Math.round(input.intervalSeconds))
  }
  if (typeof input.autoRefresh === 'boolean') out.autoRefresh = input.autoRefresh
  if (typeof input.retentionDays === 'number' && Number.isFinite(input.retentionDays)) {
    out.retentionDays = Math.max(1, Math.round(input.retentionDays))
  }
  if (input.thresholds && typeof input.thresholds === 'object') {
    const { warn, crit } = input.thresholds
    if (typeof crit === 'number' && Number.isFinite(crit)) out.thresholds.crit = clamp(crit, 0.05, 1)
    if (typeof warn === 'number' && Number.isFinite(warn)) out.thresholds.warn = clamp(warn, 0.05, 1)
    if (out.thresholds.warn >= out.thresholds.crit) {
      out.thresholds.warn = Math.round((out.thresholds.crit - 0.01) * 100) / 100
    }
  }
  if (input.forecast && typeof input.forecast === 'object') {
    const { enabled, lookbackMinutes, minPoints, notify } = input.forecast
    if (typeof enabled === 'boolean') out.forecast.enabled = enabled
    if (notify !== undefined) out.forecast.notify = notify === true
    if ((LOOKBACK_CHOICES as readonly number[]).includes(lookbackMinutes)) out.forecast.lookbackMinutes = lookbackMinutes
    if (typeof minPoints === 'number' && Number.isFinite(minPoints)) {
      out.forecast.minPoints = clamp(Math.round(minPoints), MIN_FORECAST_POINTS, MAX_FORECAST_POINTS)
    }
  }
  if (typeof input.notificationsEnabled === 'boolean') out.notificationsEnabled = input.notificationsEnabled
  if (input.resetNotifications !== undefined) out.resetNotifications = input.resetNotifications === true
  if (input.theme && THEMES.includes(input.theme)) out.theme = input.theme
  if (input.locale && LOCALES.includes(input.locale)) out.locale = input.locale
  if (input.dashboardSort && SORTS.includes(input.dashboardSort)) out.dashboardSort = input.dashboardSort
  if (input.dashboardColumns !== undefined && DASHBOARD_COLUMNS.includes(input.dashboardColumns)) {
    out.dashboardColumns = input.dashboardColumns
  }
  if (input.timelineSort && TIMELINE_SORTS.includes(input.timelineSort)) out.timelineSort = input.timelineSort
  return out
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({ ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_THRESHOLDS }, forecast: { ...DEFAULT_SETTINGS.forecast } })

  function load() {
    const stored = readJson<Partial<Settings>>(settingsDeps.storage(), SETTINGS_KEY) ?? {}
    Object.assign(settings, sanitize(stored, DEFAULT_SETTINGS))
  }

  function update(patch: Partial<Settings>) {
    Object.assign(settings, sanitize(patch, settings))
    writeJson(settingsDeps.storage(), SETTINGS_KEY, { ...settings, thresholds: { ...settings.thresholds }, forecast: { ...settings.forecast } })
  }

  return { settings, load, update }
})
