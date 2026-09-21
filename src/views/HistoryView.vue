<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { RANGES, rangeSince, resetMarkersFor, resetZones, seriesFor, windowKeysIn, type Range } from '../lib/historySeries'
import { useChartTheme } from '../lib/chartTheme'
import { withAlpha } from '../lib/palette'
import type { UsageSnapshot } from '../storage/historyDb'
import { useAccountsStore } from '../stores/accounts'
import { useUsageStore } from '../stores/usage'
import { useWindowLabels } from '../lib/windowLabels'

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
])

const { t, d } = useI18n()
const { oneLine: windowLabel } = useWindowLabels()
const theme = useChartTheme()
const accounts = useAccountsStore()
const usage = useUsageStore()

const range = ref<Range>('24h')
const windowKey = ref('5h')
const selected = ref<Set<string>>(new Set(accounts.accounts.map((a) => a.id)))
const data = ref<Record<string, UsageSnapshot[]>>({})

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function load() {
  const db = usage.history()
  if (!db) return
  const since = rangeSince(range.value, Date.now())
  const next: Record<string, UsageSnapshot[]> = {}
  for (const a of accounts.accounts) {
    if (selected.value.has(a.id)) next[a.id] = await db.list(a.id, since)
  }
  data.value = next
}

watch([range, selected, () => accounts.accounts.length, () => Object.values(usage.lastSnapshot)], load, {
  immediate: true,
  deep: true,
})

const windowKeys = computed(() => {
  const keys = windowKeysIn(Object.values(data.value).flat())
  if (keys.length && !keys.includes(windowKey.value)) windowKey.value = keys[0]!
  return keys
})

const hasData = computed(() => Object.values(data.value).some((l) => l.length > 0))

const option = computed(() => {
  const th = theme.value
  const since = rangeSince(range.value, Date.now())
  const nowIso = new Date().toISOString()
  const selectedAccounts = accounts.accounts.filter((a) => selected.value.has(a.id))
  return {
    backgroundColor: 'transparent',
    textStyle: { color: th.text, fontFamily: th.font },
    tooltip: {
      trigger: 'axis',
      ...th.tooltip,
      axisPointer: { type: 'line', lineStyle: { color: th.axisLine } },
      valueFormatter: (v: number | null) => (v === null ? '–' : `${v} %`),
    },
    legend: { top: 0, textStyle: { color: th.muted }, icon: 'roundRect', itemWidth: 14, itemHeight: 4 },
    grid: { left: 48, right: 24, top: 40, bottom: 70 },
    xAxis: {
      type: 'time',
      min: since,
      max: nowIso,
      axisLine: { lineStyle: { color: th.axisLine } },
      axisLabel: { color: th.muted },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: th.muted, formatter: '{value} %' },
      splitLine: { lineStyle: { color: th.grid, type: 'dashed' } },
    },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', bottom: 10, borderColor: th.grid, fillerColor: th.zone, textStyle: { color: th.muted } },
    ],
    series: selectedAccounts.map((a, idx) => {
      const snaps = data.value[a.id] ?? []
      const markers = resetMarkersFor(snaps, windowKey.value)
      return {
        name: a.name,
        type: 'line',
        smooth: 0.35,
        showSymbol: true,
        symbolSize: 5,
        connectNulls: false,
        itemStyle: { color: a.color },
        lineStyle: { color: a.color, width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(a.color, 0.28) },
              { offset: 1, color: withAlpha(a.color, 0) },
            ],
          },
        },
        emphasis: { focus: 'series' },
        data: seriesFor(snaps, windowKey.value),
        // Reset zones only for the first selected account keep the background calm.
        markArea:
          idx === 0
            ? {
                silent: true,
                itemStyle: { color: th.zone },
                data: resetZones(markers, since, nowIso).map(([from, to]) => [{ xAxis: from }, { xAxis: to }]),
              }
            : undefined,
        markLine: {
          symbol: ['none', 'none'],
          silent: true,
          lineStyle: { color: a.color, type: 'dashed', opacity: 0.55, width: 1 },
          label: {
            show: idx === 0,
            position: 'insideEndTop',
            color: th.muted,
            fontSize: 10,
            formatter: (p: { value: string }) => d(new Date(p.value), 'time'),
          },
          data: markers.map((iso) => ({ xAxis: iso })),
        },
      }
    }),
  }
})
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-bold">{{ t('history.title') }}</h2>
    <div class="flex flex-wrap items-center gap-6 text-sm">
      <label class="flex items-center gap-2">
        <span>{{ t('history.window') }}<InfoTip :text="t('help.historyWindow')" /></span>
        <select v-model="windowKey" class="field w-auto">
          <option v-for="k in windowKeys" :key="k" :value="k">{{ windowLabel(k) }}</option>
        </select>
      </label>
      <div class="flex items-center gap-2">
        <span>{{ t('history.range') }}<InfoTip :text="t('help.historyRange')" /></span>
        <button
          v-for="r in RANGES"
          :key="r"
          :class="range === r ? 'btn-primary' : 'btn-secondary'"
          @click="range = r"
        >
          {{ t(`history.range${r}`) }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('history.accounts') }}<InfoTip :text="t('help.historyAccounts')" /></span>
        <label v-for="a in accounts.accounts" :key="a.id" class="flex items-center gap-1">
          <input type="checkbox" :checked="selected.has(a.id)" @change="toggle(a.id)" />
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: a.color }" />
          {{ a.name }}
        </label>
      </div>
    </div>
    <div class="rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-2">
      <VChart v-if="hasData" :option="option" autoresize :style="{ height: '420px', width: '100%' }" />
      <p v-else class="p-6 text-sm text-slate-500">{{ t('history.empty') }}</p>
    </div>
  </section>
</template>
