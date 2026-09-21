import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_SETTINGS, settingsDeps, useSettingsStore } from '../../src/stores/settings'
import { MemoryStorage, SETTINGS_KEY } from '../../src/storage/localStore'

let storage: MemoryStorage

beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  settingsDeps.storage = () => storage
})

describe('settings store', () => {
  it('starts with defaults', () => {
    const s = useSettingsStore()
    s.load()
    expect(s.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('persists updates and reloads them', () => {
    const s = useSettingsStore()
    s.load()
    s.update({ intervalSeconds: 120, autoRefresh: false })
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toMatchObject({ intervalSeconds: 120, autoRefresh: false })

    setActivePinia(createPinia())
    const t = useSettingsStore()
    t.load()
    expect(t.settings).toEqual({ ...DEFAULT_SETTINGS, intervalSeconds: 120, autoRefresh: false })
  })

  it('clamps interval to the minimum and retention to at least 1 day', () => {
    const s = useSettingsStore()
    s.load()
    s.update({ intervalSeconds: 5, retentionDays: 0 })
    expect(s.settings.intervalSeconds).toBe(60)
    expect(s.settings.retentionDays).toBe(1)
  })

  it('clamps thresholds and keeps warn below crit', () => {
    const s = useSettingsStore()
    s.load()
    s.update({ thresholds: { warn: 0.97, crit: 0.95 } })
    expect(s.settings.thresholds).toEqual({ warn: 0.94, crit: 0.95 })
    s.update({ thresholds: { warn: 0.5, crit: 2 } })
    expect(s.settings.thresholds).toEqual({ warn: 0.5, crit: 1 })
  })

  it('persists theme, locale and notifications', () => {
    const s = useSettingsStore()
    s.load()
    s.update({ theme: 'dark', locale: 'en', notificationsEnabled: true })
    setActivePinia(createPinia())
    const t = useSettingsStore()
    t.load()
    expect(t.settings).toMatchObject({ theme: 'dark', locale: 'en', notificationsEnabled: true })
    t.update({ theme: 'weird' as never, locale: 'fr' as never, dashboardSort: 'nope' as never })
    expect(t.settings.theme).toBe('dark')
    expect(t.settings.locale).toBe('en')
    expect(t.settings.dashboardSort).toBe('manual')
    t.update({ dashboardSort: 'headroom' })
    expect(t.settings.dashboardSort).toBe('headroom')
  })

  it('ignores unknown or malformed stored values', () => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ intervalSeconds: 'abc', junk: 1 }))
    const s = useSettingsStore()
    s.load()
    expect(s.settings).toEqual(DEFAULT_SETTINGS)
  })
})
