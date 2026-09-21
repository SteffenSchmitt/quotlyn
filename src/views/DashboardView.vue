<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountCard from '../components/AccountCard.vue'
import { sortByHeadroom } from '../lib/usageView'
import { useAccountsStore } from '../stores/accounts'
import { useSettingsStore } from '../stores/settings'
import { useUsageStore } from '../stores/usage'

const { t } = useI18n()
const accounts = useAccountsStore()
const settings = useSettingsStore()
const usage = useUsageStore()

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (tick) clearInterval(tick)
})

const orderedAccounts = computed(() =>
  settings.settings.dashboardSort === 'headroom'
    ? sortByHeadroom(accounts.accounts, (a) => usage.latest[a.id])
    : accounts.accounts,
)

const autoRefresh = computed({
  get: () => settings.settings.autoRefresh,
  set: (v: boolean) => settings.update({ autoRefresh: v }),
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <button
        class="rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900 disabled:opacity-50"
        :disabled="usage.refreshing || accounts.accounts.length === 0"
        @click="usage.refreshNow()"
      >
        {{ usage.refreshing ? t('dashboard.refreshing') : t('dashboard.refresh') }}
      </button>
      <InfoTip :text="t('help.refresh')" />
      <label class="flex items-center gap-2 text-sm">
        <input v-model="autoRefresh" type="checkbox" />
        {{ t('dashboard.autoRefresh') }}
        <span class="text-slate-400">{{ t('dashboard.interval', { n: settings.settings.intervalSeconds }) }}</span>
        <InfoTip :text="t('help.autoRefresh')" />
      </label>
      <label class="flex items-center gap-2 text-sm">
        {{ t('dashboard.sort.label') }}
        <select
          :value="settings.settings.dashboardSort"
          class="rounded border px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
          @change="settings.update({ dashboardSort: ($event.target as HTMLSelectElement).value as 'manual' | 'headroom' })"
        >
          <option value="manual">{{ t('dashboard.sort.manual') }}</option>
          <option value="headroom">{{ t('dashboard.sort.headroom') }}</option>
        </select>
        <InfoTip :text="t('help.sort')" />
      </label>
    </div>

    <p v-if="accounts.accounts.length === 0" class="text-slate-500">
      {{ t('dashboard.emptyHelp') }}
      <RouterLink to="/help" class="text-sky-700 underline dark:text-sky-400">{{ t('nav.help') }}</RouterLink>
    </p>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <AccountCard
        v-for="a in orderedAccounts"
        :key="a.id"
        :account="a"
        :parsed="usage.latest[a.id]"
        :state="usage.pollState[a.id]"
        :now="now"
      />
    </div>
  </section>
</template>
