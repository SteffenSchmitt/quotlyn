import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { SETTINGS_KEY, readJson, writeJson } from '../storage/localStore'
import { DEFAULT_THRESHOLDS, type Thresholds } from '../lib/usageView'

export type Theme = 'system' | 'light' | 'dark'
export type LocaleSetting = 'auto' | 'de' | 'en'

export interface Settings {
  intervalSeconds: number
  autoRefresh: boolean
  retentionDays: number
  thresholds: Thresholds
  notificationsEnabled: boolean
  theme: Theme
  locale: LocaleSetting
}

export const DEFAULT_SETTINGS: Settings = {
  intervalSeconds: 300,
  autoRefresh: true,
  retentionDays: 30,
  thresholds: { ...DEFAULT_THRESHOLDS },
  notificationsEnabled: false,
  theme: 'system',
  locale: 'auto',
}
export const MIN_INTERVAL_SECONDS = 60
const THEMES: Theme[] = ['system', 'light', 'dark']
const LOCALES: LocaleSetting[] = ['auto', 'de', 'en']

export const settingsDeps = {
  storage: (): Storage => localStorage,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function sanitize(input: Partial<Settings>, base: Settings): Settings {
  const out: Settings = { ...base, thresholds: { ...base.thresholds } }
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
  if (typeof input.notificationsEnabled === 'boolean') out.notificationsEnabled = input.notificationsEnabled
  if (input.theme && THEMES.includes(input.theme)) out.theme = input.theme
  if (input.locale && LOCALES.includes(input.locale)) out.locale = input.locale
  return out
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({ ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_THRESHOLDS } })

  function load() {
    const stored = readJson<Partial<Settings>>(settingsDeps.storage(), SETTINGS_KEY) ?? {}
    Object.assign(settings, sanitize(stored, DEFAULT_SETTINGS))
  }

  function update(patch: Partial<Settings>) {
    Object.assign(settings, sanitize(patch, settings))
    writeJson(settingsDeps.storage(), SETTINGS_KEY, { ...settings, thresholds: { ...settings.thresholds } })
  }

  return { settings, load, update }
})
