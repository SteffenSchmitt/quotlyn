<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountCard from '../components/AccountCard.vue'
import OverviewTiles from '../components/OverviewTiles.vue'
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
      <label class="flex items-center gap-2 text-sm">
        <input v-model="autoRefresh" type="checkbox" />
        {{ t('dashboard.autoRefresh') }}
        <span class="text-slate-400">{{ t('dashboard.interval', { n: settings.settings.intervalSeconds }) }}</span>
      </label>
    </div>

    <p v-if="accounts.accounts.length === 0" class="text-slate-500">{{ t('dashboard.empty') }}</p>

    <OverviewTiles v-if="accounts.accounts.length > 1" :accounts="accounts.accounts" :latest="usage.latest" :now="now" />

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <AccountCard
        v-for="a in accounts.accounts"
        :key="a.id"
        :account="a"
        :parsed="usage.latest[a.id]"
        :state="usage.pollState[a.id]"
        :now="now"
      />
    </div>
  </section>
</template>
