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
import type { Forecast } from '../lib/forecast'
import { FORECAST_TONE_CLASS, forecastLine, forecastTone } from '../lib/forecastText'
import UsageRings from './UsageRings.vue'
import RawDataView from './RawDataView.vue'
import { billingFor, usedByLines } from '../lib/accountMeta'
import { USED_BY_OPEN_KEY, readJson, writeJson } from '../storage/localStore'

const props = withDefaults(
  defineProps<{
    account: Account
    parsed?: ParsedUsage
    state?: AccountPollState
    thresholds?: Thresholds
    /** Forecast per window key, from the usage store. */
    forecasts?: Record<string, Forecast | null>
    /** Recommendation stars: for the session (now) and for the week. */
    starNow?: boolean
    starWeek?: boolean
    /** Keep an empty line where the billing account goes, so cards in a row stay aligned. */
    reserveBillingLine?: boolean
    now: number
  }>(),
  { thresholds: () => DEFAULT_THRESHOLDS },
)
const emit = defineEmits<{ refresh: [] }>()
const { t, te, d } = useI18n()
const { oneLine } = useWindowLabels()

const billing = computed(() => billingFor(props.account, 'dashboard'))
const usedBy = computed(() => usedByLines(props.account))

/** The unfolded cards, remembered per account in this browser. */
function readOpen(): Record<string, boolean> {
  try {
    return readJson<Record<string, boolean>>(localStorage, USED_BY_OPEN_KEY) ?? {}
  } catch {
    return {}
  }
}
const usedByOpen = ref(readOpen()[props.account.id] === true)
function toggleUsedBy() {
  usedByOpen.value = !usedByOpen.value
  try {
    writeJson(localStorage, USED_BY_OPEN_KEY, { ...readOpen(), [props.account.id]: usedByOpen.value })
  } catch {
    // A browser that refuses storage still gets a working toggle, it just forgets it.
  }
}

const summary = computed(() => {
  const w = primaryWindowFor(props.parsed, props.account.primaryWindow)
  if (!w) return null
  const keys = props.parsed!.windows.map((x) => x.key)
  return {
    label: oneLine(w.key),
    percent: Math.round(w.utilization * 100),
    color: windowColor(w.key, keys, isDark.value),
    countdown: formatCountdown(w.resetsAt, props.now),
    forecast: props.forecasts?.[w.key] ?? null,
  }
})
const forecastText = computed(() => {
  const f = summary.value?.forecast
  return f ? { text: forecastLine(f, props.now, (k, p) => t(k, p ?? {})), cls: FORECAST_TONE_CLASS[forecastTone(f, props.now)] } : null
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

/** Error, fallback or limit hint for the notice line; the most urgent one wins. */
const notice = computed(() => {
  if (props.state?.lastError) {
    const time = props.state.lastFetchedAt ? d(new Date(props.state.lastFetchedAt), 'time') : '–'
    return { text: t('dashboard.attemptFailed', { time, error: props.state.lastError }), cls: 'text-red-600 dark:text-red-400' }
  }
  if (props.parsed?.probe.fallbackUsed) {
    // The rejected window rides along with the fallback answer; without it only the shared windows are left.
    const carried = props.parsed.windows.some((w) => w.status === 'rejected')
    const key = carried ? 'dashboard.fallback' : 'dashboard.fallbackPartial'
    return { text: t(key, { status: props.parsed.probe.primaryStatus ?? '?' }), cls: 'text-red-600 dark:text-red-400' }
  }
  if (props.state?.status === 'limited') return { text: t('dashboard.limitedHint'), cls: 'text-slate-500' }
  return null
})

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
        <h3 class="flex min-w-0 flex-1 items-center gap-1.5 truncate font-bold">
          <span class="truncate">{{ account.name }}</span>
          <svg v-if="starNow" viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-amber-400" fill="currentColor" aria-hidden="true">
            <title>{{ t('dashboard.recommend.starNow') }}</title>
            <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z" />
          </svg>
          <svg v-if="starWeek" viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-sky-400" fill="currentColor" aria-hidden="true">
            <title>{{ t('dashboard.recommend.starWeek') }}</title>
            <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z" />
          </svg>
        </h3>
        <div v-if="summary" class="flex items-center gap-2 text-xl font-bold tabular-nums">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: summary.color }" />
          {{ summary.percent }} %
        </div>
      </div>
      <p
        v-if="billing || reserveBillingLine"
        data-test="billing"
        class="h-4 truncate text-xs leading-4 text-slate-500"
        :title="billing ? t('dashboard.billingTip', { value: billing }) : undefined"
      >{{ billing }}</p>
      <p v-if="summary" class="flex items-center text-xs text-slate-500">
        <span class="min-w-0 truncate">{{ summary.label }} · {{ t('dashboard.resetsIn', { t: summary.countdown }) }}</span>
        <InfoTip :text="t('help.summary')" />
      </p>
      <!-- Forecast on its own line; the line is always there so cards keep the same height. -->
      <p v-if="summary" class="h-4 truncate text-xs leading-4" :class="forecastText?.cls">
        {{ forecastText?.text }}
      </p>
    </header>
    <!-- One reserved line for the last error, the fallback warning or the limit hint, so cards stay aligned. -->
    <p class="mt-1 h-4 truncate text-xs leading-4" :class="notice?.cls" :title="notice?.text">{{ notice?.text }}</p>

    <template v-if="parsed">
      <UsageRings
        class="mt-3"
        :parsed="parsed"
        :now="now"
        :limited="state?.status === 'limited'"
        :thresholds="thresholds"
        :forecasts="forecasts"
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
          state?.lastOkAt
            ? t('dashboard.lastRead', { time: d(new Date(state.lastOkAt), 'time') })
            : t('dashboard.never')
        }}
      </span>
      <button
        type="button"
        class="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        :disabled="state?.status === 'fetching' || state?.status === 'disabled'"
        :aria-label="t('dashboard.refreshAccount')"
        :title="t('dashboard.refreshAccount')"
        @click="emit('refresh')"
      >
        <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16.5 8.5A6.5 6.5 0 0 0 4.9 6.1M3.5 11.5a6.5 6.5 0 0 0 11.6 2.4" />
          <path d="M16.5 3.5v5h-5M3.5 16.5v-5h5" />
        </svg>
      </button>
      <StatusDot :status="state?.status" />
      <span class="ml-1.5" :class="state?.status === 'limited' ? 'font-bold text-red-600' : 'text-slate-500'">
        {{ t(`dashboard.state.${state?.status ?? 'idle'}`) }}
      </span>
      <InfoTip :text="t('help.state')" />
    </p>

    <template v-if="usedBy.length">
      <button
        type="button"
        data-test="used-by-toggle"
        class="mt-1 flex w-full items-center gap-1 text-left text-xs text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:text-slate-200"
        :aria-expanded="usedByOpen"
        @click="toggleUsedBy"
      >
        <svg
          viewBox="0 0 20 20"
          class="h-3 w-3 shrink-0 transition-transform"
          :class="usedByOpen ? 'rotate-90' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M7.5 4.5l6 5.5-6 5.5" />
        </svg>
        <span class="truncate">{{ t('dashboard.usedBy') }}</span>
      </button>
      <ul v-if="usedByOpen" class="mt-0.5 space-y-0.5 pl-4 text-xs text-slate-400">
        <li v-for="(line, i) in usedBy" :key="i" class="truncate" :title="line">{{ line }}</li>
      </ul>
    </template>
  </article>
</template>
