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

use([GaugeChart, TooltipComponent, CanvasRenderer])

const props = withDefaults(
  defineProps<{ parsed: ParsedUsage; now: number; limited?: boolean; thresholds?: Thresholds; primaryWindow?: PrimaryWindow }>(),
  { limited: false, thresholds: () => DEFAULT_THRESHOLDS, primaryWindow: 'critical' },
)
const { t } = useI18n()
const { lines, tag } = useWindowLabels()
const theme = useChartTheme()

const RING_WIDTH = 11
const RING_STEP = 24
const HOVER_GLOW = 18

/** Key of the window whose ring is hovered, in the chart or in the legend. */
const hoverKey = ref<string | null>(null)

function onChartHover(params: { seriesIndex?: number } | null) {
  const r = params?.seriesIndex === undefined ? undefined : rings.value[params.seriesIndex]
  hoverKey.value = r?.key ?? null
}

const rings = computed(() => {
  const keys = props.parsed.windows.map((w) => w.key)
  return props.parsed.windows.map((w, i) => {
    const base = windowColor(w.key, keys, theme.value.dark)
    const level = levelFor(w.utilization, props.thresholds)
    const style = ringStyle(base, level, theme.value.dark)
    const [short, scope] = lines(w.key)
    return {
      key: w.key,
      short,
      scope,
      tag: tag(w.key),
      percent: Math.min(100, Math.round(w.utilization * 100)),
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
  animationEasing: 'cubicOut',
  tooltip: {
    ...theme.value.tooltip,
    trigger: 'item',
    confine: true,
    formatter: (params: { seriesIndex: number }) => {
      const r = rings.value[params.seriesIndex]
      if (!r) return ''
      const label = r.scope ? `${r.short} ${r.scope}` : r.short
      return `<b>${label}</b><br/>${r.percent} % · ${t('dashboard.resetsIn', { t: r.countdown })}`
    },
  },
  series: rings.value.map((r, i) => ({
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
            { offset: 0, color: withAlpha(r.base, 0.55) },
            { offset: 1, color: r.base },
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
          fontSize: 22,
          fontWeight: 600,
          color: theme.value.text,
          offsetCenter: [0, '-6%'],
          rich: {},
        }
      : { show: false },
    data: [{ value: r.percent }],
  })),
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
    <ul class="min-w-0 flex-1 space-y-2 text-sm">
      <li
        v-for="r in rings"
        :key="r.key"
        class="flex items-center gap-2 rounded px-1 -mx-1"
        :class="hoverKey === r.key ? 'bg-slate-100 dark:bg-slate-800' : ''"
        @mouseenter="hoverKey = r.key"
        @mouseleave="hoverKey = null"
      >
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="limited && r.percent >= 100 ? 'motion-safe:animate-pulse' : ''"
          :style="{ backgroundColor: r.base, boxShadow: r.style.glow ? `0 0 ${r.style.glow}px ${r.style.glowColor}` : 'none' }"
        />
        <span class="min-w-0 flex-1 truncate">
          <span class="font-bold">{{ r.short }}</span>
          <span v-if="r.tag" class="ml-1 hidden text-slate-500 @[24rem]:inline">{{ r.tag }}</span>
        </span>
        <span class="tabular-nums" :class="headline && headline.key === r.key ? 'font-bold' : ''">{{ r.percent }} %</span>
        <span class="w-16 text-right text-xs text-slate-500 tabular-nums" :title="t('dashboard.resetsIn', { t: r.countdown })">
          {{ r.countdown }}
        </span>
      </li>
    </ul>
  </div>
</template>
