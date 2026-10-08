<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { summarizeSubscriptions, type SummaryRow } from '../lib/subscriptionSummary'
import type { UsageSnapshot } from '../storage/historyDb'
import { useAccountsStore } from '../stores/accounts'
import { useSettingsStore } from '../stores/settings'
import { useUsageStore } from '../stores/usage'

const { t, d, locale } = useI18n()
const accounts = useAccountsStore()
const settings = useSettingsStore()
const usage = useUsageStore()

const DAY_MS = 86_400_000
/** Two billing months back, enough for the running one and the one before. */
const LOOKBACK_DAYS = 62

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})
onUnmounted(() => {
  if (tick) clearInterval(tick)
})

const history = ref<Record<string, UsageSnapshot[]>>({})
async function load() {
  const db = usage.history()
  if (!db) return
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS).toISOString()
  const next: Record<string, UsageSnapshot[]> = {}
  for (const a of accounts.accounts) next[a.id] = await db.list(a.id, since)
  history.value = next
}
watch([() => accounts.accounts.length, () => Object.values(usage.lastSnapshot)], load, { immediate: true, deep: true })

const summary = computed(() =>
  summarizeSubscriptions(accounts.accounts, history.value, now.value, {
    includeCancelled: settings.settings.subscriptionsIncludeCancelled,
  }),
)

function money(value: number | null): string {
  if (value === null) return '–'
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: settings.settings.currency }).format(value)
}
function pct(value: number | null): string {
  return value === null ? '–' : `${Math.round(value * 100)} %`
}
const date = (ms: number) => d(new Date(ms), 'date')

const STATUS_CLASS: Record<SummaryRow['cycle']['state'], string> = {
  none: 'text-slate-500',
  active: '',
  ending: 'text-amber-700 dark:text-amber-400',
  expired: 'text-red-600 dark:text-red-400',
}

function statusText(r: SummaryRow): string {
  return t(`subscriptions.status.${r.cycle.state}`, { date: r.cycle.state === 'none' ? '' : date(r.cycle.endMs) })
}

function cycleText(r: SummaryRow): string {
  return r.cycle.state === 'active' || r.cycle.state === 'ending' ? t('subscriptions.cycle', { day: r.cycle.day, days: r.cycle.days }) : '–'
}

/** Under the average: what it covers, and the month before for comparison. */
function usageNote(r: SummaryRow): string {
  const parts: string[] = []
  if (r.cycle.state === 'none') parts.push(t('subscriptions.last30'))
  else if (r.current.firstMs !== null && r.current.firstMs - r.cycle.startMs > DAY_MS) parts.push(t('subscriptions.since', { date: date(r.current.firstMs) }))
  if (r.previous.average !== null) parts.push(t('subscriptions.previous', { percent: Math.round(r.previous.average * 100) }))
  return parts.join(' · ')
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 class="flex items-center text-lg font-bold">{{ t('subscriptions.title') }}<InfoTip :text="t('help.subscriptions')" /></h2>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-test="sub-include-cancelled"
          :checked="settings.settings.subscriptionsIncludeCancelled"
          @change="settings.update({ subscriptionsIncludeCancelled: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('subscriptions.includeCancelled') }}
      </label>
    </div>

    <p v-if="summary.rows.length === 0" class="rounded-lg border bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
      {{ t('subscriptions.empty') }}
    </p>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p class="text-xs text-slate-500">{{ t('subscriptions.total') }}</p>
          <p data-test="sub-total" class="text-xl font-bold tabular-nums">{{ money(summary.totalMonthly) }}</p>
          <p class="text-xs text-slate-500">{{ t('subscriptions.running', { n: summary.running }, summary.running) }}</p>
          <p v-if="summary.cancelledMonthly !== null" data-test="sub-cancelled" class="text-xs text-amber-700 dark:text-amber-400">
            {{
              t(settings.settings.subscriptionsIncludeCancelled ? 'subscriptions.withCancelled' : 'subscriptions.withoutCancelled', {
                amount: money(summary.cancelledMonthly),
              })
            }}
          </p>
        </div>
        <div class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p class="text-xs text-slate-500">{{ t('subscriptions.next') }}</p>
          <p data-test="sub-next" class="truncate text-xl font-bold">
            <template v-if="summary.next">{{ summary.next.name }}</template>
            <template v-else>–</template>
          </p>
          <p v-if="summary.next" class="text-xs" :class="summary.next.kind === 'end' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'">
            {{ t(summary.next.kind === 'end' ? 'subscriptions.status.ending' : 'subscriptions.status.active', { date: date(summary.next.atMs) }) }}
          </p>
        </div>
        <div class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p class="text-xs text-slate-500">{{ t('subscriptions.average') }}</p>
          <p class="text-xl font-bold tabular-nums">{{ pct(summary.average) }}</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900">
        <table class="w-full whitespace-nowrap text-left text-sm">
          <thead class="border-b text-xs text-slate-500 dark:border-slate-700">
            <tr>
              <th class="px-4 py-2 font-normal">{{ t('subscriptions.columns.account') }}</th>
              <th class="px-4 py-2 font-normal">{{ t('subscriptions.columns.plan') }}</th>
              <th class="px-4 py-2 text-right font-normal">{{ t('subscriptions.columns.price') }}</th>
              <th class="px-4 py-2 font-normal">{{ t('subscriptions.columns.status') }}</th>
              <th class="px-4 py-2 font-normal">{{ t('subscriptions.columns.cycle') }}</th>
              <th class="px-4 py-2 font-normal">{{ t('subscriptions.columns.usage') }}</th>
              <th class="px-4 py-2 text-right font-normal">{{ t('subscriptions.columns.perPercent') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in summary.rows"
              :key="r.id"
              class="border-b last:border-0 dark:border-slate-800"
              :class="r.included ? '' : 'opacity-50'"
            >
              <td class="px-4 py-2 font-bold">{{ r.name }}</td>
              <td class="px-4 py-2">{{ r.plan ? t(`accounts.subscription.plans.${r.plan}`) : '–' }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ money(r.monthlyPrice) }}</td>
              <td class="px-4 py-2" :class="STATUS_CLASS[r.cycle.state]">{{ statusText(r) }}</td>
              <td class="px-4 py-2 tabular-nums">{{ cycleText(r) }}</td>
              <td class="px-4 py-2">
                <span class="tabular-nums">
                  <template v-if="r.current.average !== null">
                    {{ pct(r.current.average) }} · {{ t('subscriptions.weeks', { n: r.current.weeks }, r.current.weeks) }}
                  </template>
                  <template v-else>{{ t('subscriptions.noData') }}</template>
                </span>
                <span v-if="usageNote(r)" class="block text-xs text-slate-500">{{ usageNote(r) }}</span>
              </td>
              <td class="px-4 py-2 text-right tabular-nums">{{ money(r.perPercent) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
