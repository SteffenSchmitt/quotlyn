<script setup lang="ts">
import InfoTip from './InfoTip.vue'
import StatusDot from './StatusDot.vue'
import { useI18n } from 'vue-i18n'
import type { Account } from '../stores/accounts'
import type { ParsedUsage } from '../api/usageParser'
import type { AccountPollState } from '../scheduler/poller'
import { computed, ref } from 'vue'
import {
  accountStatus,
  claimWindowKey,
  DEFAULT_THRESHOLDS,
  formatCountdown,
  humanizeToken,
  levelColor,
  primaryWindowFor,
  type Thresholds,
} from '../lib/usageView'
import { windowColor } from '../lib/palette'
import { isDark } from '../lib/theme'
import { useWindowLabels } from '../lib/windowLabels'
import UsageRings from './UsageRings.vue'
import RawDataView from './RawDataView.vue'

const props = withDefaults(
  defineProps<{ account: Account; parsed?: ParsedUsage; state?: AccountPollState; thresholds?: Thresholds; now: number }>(),
  { thresholds: () => DEFAULT_THRESHOLDS },
)
const { t, te, d } = useI18n()
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

const NONE_COLOR = '#94a3b8'

/** Traffic light on the right edge: worst window decides, limit reached is always red. */
const status = computed(() => accountStatus(props.parsed, props.thresholds, props.state?.status))
const statusColor = computed(() => (status.value.level === 'none' ? NONE_COLOR : levelColor(status.value.level)))
const statusLines = computed(() => {
  const { level, window, limited } = status.value
  const pct = (n: number) => Math.round(n * 100)
  const head = limited
    ? t('dashboard.status.limited')
    : level === 'none'
      ? t('dashboard.status.none')
      : level === 'ok'
        ? t('dashboard.status.ok', { threshold: pct(props.thresholds.warn) })
        : t(`dashboard.status.${level}`, {
            window: oneLine(window!.key),
            percent: pct(window!.utilization),
            threshold: pct(props.thresholds[level]),
          })
  const others = (props.parsed?.windows ?? [])
    .filter((w) => limited || level === 'ok' || w.key !== window?.key)
    .map((w) => `${oneLine(w.key)} ${pct(w.utilization)} %`)
  return others.length ? [head, t('dashboard.status.others'), ...others] : [head]
})
const statusOpen = ref(false)

/** Plain-language API verdict; raw header values stay in the raw data view. */
const apiStatus = computed(() => {
  const v = props.parsed?.overall.status
  if (!v) return null
  return te(`dashboard.apiStatus.${v}`) ? t(`dashboard.apiStatus.${v}`) : humanizeToken(v)
})
const bindingWindow = computed(() => {
  const c = props.parsed?.overall.representativeClaim
  if (!c) return null
  const key = claimWindowKey(c)
  if (key) return oneLine(key)
  return te(`dashboard.claim.${c}`) ? t(`dashboard.claim.${c}`) : humanizeToken(c)
})
</script>

<template>
  <article
    class="relative rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    :style="{ borderLeft: `4px solid ${account.color}`, borderRight: `4px solid ${statusColor}` }"
  >
    <div
      class="absolute -right-1 inset-y-0 w-4 cursor-help rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      tabindex="0"
      role="img"
      :aria-label="`${t('dashboard.status.label')}: ${statusLines.join(' ')}`"
      @mouseenter="statusOpen = true"
      @mouseleave="statusOpen = false"
      @focus="statusOpen = true"
      @blur="statusOpen = false"
    >
      <span
        v-if="statusOpen"
        role="tooltip"
        class="absolute right-2 top-3 z-20 w-max max-w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
      >
        <span v-for="(line, i) in statusLines" :key="i" class="block" :class="i === 1 ? 'mt-1 opacity-80' : i > 1 ? 'pl-2 opacity-80' : ''">{{ line }}</span>
      </span>
    </div>
    <header>
      <div class="flex items-start gap-3">
        <h3 class="min-w-0 flex-1 truncate font-bold">{{ account.name }}</h3>
        <div v-if="summary" class="flex items-center gap-2 text-xl font-bold tabular-nums">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: summary.color }" />
          {{ summary.percent }} %
        </div>
      </div>
      <p v-if="summary" class="flex items-center text-xs text-slate-500">
        <span class="min-w-0 truncate">{{ summary.label }} · {{ t('dashboard.resetsIn', { t: summary.countdown }) }}</span>
        <InfoTip :text="t('help.summary')" />
      </p>
    </header>
    <p v-if="state?.lastError" class="mt-1 text-xs text-red-600">{{ state.lastError }}</p>
    <p v-if="state?.status === 'limited'" class="mt-1 text-xs text-slate-500">{{ t('dashboard.limitedHint') }}</p>

    <template v-if="parsed">
      <p v-if="parsed.probe.fallbackUsed" class="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        {{ t('dashboard.fallback', { status: parsed.probe.primaryStatus ?? '?' }) }}
      </p>
      <UsageRings
        class="mt-3"
        :parsed="parsed"
        :now="now"
        :limited="state?.status === 'limited'"
        :thresholds="thresholds"
        :primary-window="account.primaryWindow"
      />
      <p class="mt-2 h-4 truncate text-xs leading-4 text-slate-500">
        {{ apiStatus ?? '–' }}<span v-if="bindingWindow"> · {{ t('dashboard.binding', { window: bindingWindow }) }}</span>
      </p>
      <p class="mt-1 flex h-4 items-center text-xs leading-4 text-slate-400">
        <span class="min-w-0 truncate">
          <template v-if="parsed.usage">
            {{ t('dashboard.cost', { i: parsed.usage.inputTokens, o: parsed.usage.outputTokens }) }}
            <span v-if="parsed.probe.model"> · {{ t('dashboard.probeModel', { model: parsed.probe.model }) }}</span>
          </template>
          <template v-else>–</template>
        </span>
        <InfoTip :text="t('help.cost')" />
      </p>
      <RawDataView :raw="parsed.raw" />
    </template>
    <p v-else class="mt-3 text-sm text-slate-400">{{ t('dashboard.noData') }}</p>

    <p class="mt-2 flex items-center text-xs text-slate-400">
      <span class="min-w-0 flex-1 truncate">
        {{
          state?.lastFetchedAt
            ? t('dashboard.lastFetched', { time: d(new Date(state.lastFetchedAt), 'time') })
            : t('dashboard.never')
        }}
      </span>
      <StatusDot :status="state?.status" />
      <span class="ml-1.5" :class="state?.status === 'limited' ? 'font-bold text-red-600' : 'text-slate-500'">
        {{ t(`dashboard.state.${state?.status ?? 'idle'}`) }}
      </span>
      <InfoTip :text="t('help.state')" />
    </p>
  </article>
</template>
