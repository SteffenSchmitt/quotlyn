<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
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

use([GaugeChart, CanvasRenderer])

const props = withDefaults(
  defineProps<{ parsed: ParsedUsage; now: number; limited?: boolean; thresholds?: Thresholds; primaryWindow?: PrimaryWindow }>(),
  { limited: false, thresholds: () => DEFAULT_THRESHOLDS, primaryWindow: 'critical' },
)
const { t } = useI18n()
const { lines } = useWindowLabels()
const theme = useChartTheme()

const RING_WIDTH = 11
const RING_STEP = 24

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
  animationDuration: 600,
  animationEasing: 'cubicOut',
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
        shadowBlur: r.style.glow,
        shadowColor: r.style.glowColor,
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
    silent: true,
  })),
}))
</script>

<template>
  <div class="flex items-center gap-4">
    <VChart :option="option" autoresize :style="{ width: '168px', height: '168px', flex: '0 0 auto' }" />
    <ul class="min-w-0 flex-1 space-y-2 text-sm">
      <li v-for="r in rings" :key="r.key" class="flex items-center gap-2">
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="limited && r.percent >= 100 ? 'motion-safe:animate-pulse' : ''"
          :style="{ backgroundColor: r.base, boxShadow: r.style.glow ? `0 0 ${r.style.glow}px ${r.style.glowColor}` : 'none' }"
        />
        <span class="min-w-0 flex-1 truncate">
          <span class="font-medium">{{ r.short }}</span>
          <span v-if="r.scope" class="text-slate-500"> {{ r.scope }}</span>
        </span>
        <span class="tabular-nums" :class="headline && headline.key === r.key ? 'font-semibold' : ''">{{ r.percent }} %</span>
        <span class="w-16 text-right text-xs text-slate-500 tabular-nums" :title="t('dashboard.resetsIn', { t: r.countdown })">
          {{ r.countdown }}
        </span>
      </li>
    </ul>
  </div>
</template>
