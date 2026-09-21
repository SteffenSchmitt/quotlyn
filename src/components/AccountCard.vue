<script setup lang="ts">
import InfoTip from './InfoTip.vue'
import { useI18n } from 'vue-i18n'
import type { Account } from '../stores/accounts'
import type { ParsedUsage } from '../api/usageParser'
import type { AccountPollState } from '../scheduler/poller'
import { computed } from 'vue'
import { formatCountdown, primaryWindowFor } from '../lib/usageView'
import { windowColor } from '../lib/palette'
import { isDark } from '../lib/theme'
import { useWindowLabels } from '../lib/windowLabels'
import UsageRings from './UsageRings.vue'
import RawDataView from './RawDataView.vue'

const props = defineProps<{ account: Account; parsed?: ParsedUsage; state?: AccountPollState; now: number }>()
const { t, d } = useI18n()
const { oneLine } = useWindowLabels()

const summary = computed(() => {
  const w = primaryWindowFor(props.parsed, props.account.primaryWindow)
  if (!w) return null
  const keys = props.parsed!.windows.map((x) => x.key)
  return {
    label: oneLine(w.key),
    percent: Math.round(w.utilization * 100),
    color: windowColor(w.key, keys, isDark.value),
    countdown: formatCountdown(w.resetsAt, props.now),
  }
})
</script>

<template>
  <article
    class="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    :style="{ borderLeft: `4px solid ${account.color}` }"
  >
    <header class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold">{{ account.name }}</h3>
        <p v-if="summary" class="flex items-center gap-1 text-xs text-slate-500">
          {{ summary.label }} · {{ t('dashboard.resetsIn', { t: summary.countdown }) }}
          <InfoTip :text="t('help.summary')" />
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          class="text-xs"
          :class="state?.status === 'limited' ? 'font-medium text-red-600' : 'text-slate-500'"
        >
          {{ t(`dashboard.state.${state?.status ?? 'idle'}`) }}
        </span>
        <InfoTip :text="t('help.state')" />
      </div>
      <div v-if="summary" class="flex items-center gap-2 text-xl font-semibold tabular-nums">
        <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: summary.color }" />
        {{ summary.percent }} %
      </div>
    </header>
    <p v-if="state?.lastError" class="mt-1 text-xs text-red-600">{{ state.lastError }}</p>
    <p v-if="state?.status === 'limited'" class="mt-1 text-xs text-slate-500">{{ t('dashboard.limitedHint') }}</p>

    <template v-if="parsed">
      <p v-if="parsed.probe.fallbackUsed" class="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        {{ t('dashboard.fallback', { status: parsed.probe.primaryStatus ?? '?' }) }}
      </p>
      <div class="relative mt-3">
        <span class="absolute right-0 top-0"><InfoTip :text="t('help.rings')" /></span>
        <UsageRings
          :parsed="parsed"
          :now="now"
          :limited="state?.status === 'limited'"
          :primary-window="account.primaryWindow"
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
      <p v-if="parsed.usage" class="mt-1 text-xs text-slate-400">
        {{ t('dashboard.cost', { i: parsed.usage.inputTokens, o: parsed.usage.outputTokens }) }}
        <span v-if="parsed.probe.model"> · {{ t('dashboard.probeModel', { model: parsed.probe.model }) }}</span>
        <InfoTip :text="t('help.cost')" />
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
