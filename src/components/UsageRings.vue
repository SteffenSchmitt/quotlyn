<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ParsedUsage } from '../api/usageParser'
import { useChartTheme } from '../lib/chartTheme'
import { ringStyle, windowColor, withAlpha } from '../lib/palette'
import {
  DEFAULT_THRESHOLDS,
  formatCountdown,
  levelFor,
  primaryWindowFor,
  type PrimaryWindow,
  type Thresholds,
} from '../lib/usageView'
import { useWindowLabels } from '../lib/windowLabels'
import { cyclePosition, type Forecast } from '../lib/forecast'
import { FORECAST_TONE_CLASS, forecastTone } from '../lib/forecastText'

use([GaugeChart, TooltipComponent, CanvasRenderer])

const props = withDefaults(
  defineProps<{
    parsed: ParsedUsage
    now: number
    limited?: boolean
    thresholds?: Thresholds
    primaryWindow?: PrimaryWindow
    forecasts?: Record<string, Forecast | null>
  }>(),
  { limited: false, thresholds: () => DEFAULT_THRESHOLDS, primaryWindow: 'critical' },
)
const { t } = useI18n()
const { lines, tag } = useWindowLabels()
const theme = useChartTheme()

const RING_WIDTH = 11
const RING_STEP = 24
const HOVER_GLOW = 18
/** Thin cycle-clock arc inside each ring: radius offset in % and width in px. */
const CLOCK_OFFSET = 9
const CLOCK_WIDTH = 4
const CLOCK_ON = { dark: '#f8fafc', light: '#0f172a' }
const CLOCK_REST = { dark: 'rgba(248,250,252,0.18)', light: 'rgba(15,23,42,0.14)' }
/** Metric arcs sit at 85 % opacity so the solid, full-contrast clock stands apart from them. */
const METRIC_ALPHA = 0.85

/** Solid cycle clock as gauge axis segments: full contrast up to the forecast position, faint rest. */
function clockSegments(position: number | null, dark: boolean): Array<[number, string]> {
  if (position === null) return [[1, 'transparent']]
  const on = CLOCK_ON[dark ? 'dark' : 'light']
  const rest = CLOCK_REST[dark ? 'dark' : 'light']
  return position >= 1 ? [[1, on]] : [[position, on], [1, rest]]
}

/** Key of the window whose ring is hovered, in the chart or in the legend. */
const hoverKey = ref<string | null>(null)

/** Series 0..n-1 are the rings, n.. are the forecast ghosts drawn beneath them. */
function ringAt(seriesIndex: number | undefined) {
  if (seriesIndex === undefined) return undefined
  const n = rings.value.length
  return rings.value[seriesIndex < n ? seriesIndex : seriesIndex - n]
}

function onChartHover(params: { seriesIndex?: number } | null) {
  hoverKey.value = ringAt(params?.seriesIndex)?.key ?? null
}


const rings = computed(() => {
  const keys = props.parsed.windows.map((w) => w.key)
  return props.parsed.windows.map((w, i) => {
    const base = windowColor(w.key, keys, theme.value.dark)
    const level = levelFor(w.utilization, props.thresholds)
    const style = ringStyle(base, level, theme.value.dark)
    const [short, scope] = lines(w.key)
    const forecast = props.forecasts?.[w.key] ?? null
    const percent = Math.min(100, Math.round(w.utilization * 100))
    // Cycle clock: a thin arc from the last reset (0) to the next (100 %), ending where the window runs out.
    const ghost = forecast ? Math.round(cyclePosition(forecast) * 100) : null
    const forecastText = forecast
      ? forecast.current >= 1
        ? t('dashboard.forecast.short.exhausted')
        : forecast.beforeReset
          ? t('dashboard.forecast.short.exhausts', { t: formatCountdown(forecast.exhaustsAt, props.now) })
          : t('dashboard.forecast.short.lasts', { p: Math.round(forecast.atReset * 100) })
      : null
    return {
      forecast,
      ghost,
      forecastText,
      forecastClass: forecast ? FORECAST_TONE_CLASS[forecastTone(forecast, props.now)] : '',
      key: w.key,
      short,
      scope,
      tag: tag(w.key),
      percent,
      countdown: formatCountdown(w.resetsAt, props.now),
      level,
      base,
      style,
      radius: 100 - i * RING_STEP,
    }
  })
})

const headline = computed(() => {
  const w = primaryWindowFor(props.parsed, props.primaryWindow)
  return w ? { key: w.key, percent: Math.round(w.utilization * 100) } : null
})

const option = computed(() => ({
  textStyle: { fontFamily: theme.value.font },
  animationDuration: 600,
  animationEasing: 'cubicOut' as const,
  tooltip: {
    ...theme.value.tooltip,
    trigger: 'item',
    confine: true,
    formatter: (params: { seriesIndex: number }) => {
      const r = ringAt(params.seriesIndex)
      if (!r) return ''
      const label = r.scope ? `${r.short} ${r.scope}` : r.short
      const forecast = r.forecastText ? `<br/>${t('dashboard.forecast.label')}: ${r.forecastText}` : ''
      return `<b>${label}</b><br/>${r.percent} % · ${t('dashboard.resetsIn', { t: r.countdown })}${forecast}`
    },
  },
  series: [...rings.value.map((r, i) => ({
    z: 3,
    type: 'gauge',
    startAngle: 225,
    endAngle: -45,
    min: 0,
    max: 100,
    radius: `${r.radius}%`,
    center: ['50%', '54%'],
    progress: {
      show: true,
      width: RING_WIDTH,
      roundCap: true,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 1,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: withAlpha(r.base, 0.55 * METRIC_ALPHA) },
            { offset: 1, color: withAlpha(r.base, METRIC_ALPHA) },
          ],
        },
        shadowBlur: hoverKey.value === r.key ? Math.max(HOVER_GLOW, r.style.glow) : r.style.glow,
        shadowColor: hoverKey.value === r.key ? r.base : r.style.glowColor,
      },
    },
    axisLine: { lineStyle: { width: RING_WIDTH, color: [[1, r.style.track]] } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    pointer: { show: false },
    title: { show: false },
    detail: i === 0 && headline.value !== null
      ? {
          valueAnimation: true,
          formatter: () => `${headline.value!.percent} %`,
          fontSize: 18,
          fontWeight: 600,
          color: theme.value.text,
          offsetCenter: [0, '-6%'],
          rich: {},
        }
      : { show: false },
    data: [{ value: r.percent }],
  })), ...rings.value.map((r) => ({
    // Forecast cycle clock just inside the ring; an empty series keeps the indices stable when there is none.
    type: 'gauge',
    z: 2,
    startAngle: 225,
    endAngle: -45,
    min: 0,
    max: 100,
    radius: `${r.radius - CLOCK_OFFSET}%`,
    center: ['50%', '54%'],
    silent: r.ghost === null,
    // progress.show must not toggle between renders (ECharts' gauge diff throws); the clock is drawn
    // by the axis segments alone, so progress stays off for good.
    progress: { show: false },
    axisLine: { lineStyle: { width: CLOCK_WIDTH, color: clockSegments(r.ghost === null ? null : r.ghost / 100, theme.value.dark) } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    pointer: { show: false },
    title: { show: false },
    detail: { show: false },
    data: [{ value: r.ghost ?? 0 }],
  }))],
}))
</script>

<template>
  <div class="flex items-center gap-4">
    <VChart
      :option="option"
      autoresize
      :style="{ width: '168px', height: '168px', flex: '0 0 auto' }"
      @mouseover="onChartHover"
      @mouseout="onChartHover(null)"
    />
    <ul class="@container min-w-0 flex-1 space-y-2 text-sm">
      <li
        v-for="r in rings"
        :key="r.key"
        class="flex flex-wrap items-center gap-x-2 rounded px-1 -mx-1"
        :class="hoverKey === r.key ? 'bg-slate-100 dark:bg-slate-800' : ''"
        @mouseenter="hoverKey = r.key"
        @mouseleave="hoverKey = null"
      >
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="limited && r.percent >= 100 ? 'motion-safe:animate-pulse' : ''"
          :style="{ backgroundColor: r.base, boxShadow: r.style.glow ? `0 0 ${r.style.glow}px ${r.style.glowColor}` : 'none' }"
        />
        <span class="min-w-0 flex-1 whitespace-nowrap">
          <span class="font-bold">{{ r.short }}</span>
          <span v-if="r.tag" class="ml-1 hidden text-slate-500 @[14.5rem]:inline">{{ r.tag }}</span>
        </span>
        <span class="tabular-nums" :class="headline && headline.key === r.key ? 'font-bold' : ''">{{ r.percent }} %</span>
        <span class="w-16 text-right text-xs text-slate-500 tabular-nums" :title="t('dashboard.resetsIn', { t: r.countdown })">
          {{ r.countdown }}
        </span>
        <!-- Always present so every card's legend has the same height, forecast or not. -->
        <span class="h-4 basis-full truncate pl-[18px] text-[11px] leading-4" :class="r.forecastClass">{{ r.forecastText }}</span>
      </li>
    </ul>
  </div>
</template>
