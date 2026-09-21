<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Account } from '../stores/accounts'
import type { ParsedUsage } from '../api/usageParser'
import type { AccountPollState } from '../scheduler/poller'
import { computed } from 'vue'
import { criticalWindow, formatCountdown, levelColor, levelFor } from '../lib/usageView'
import { useWindowLabels } from '../lib/windowLabels'
import UsageGauge from './UsageGauge.vue'
import RawDataView from './RawDataView.vue'

const props = defineProps<{ account: Account; parsed?: ParsedUsage; state?: AccountPollState; now: number }>()
const { t, d } = useI18n()
const { lines, oneLine } = useWindowLabels()

const summary = computed(() => {
  const w = criticalWindow(props.parsed)
  if (!w) return null
  return {
    label: oneLine(w.key),
    percent: Math.round(w.utilization * 100),
    color: levelColor(levelFor(w.utilization)),
    countdown: formatCountdown(w.resetsAt, props.now),
  }
})
</script>

<template>
  <article class="rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
    <header class="flex items-center gap-2">
      <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: account.color }" />
      <h3 class="flex-1 font-semibold">{{ account.name }}</h3>
      <span
        class="text-xs"
        :class="state?.status === 'limited' ? 'font-medium text-red-600' : 'text-slate-500'"
      >
        {{ t(`dashboard.state.${state?.status ?? 'idle'}`) }}
      </span>
    </header>
    <p v-if="state?.lastError" class="mt-1 text-xs text-red-600">{{ state.lastError }}</p>
    <p v-if="state?.status === 'limited'" class="mt-1 text-xs text-slate-500">{{ t('dashboard.limitedHint') }}</p>

    <template v-if="parsed">
      <p v-if="parsed.probe.fallbackUsed" class="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        {{ t('dashboard.fallback', { status: parsed.probe.primaryStatus ?? '?' }) }}
      </p>
      <div class="mt-3 flex flex-wrap justify-around gap-2">
        <UsageGauge
          v-for="w in parsed.windows"
          :key="w.key"
          :utilization="w.utilization"
          :label="lines(w.key)[0]"
          :sublabel="lines(w.key)[1]"
          :subtitle="t('dashboard.resetsIn', { t: formatCountdown(w.resetsAt, now) })"
        />
      </div>
      <p class="mt-2 text-xs text-slate-500">
        {{
          t('dashboard.overall', {
            status: parsed.overall.status ?? '–',
            claim: parsed.overall.representativeClaim ?? '–',
          })
        }}
      </p>
      <div class="mt-2 rounded bg-slate-50 p-2 dark:bg-slate-800 text-xs">
        <div class="font-medium">{{ t('dashboard.overageBlock.title') }}</div>
        <div>{{ t('dashboard.overageBlock.status', { status: parsed.overage.status ?? '–' }) }}</div>
        <div v-if="parsed.overage.disabledReason">
          {{ t('dashboard.overageBlock.reason', { reason: parsed.overage.disabledReason }) }}
        </div>
      </div>
      <p v-if="parsed.usage" class="mt-1 text-xs text-slate-400">
        {{ t('dashboard.cost', { i: parsed.usage.inputTokens, o: parsed.usage.outputTokens }) }}
        <span v-if="parsed.probe.model"> · {{ t('dashboard.probeModel', { model: parsed.probe.model }) }}</span>
      </p>
      <RawDataView :raw="parsed.raw" />
    </template>
    <p v-else class="mt-3 text-sm text-slate-400">{{ t('dashboard.noData') }}</p>

    <p class="mt-2 text-xs text-slate-400">
      {{
        state?.lastFetchedAt
          ? t('dashboard.lastFetched', { time: d(new Date(state.lastFetchedAt), 'time') })
          : t('dashboard.never')
      }}
    </p>
  </article>
</template>
