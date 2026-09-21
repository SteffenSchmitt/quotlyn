import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { SETTINGS_KEY, readJson, writeJson } from '../storage/localStore'

export interface Settings {
  intervalSeconds: number
  autoRefresh: boolean
  retentionDays: number
}

export const DEFAULT_SETTINGS: Settings = { intervalSeconds: 300, autoRefresh: true, retentionDays: 30 }
export const MIN_INTERVAL_SECONDS = 60

export const settingsDeps = {
  storage: (): Storage => localStorage,
}

function sanitize(input: Partial<Settings>, base: Settings): Settings {
  const out = { ...base }
  if (typeof input.intervalSeconds === 'number' && Number.isFinite(input.intervalSeconds)) {
    out.intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, Math.round(input.intervalSeconds))
  }
  if (typeof input.autoRefresh === 'boolean') out.autoRefresh = input.autoRefresh
  if (typeof input.retentionDays === 'number' && Number.isFinite(input.retentionDays)) {
    out.retentionDays = Math.max(1, Math.round(input.retentionDays))
  }
  return out
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({ ...DEFAULT_SETTINGS })

  function load() {
    const stored = readJson<Partial<Settings>>(settingsDeps.storage(), SETTINGS_KEY) ?? {}
    Object.assign(settings, sanitize(stored, DEFAULT_SETTINGS))
  }

  function update(patch: Partial<Settings>) {
    Object.assign(settings, sanitize(patch, settings))
    writeJson(settingsDeps.storage(), SETTINGS_KEY, { ...settings })
  }

  return { settings, load, update }
})
