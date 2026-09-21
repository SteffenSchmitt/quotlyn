<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadText, snapshotsToCsv, snapshotsToJson } from '../lib/exportImport'
import { permissionState, requestPermission, type NotifyPermission } from '../notify/webNotify'
import { VAULT_KEY, readJson } from '../storage/localStore'
import { useAccountsStore } from '../stores/accounts'
import { useSettingsStore, type LocaleSetting, type Theme } from '../stores/settings'
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
      <legend class="px-1 text-sm font-bold">{{ t('settings.polling') }}<InfoTip :text="t('help.polling')" /></legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {{ t('settings.interval') }}
          <input
            :value="s.intervalSeconds"
            type="number"
            min="60"
            step="30"
            class="field mt-1"
            @change="settings.update({ intervalSeconds: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="text-sm">
          {{ t('settings.retention') }}
          <input
            :value="s.retentionDays"
            type="number"
            min="1"
            class="field mt-1"
            @change="settings.update({ retentionDays: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input :checked="s.autoRefresh" type="checkbox" @change="settings.update({ autoRefresh: ($event.target as HTMLInputElement).checked })" />
          {{ t('dashboard.autoRefresh') }}
        </label>
      </div>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend class="px-1 text-sm font-bold">{{ t('settings.thresholds') }}<InfoTip :text="t('help.thresholds')" /></legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {{ t('settings.warn') }}
          <input v-model.number="warnPct" type="number" min="5" max="99" class="field mt-1" />
        </label>
        <label class="text-sm">
          {{ t('settings.crit') }}
          <input v-model.number="critPct" type="number" min="6" max="100" class="field mt-1" />
        </label>
      </div>
      <label class="mt-3 flex items-center gap-2 text-sm">
        <input :checked="s.notificationsEnabled" type="checkbox" @change="toggleNotifications(($event.target as HTMLInputElement).checked)" />
        <span>{{ t('settings.notifications') }}<InfoTip :text="t('help.notifications')" /></span>
        <span class="text-xs text-slate-400">{{ t(`settings.permission.${permission}`) }}</span>
      </label>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend class="px-1 text-sm font-bold">{{ t('settings.appearance') }}<InfoTip :text="t('help.appearance')" /></legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {{ t('settings.theme') }}
          <select :value="s.theme" class="field mt-1" @change="settings.update({ theme: ($event.target as HTMLSelectElement).value as Theme })">
            <option v-for="th in themes" :key="th" :value="th">{{ t(`settings.themes.${th}`) }}</option>
          </select>
        </label>
        <label class="text-sm">
          {{ t('settings.language') }}
          <select :value="s.locale" class="field mt-1" @change="settings.update({ locale: ($event.target as HTMLSelectElement).value as LocaleSetting })">
            <option v-for="l in locales" :key="l" :value="l">{{ t(`settings.locales.${l}`) }}</option>
          </select>
        </label>
      </div>
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend class="px-1 text-sm font-bold">{{ t('settings.export.title') }}<InfoTip :text="t('help.export')" /></legend>
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
    </fieldset>

    <fieldset class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend class="px-1 text-sm font-bold">{{ t('settings.import.title') }}<InfoTip :text="t('help.import')" /></legend>
      <div class="space-y-3 text-sm">
        <input type="file" accept="application/json,.json" class="field-file block" @change="onFile" />
        <label class="block">
          {{ t('settings.import.passphrase') }}
          <input v-model="importPassphrase" type="password" autocomplete="off" class="field mt-1" />
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
    </fieldset>
  </section>
</template>
