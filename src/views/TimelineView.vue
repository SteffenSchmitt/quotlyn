<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { ScatterChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { levelColor, levelFor } from '../lib/usageView'
import { useAccountsStore } from '../stores/accounts'
import { useUsageStore } from '../stores/usage'

use([ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

const { t, d } = useI18n()
const accounts = useAccountsStore()
const usage = useUsageStore()

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onUnmounted(() => {
  if (tick) clearInterval(tick)
})

interface Point {
  value: [string, string]
  key: string
  utilization: number
  color: string
  border: string
  symbolSize: number
}

const points = computed<Point[]>(() =>
  accounts.accounts.flatMap((a) =>
    (usage.latest[a.id]?.windows ?? [])
      .filter((w) => w.resetsAt)
      .map((w) => ({
        value: [w.resetsAt!, a.name] as [string, string],
        key: w.key,
        utilization: w.utilization,
        color: levelColor(levelFor(w.utilization)),
        border: a.color,
        symbolSize: 10 + Math.round(Math.min(1, w.utilization) * 14),
      })),
  ),
)

const hasData = computed(() => points.value.length > 0)

const option = computed(() => {
  const times = points.value.map((p) => Date.parse(p.value[0]))
  const max = Math.max(now.value, ...times)
  return {
    tooltip: {
      formatter: (p: { data: Point }) =>
        `${p.data.value[1]} · ${p.data.key} · ${Math.round(p.data.utilization * 100)} %<br/>${d(new Date(p.data.value[0]), 'datetime')}`,
    },
    grid: { left: 120, right: 40, top: 20, bottom: 40 },
    xAxis: { type: 'time', min: now.value - 3_600_000, max: max + 3_600_000 },
    yAxis: { type: 'category', data: accounts.accounts.map((a) => a.name), inverse: true },
    series: [
      {
        type: 'scatter',
        data: points.value.map((p) => ({
          ...p,
          itemStyle: { color: p.color, borderColor: p.border, borderWidth: 2 },
          label: { show: true, position: 'top', formatter: `${p.key} · ${Math.round(p.utilization * 100)} %`, fontSize: 11 },
        })),
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: '#64748b', type: 'solid' },
          label: { formatter: t('timeline.now'), position: 'insideEndTop' },
          data: [{ xAxis: now.value }],
        },
      },
    ],
  }
})
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">{{ t('timeline.title') }}</h2>
    <div class="rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-2">
      <VChart
        v-if="hasData"
        :option="option"
        autoresize
        :style="{ height: `${80 + accounts.accounts.length * 70}px`, width: '100%' }"
      />
      <p v-else class="p-6 text-sm text-slate-500">{{ t('timeline.empty') }}</p>
    </div>
  </section>
</template>
