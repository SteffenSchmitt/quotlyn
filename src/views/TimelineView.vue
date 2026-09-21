<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CustomChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useChartTheme } from '../lib/chartTheme'
import { windowColor, withAlpha } from '../lib/palette'
import { formatCountdown } from '../lib/usageView'
import { timelineBars, type TimelineBar } from '../lib/timelineBars'
import { useWindowLabels } from '../lib/windowLabels'
import { useAccountsStore } from '../stores/accounts'
import { useUsageStore } from '../stores/usage'

use([CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

const { t, d } = useI18n()
const { oneLine } = useWindowLabels()
const theme = useChartTheme()
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

const model = computed(() =>
  timelineBars(accounts.accounts, usage.latest, now.value, (name, key) => `${name}  ·  ${oneLine(key)}`),
)
const allKeys = computed(() => [...new Set(model.value.bars.map((b) => b.windowKey))])
const hasData = computed(() => model.value.bars.length > 0)

const option = computed(() => {
  const th = theme.value
  const { rows, bars } = model.value
  const max = Math.max(now.value + 3_600_000, ...bars.map((b) => b.endMs))
  const colorOf = (b: TimelineBar) => windowColor(b.windowKey, allKeys.value, th.dark)
  return {
    backgroundColor: 'transparent',
    textStyle: { color: th.text },
    tooltip: {
      ...th.tooltip,
      formatter: (p: { data: TimelineBar }) =>
        `${p.data.accountName} · ${oneLine(p.data.windowKey)}<br/>` +
        `${Math.round(p.data.utilization * 100)} % · ${t('dashboard.resetsIn', { t: formatCountdown(new Date(p.data.endMs).toISOString(), now.value) })}<br/>` +
        d(new Date(p.data.endMs), 'datetime'),
    },
    grid: { left: 210, right: 40, top: 16, bottom: 36 },
    xAxis: {
      type: 'time',
      min: now.value - 1_800_000,
      max: max + 1_800_000,
      axisLine: { lineStyle: { color: th.axisLine } },
      axisLabel: { color: th.muted },
      splitLine: { lineStyle: { color: th.grid, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.label),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: th.text, fontSize: 12 },
    },
    series: [
      {
        type: 'custom',
        data: bars.map((b) => ({ ...b, value: [b.startMs, b.endMs, b.row] })),
        encode: { x: [0, 1], y: 2 },
        renderItem: (
          params: { dataIndex: number },
          api: { coord: (v: [number, number]) => [number, number]; size: (v: [number, number]) => [number, number] },
        ) => {
          const bar = bars[params.dataIndex]
          if (!bar) return null
          const [x0, y] = api.coord([bar.startMs, bar.row])
          const [x1] = api.coord([bar.endMs, bar.row])
          const height = Math.min(18, api.size([0, 1])[1] * 0.5)
          const width = Math.max(2, x1 - x0)
          const fill = Math.max(0, Math.min(1, bar.utilization)) * width
          const color = colorOf(bar)
          return {
            type: 'group',
            children: [
              { type: 'rect', shape: { x: x0, y: y - height / 2, width, height, r: height / 2 }, style: { fill: withAlpha(color, 0.18) } },
              { type: 'rect', shape: { x: x0, y: y - height / 2, width: fill, height, r: height / 2 }, style: { fill: color } },
              {
                type: 'text',
                style: {
                  x: x0 + width + 8,
                  y,
                  text: `${Math.round(bar.utilization * 100)} %`,
                  fill: th.muted,
                  fontSize: 11,
                  verticalAlign: 'middle',
                },
              },
            ],
          }
        },
        markLine: {
          symbol: ['none', 'none'],
          silent: true,
          lineStyle: { color: th.now, type: 'solid', width: 1 },
          label: { formatter: t('timeline.now'), position: 'insideEndTop', color: th.muted, fontSize: 10 },
          data: [{ xAxis: now.value }],
        },
      },
    ],
  }
})
</script>

<template>
  <section class="space-y-4">
    <h2 class="flex items-center gap-2 text-lg font-semibold">
      {{ t('timeline.title') }} <InfoTip :text="t('help.timeline')" />
    </h2>
    <div class="rounded-lg border bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
      <VChart
        v-if="hasData"
        :option="option"
        autoresize
        :style="{ height: `${60 + model.rows.length * 40}px`, width: '100%' }"
      />
      <p v-else class="p-6 text-sm text-slate-500">{{ t('timeline.empty') }}</p>
    </div>
  </section>
</template>
