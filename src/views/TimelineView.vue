<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CustomChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useChartTheme } from '../lib/chartTheme'
import { windowColor, withAlpha } from '../lib/palette'
import { formatCountdown } from '../lib/usageView'
import { barLabel, sortBars, timelineBars, TIMELINE_SORTS, type TimelineBar, type TimelineSort } from '../lib/timelineBars'
import { useWindowLabels } from '../lib/windowLabels'
import { useAccountsStore } from '../stores/accounts'
import { billingFor } from '../lib/accountMeta'
import { useUsageStore } from '../stores/usage'
import { useSettingsStore } from '../stores/settings'

use([CustomChart, GridComponent, TooltipComponent, CanvasRenderer])

const { t, d } = useI18n()
const { oneLine } = useWindowLabels()
const theme = useChartTheme()
const accounts = useAccountsStore()
const usage = useUsageStore()
const settings = useSettingsStore()

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

/** Same treatment as the rings: metric at 85 % opacity, the forecast as a solid full-contrast time line. */
const METRIC_ALPHA = 0.85
const CLOCK_HEIGHT = 3
const CLOCK_ON = { dark: '#f8fafc', light: '#0f172a' }
const CLOCK_REST = { dark: 'rgba(248,250,252,0.18)', light: 'rgba(15,23,42,0.14)' }

const NAME_COL = 200
/** Room to the right of the bars for "44 % · resets in 6d 22h". */
const END_LABEL = 190
const WINDOW_COL = 120
const LABEL_GUTTER = 12

function truncate(text: string, max = 28): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const model = computed(() => {
  const built = timelineBars(
    accounts.accounts.map((a) => ({ id: a.id, name: a.name, billing: billingFor(a, 'elsewhere') })),
    usage.latest,
    now.value,
    (name, key) => `${name}\u0001${oneLine(key)}`,
    (id, key) => usage.forecastFor(id, key, now.value),
  )
  return sortBars(built.rows, built.bars, settings.settings.timelineSort)
})
const allKeys = computed(() => [...new Set(model.value.bars.map((b) => b.windowKey))])
const hasData = computed(() => model.value.bars.length > 0)

const option = computed(() => {
  const th = theme.value
  const { rows, bars } = model.value
  const colorOf = (b: TimelineBar) => windowColor(b.windowKey, allKeys.value, th.dark)
  // Every bar spans the full width: the bar is the window's capacity, the fill its utilization.
  // The time line beneath runs from now (left) to the reset (right).
  const countdown = (b: TimelineBar) => formatCountdown(new Date(b.endMs).toISOString(), now.value)
  return {
    backgroundColor: 'transparent',
    textStyle: { color: th.text, fontFamily: th.font },
    tooltip: {
      ...th.tooltip,
      formatter: (p: { data: TimelineBar }) =>
        `${p.data.accountName} · ${oneLine(p.data.windowKey)}<br/>` +
        (p.data.billing ? `${t('dashboard.billingTip', { value: p.data.billing })}<br/>` : '') +
        `${barLabel(p.data.utilization, countdown(p.data), (k, pr) => t(k, pr ?? {}))}<br/>` +
        d(new Date(p.data.endMs), 'datetime') +
        (p.data.exhaustsAtMs !== null
          ? `<br/>${t('timeline.exhausts', { time: d(new Date(p.data.exhaustsAtMs), 'datetime') })}`
          : ''),
    },
    grid: { left: LABEL_GUTTER + NAME_COL + WINDOW_COL, right: END_LABEL, top: 16, bottom: 36 },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      interval: 0.25,
      axisLine: { lineStyle: { color: th.axisLine } },
      axisLabel: { color: th.muted, formatter: (v: number) => `${Math.round(v * 100)} %` },
      splitLine: { lineStyle: { color: th.grid, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.label),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        // Two left-aligned columns starting at a fixed left edge, like a table.
        align: 'left',
        margin: NAME_COL + WINDOW_COL,
        color: th.text,
        fontSize: 12,
        formatter: (value: string) => {
          const [name = '', win = ''] = value.split('\u0001')
          return `{name|${truncate(name)}}{win|${win}}`
        },
        rich: {
          name: { width: NAME_COL, align: 'left', color: th.text, fontSize: 12 },
          win: { width: WINDOW_COL, align: 'left', color: th.muted, fontSize: 12 },
        },
      },
    },
    series: [
      {
        type: 'custom',
        data: bars.map((b) => ({ ...b, value: [0, 1, b.row] })),
        encode: { x: [0, 1], y: 2 },
        renderItem: (
          params: { dataIndex: number },
          api: { coord: (v: [number, number]) => [number, number]; size: (v: [number, number]) => [number, number] },
        ) => {
          const bar = bars[params.dataIndex]
          if (!bar) return null
          const [x0, y] = api.coord([0, bar.row])
          const [x1] = api.coord([1, bar.row])
          const span = Math.max(1, bar.endMs - bar.startMs)
          const height = Math.min(18, api.size([0, 1])[1] * 0.5)
          const width = Math.max(2, x1 - x0)
          const fill = Math.max(0, Math.min(1, bar.utilization)) * width
          const color = colorOf(bar)
          // Forecast time line under the bar: solid up to the expected exhaustion, faint for the rest;
          // solid all the way when the window lasts until the reset. Nothing without a forecast.
          const clockY = y + height / 2 + 2
          const on = CLOCK_ON[th.dark ? 'dark' : 'light']
          const rest = CLOCK_REST[th.dark ? 'dark' : 'light']
          const clock =
            bar.exhaustsAtMs !== null
              ? (() => {
                  const xe = x0 + ((bar.exhaustsAtMs - bar.startMs) / span) * (x1 - x0)
                  return [
                    { type: 'rect', shape: { x: x0, y: clockY, width: Math.max(0, x1 - x0), height: CLOCK_HEIGHT, r: 1.5 }, style: { fill: rest } },
                    { type: 'rect', shape: { x: x0, y: clockY, width: Math.max(2, xe - x0), height: CLOCK_HEIGHT, r: 1.5 }, style: { fill: on } },
                  ]
                })()
              : bar.lasts
                ? [{ type: 'rect', shape: { x: x0, y: clockY, width: Math.max(2, x1 - x0), height: CLOCK_HEIGHT, r: 1.5 }, style: { fill: on } }]
                : []
          return {
            type: 'group',
            children: [
              { type: 'rect', shape: { x: x0, y: y - height / 2, width, height, r: height / 2 }, style: { fill: withAlpha(color, 0.18) } },
              {
                type: 'rect',
                shape: { x: x0, y: y - height / 2, width: fill, height, r: height / 2 },
                style: {
                  fill: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 1,
                    y2: 0,
                    colorStops: [
                      { offset: 0, color: withAlpha(color, 0.55 * METRIC_ALPHA) },
                      { offset: 1, color: withAlpha(color, METRIC_ALPHA) },
                    ],
                  },
                },
              },
              {
                type: 'text',
                style: {
                  x: x0 + width + 8,
                  y,
                  text: barLabel(bar.utilization, countdown(bar), (k, p) => t(k, p ?? {})),
                  fill: th.muted,
                  fontSize: 11,
                  verticalAlign: 'middle',
                },
              },
              ...clock,
            ],
          }
        },
      },
    ],
  }
})
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 class="flex items-center text-lg font-bold">{{ t('timeline.title') }}<InfoTip :text="t('help.timeline')" /></h2>
      <select
        :value="settings.settings.timelineSort"
        class="select"
        :aria-label="t('timeline.sort.label')"
        @change="settings.update({ timelineSort: ($event.target as HTMLSelectElement).value as TimelineSort })"
      >
        <option v-for="s in TIMELINE_SORTS" :key="s" :value="s">{{ t('timeline.sort.label') }}: {{ t(`timeline.sort.${s}`) }}</option>
      </select>
    </div>
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
