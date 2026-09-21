<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { RANGES, rangeSince, resetMarkersFor, seriesFor, windowKeysIn, type Range } from '../lib/historySeries'
import type { UsageSnapshot } from '../storage/historyDb'
import { useAccountsStore } from '../stores/accounts'
import { useUsageStore } from '../stores/usage'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer])

const { t } = useI18n()
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

const option = computed(() => ({
  tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => (v === null ? '–' : `${v} %`) },
  legend: { top: 0 },
  grid: { left: 48, right: 24, top: 40, bottom: 70 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value} %' } },
  dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 10 }],
  series: accounts.accounts
    .filter((a) => selected.value.has(a.id))
    .map((a) => ({
      name: a.name,
      type: 'line',
      showSymbol: true,
      symbolSize: 5,
      connectNulls: false,
      itemStyle: { color: a.color },
      lineStyle: { color: a.color, width: 2 },
      data: seriesFor(data.value[a.id] ?? [], windowKey.value),
      markLine: {
        symbol: 'none',
        silent: true,
        label: { show: false },
        lineStyle: { color: a.color, type: 'dashed', opacity: 0.6 },
        data: resetMarkersFor(data.value[a.id] ?? [], windowKey.value).map((iso) => ({ xAxis: iso })),
      },
    })),
}))
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">{{ t('history.title') }}</h2>
    <div class="flex flex-wrap items-center gap-6 text-sm">
      <label class="flex items-center gap-2">
        {{ t('history.window') }}
        <select v-model="windowKey" class="rounded border px-2 py-1">
          <option v-for="k in windowKeys" :key="k" :value="k">{{ k }}</option>
        </select>
      </label>
      <div class="flex items-center gap-2">
        {{ t('history.range') }}
        <button
          v-for="r in RANGES"
          :key="r"
          class="rounded border px-2 py-1"
          :class="range === r ? 'bg-slate-800 text-white' : ''"
          @click="range = r"
        >
          {{ t(`history.range${r}`) }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        {{ t('history.accounts') }}
        <label v-for="a in accounts.accounts" :key="a.id" class="flex items-center gap-1">
          <input type="checkbox" :checked="selected.has(a.id)" @change="toggle(a.id)" />
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: a.color }" />
          {{ a.name }}
        </label>
      </div>
    </div>
    <div class="rounded-lg border bg-white p-2">
      <VChart v-if="hasData" :option="option" autoresize :style="{ height: '420px', width: '100%' }" />
      <p v-else class="p-6 text-sm text-slate-500">{{ t('history.empty') }}</p>
    </div>
  </section>
</template>
