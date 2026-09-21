<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountsStore } from '../stores/accounts'
import { useSettingsStore } from '../stores/settings'
import { useUsageStore } from '../stores/usage'

const { t, d } = useI18n()
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

function countdown(iso: string | null): string {
  if (!iso) return '–'
  const ms = Date.parse(iso) - now.value
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`
}

function pct(u: number): number {
  return Math.round(u * 100)
}

function barClass(u: number): string {
  if (u >= 0.95) return 'bg-red-500'
  if (u >= 0.8) return 'bg-amber-500'
  return 'bg-emerald-500'
}

const autoRefresh = computed({
  get: () => settings.settings.autoRefresh,
  set: (v: boolean) => settings.update({ autoRefresh: v }),
})
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <button
        class="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
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

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="a in accounts.accounts" :key="a.id" class="rounded-lg border bg-white p-4">
        <header class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: a.color }" />
          <h3 class="flex-1 font-semibold">{{ a.name }}</h3>
          <span class="text-xs text-slate-500">
            {{ t(`dashboard.state.${usage.pollState[a.id]?.status ?? 'idle'}`) }}
          </span>
        </header>

        <p v-if="usage.pollState[a.id]?.lastError" class="mt-1 text-xs text-red-600">
          {{ usage.pollState[a.id]?.lastError }}
        </p>

        <div v-if="usage.latest[a.id]" class="mt-3 space-y-3">
          <div v-for="w in usage.latest[a.id]!.windows" :key="w.key">
            <div class="flex justify-between text-sm">
              <span class="font-medium">{{ w.key }}</span>
              <span>{{ pct(w.utilization) }} % · {{ t('dashboard.resetsIn', { t: countdown(w.resetsAt) }) }}</span>
            </div>
            <div class="mt-1 h-2 w-full rounded bg-slate-100">
              <div
                class="h-2 rounded"
                :class="barClass(w.utilization)"
                :style="{ width: `${Math.min(100, pct(w.utilization))}%` }"
              />
            </div>
          </div>
          <p class="text-xs text-slate-500">
            {{ t('dashboard.overage', { status: usage.latest[a.id]!.overage.status ?? '–' }) }}
            <span v-if="usage.latest[a.id]!.usage">
              ·
              {{
                t('dashboard.cost', {
                  i: usage.latest[a.id]!.usage!.inputTokens,
                  o: usage.latest[a.id]!.usage!.outputTokens,
                })
              }}
            </span>
          </p>
        </div>

        <p class="mt-2 text-xs text-slate-400">
          {{
            usage.pollState[a.id]?.lastFetchedAt
              ? t('dashboard.lastFetched', { time: d(new Date(usage.pollState[a.id]!.lastFetchedAt!), 'time') })
              : t('dashboard.never')
          }}
        </p>
      </article>
    </div>
  </section>
</template>
