<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadText, parseHistoryExport, snapshotsToCsv, snapshotsToJson } from '../lib/exportImport'
import { permissionState, requestPermission, type NotifyPermission } from '../notify/webNotify'
import { VAULT_KEY, readJson } from '../storage/localStore'
import { useAccountsStore } from '../stores/accounts'
import { MAX_FORECAST_POINTS, MIN_FORECAST_POINTS, useSettingsStore, type LocaleSetting, type Theme } from '../stores/settings'
import { LOOKBACK_CHOICES } from '../lib/forecast'
import { useUsageStore } from '../stores/usage'
import { VaultError } from '../crypto/vault'

const { t } = useI18n()
const settings = useSettingsStore()
const accounts = useAccountsStore()
const usage = useUsageStore()

const s = computed(() => settings.settings)
const themes: Theme[] = ['system', 'light', 'dark']
const locales: LocaleSetting[] = ['auto', 'de', 'en']

const warnPct = computed({
  get: () => Math.round(s.value.thresholds.warn * 100),
  set: (v: number) => settings.update({ thresholds: { warn: v / 100, crit: s.value.thresholds.crit } }),
})
const critPct = computed({
  get: () => Math.round(s.value.thresholds.crit * 100),
  set: (v: number) => settings.update({ thresholds: { warn: s.value.thresholds.warn, crit: v / 100 } }),
})

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
function updateForecast(patch: Partial<typeof s.value.forecast>) {
  settings.update({ forecast: { ...s.value.forecast, ...patch } })
}

const permission = ref<NotifyPermission>(permissionState())
async function toggleNotifications(on: boolean) {
  if (on) permission.value = await requestPermission()
  settings.update({ notificationsEnabled: on && permission.value === 'granted' })
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

function exportAccounts() {
  const blob = readJson<unknown>(localStorage, VAULT_KEY)
  if (!blob) return
  downloadText(`quotlyn-accounts-${stamp()}.json`, JSON.stringify(blob, null, 2), 'application/json')
}

const includeIdentifying = ref(false)
async function exportSnapshots(format: 'csv' | 'json') {
  const db = usage.history()
  if (!db) return
  const names = Object.fromEntries(accounts.accounts.map((a) => [a.id, a.name]))
  const all = (await Promise.all(accounts.accounts.map((a) => db.list(a.id)))).flat()
  all.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))
  if (format === 'csv') downloadText(`quotlyn-history-${stamp()}.csv`, snapshotsToCsv(all, names), 'text/csv')
  else
    downloadText(
      `quotlyn-history-${stamp()}.json`,
      snapshotsToJson(all, names, includeIdentifying.value),
      'application/json',
    )
}

const importFile = ref<File | null>(null)
const importPassphrase = ref('')
const importMode = ref<'merge' | 'replace'>('merge')
const importResult = ref<string | null>(null)
const importError = ref<string | null>(null)

const historyFile = ref<File | null>(null)
const historyResult = ref<string | null>(null)
const historyError = ref<string | null>(null)

function onHistoryFile(e: Event) {
  historyFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
  historyResult.value = null
  historyError.value = null
}

async function runHistoryImport() {
  historyResult.value = null
  historyError.value = null
  if (!historyFile.value) return
  try {
    const idsByName = Object.fromEntries(accounts.accounts.map((a) => [a.name, a.id]))
    const parsed = parseHistoryExport(await historyFile.value.text(), idsByName)
    const r = await usage.importHistory(parsed.snapshots)
    historyResult.value =
      t('settings.importHistory.done', { added: r.added, skipped: r.skipped }) +
      (parsed.unknownAccounts.length ? ' ' + t('settings.importHistory.unknown', { names: parsed.unknownAccounts.join(', ') }) : '')
  } catch {
    historyError.value = t('settings.importHistory.malformed')
  }
}

function onFile(e: Event) {
  importFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function runImport() {
  importResult.value = null
  importError.value = null
  if (!importFile.value) return
  try {
    const blob = JSON.parse(await importFile.value.text())
    const r = await accounts.importVault(blob, importPassphrase.value, importMode.value)
    importResult.value = t('settings.import.done', { imported: r.imported, total: r.total })
    importPassphrase.value = ''
  } catch (e) {
    if (e instanceof VaultError) importError.value = e.code === 'wrong_passphrase' ? t('vault.wrong') : t('settings.import.malformed')
    else if (e instanceof SyntaxError) importError.value = t('settings.import.malformed')
    else importError.value = String(e)
  }
}
</script>

<template>
  <section class="max-w-2xl space-y-6">
    <h2 class="text-lg font-bold">{{ t('settings.title') }}</h2>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 class="mb-3 flex items-center text-sm font-bold">{{ t('settings.groups.polling') }}<InfoTip :text="t('help.polling')" /></h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex items-center gap-2 text-sm sm:col-span-2">
          <input :checked="s.autoRefresh" type="checkbox" @change="settings.update({ autoRefresh: ($event.target as HTMLInputElement).checked })" />
          {{ t('dashboard.autoRefresh') }}
        </label>
        <label class="text-sm">
          {{ t('settings.interval') }}
          <input
            :value="s.intervalSeconds"
            type="number"
            min="60"
            step="30"
            class="field mt-1 w-full"
            @change="settings.update({ intervalSeconds: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </div>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 class="mb-3 flex items-center text-sm font-bold">{{ t('settings.groups.history') }}<InfoTip :text="t('help.forecast')" /></h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {{ t('settings.retention') }}
          <input
            :value="s.retentionDays"
            type="number"
            min="1"
            class="field mt-1 w-full"
            @change="settings.update({ retentionDays: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="flex items-center gap-2 self-end pb-2 text-sm">
          <input :checked="s.forecast.enabled" type="checkbox" @change="updateForecast({ enabled: ($event.target as HTMLInputElement).checked })" />
          {{ t('settings.forecast.enabled') }}
        </label>
        <label class="text-sm">
          {{ t('settings.forecast.lookback') }}
          <select
            :value="String(s.forecast.lookbackMinutes)"
            class="select mt-1 w-full"
            :disabled="!s.forecast.enabled"
            @change="updateForecast({ lookbackMinutes: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="m in LOOKBACK_CHOICES" :key="m" :value="String(m)">
              {{ m === 0 ? t('settings.forecast.lookbackCycle') : t('settings.forecast.lookbackMin', { n: m }) }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm sm:col-span-2">
          <input :checked="s.forecast.notify" type="checkbox" :disabled="!s.forecast.enabled" @change="updateForecast({ notify: ($event.target as HTMLInputElement).checked })" />
          {{ t('settings.forecast.notify') }}
        </label>
        <label class="text-sm">
          {{ t('settings.forecast.minPoints') }}
          <input
            :value="s.forecast.minPoints"
            type="number"
            :min="MIN_FORECAST_POINTS"
            :max="MAX_FORECAST_POINTS"
            class="field mt-1 w-full"
            :disabled="!s.forecast.enabled"
            @change="updateForecast({ minPoints: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </div>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 class="mb-3 flex items-center text-sm font-bold">{{ t('settings.groups.alerts') }}<InfoTip :text="t('help.thresholds')" /></h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {{ t('settings.warn') }}
          <input v-model.number="warnPct" type="number" min="5" max="99" class="field mt-1 w-full" />
        </label>
        <label class="text-sm">
          {{ t('settings.crit') }}
          <input v-model.number="critPct" type="number" min="6" max="100" class="field mt-1 w-full" />
        </label>
      </div>
      <label class="mt-3 flex items-center gap-2 text-sm">
        <input :checked="s.notificationsEnabled" type="checkbox" @change="toggleNotifications(($event.target as HTMLInputElement).checked)" />
        {{ t('settings.notifications') }}
        <span class="text-xs text-slate-400">{{ t(`settings.permission.${permission}`) }}</span>
        <InfoTip :text="t('help.notifications')" />
      </label>
      <p v-if="isMac" class="mt-2 text-xs text-slate-500">{{ t('settings.notificationsMacHint') }}</p>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 class="mb-3 flex items-center text-sm font-bold">{{ t('settings.groups.appearance') }}<InfoTip :text="t('help.appearance')" /></h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {{ t('settings.theme') }}
          <select :value="s.theme" class="select mt-1 w-full" @change="settings.update({ theme: ($event.target as HTMLSelectElement).value as Theme })">
            <option v-for="th in themes" :key="th" :value="th">{{ t(`settings.themes.${th}`) }}</option>
          </select>
        </label>
        <label class="text-sm">
          {{ t('settings.language') }}
          <select :value="s.locale" class="select mt-1 w-full" @change="settings.update({ locale: ($event.target as HTMLSelectElement).value as LocaleSetting })">
            <option v-for="l in locales" :key="l" :value="l">{{ t(`settings.locales.${l}`) }}</option>
          </select>
        </label>
      </div>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 class="mb-3 flex items-center text-sm font-bold">{{ t('settings.groups.data') }}<InfoTip :text="t('help.export')" /></h3>
      <h4 class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('settings.export.title') }}</h4>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <button class="btn-secondary" @click="exportAccounts">{{ t('settings.export.accounts') }}</button>
        <button class="btn-secondary" @click="exportSnapshots('csv')">{{ t('settings.export.csv') }}</button>
        <button class="btn-secondary" @click="exportSnapshots('json')">{{ t('settings.export.json') }}</button>
        <label class="flex items-center gap-1">
          <input v-model="includeIdentifying" type="checkbox" />
          {{ t('settings.export.identifying') }}
        </label>
      </div>
      <p class="mt-2 text-xs text-slate-500">{{ t('settings.export.hint') }}</p>

      <h4 class="mb-2 mt-5 flex items-center text-xs font-bold uppercase tracking-wide text-slate-500">
        {{ t('settings.import.title') }}<InfoTip :text="t('help.import')" />
      </h4>
      <div class="space-y-3 text-sm">
        <input type="file" accept="application/json,.json" class="field-file block" @change="onFile" />
        <label class="block">
          {{ t('settings.import.passphrase') }}
          <input v-model="importPassphrase" type="password" autocomplete="off" class="field mt-1 w-full" />
        </label>
        <div class="flex gap-4">
          <label class="flex items-center gap-1"><input v-model="importMode" type="radio" value="merge" /> {{ t('settings.import.merge') }}</label>
          <label class="flex items-center gap-1"><input v-model="importMode" type="radio" value="replace" /> {{ t('settings.import.replace') }}</label>
        </div>
        <button class="btn-primary" :disabled="!importFile || !importPassphrase" @click="runImport">
          {{ t('settings.import.run') }}
        </button>
        <p v-if="importResult" class="text-green-600">{{ importResult }}</p>
        <p v-if="importError" class="text-red-600">{{ importError }}</p>
      </div>

      <h4 class="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">{{ t('settings.importHistory.title') }}</h4>
      <div class="space-y-3 text-sm">
        <input type="file" accept="application/json,.json" class="field-file block" @change="onHistoryFile" />
        <button class="btn-primary" :disabled="!historyFile" @click="runHistoryImport">{{ t('settings.importHistory.run') }}</button>
        <p class="text-xs text-slate-500">{{ t('settings.importHistory.hint') }}</p>
        <p v-if="historyResult" class="text-green-600">{{ historyResult }}</p>
        <p v-if="historyError" class="text-red-600">{{ historyError }}</p>
      </div>
    </fieldset>
  </section>
</template>
