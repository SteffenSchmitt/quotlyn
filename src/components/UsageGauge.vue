<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { DEFAULT_THRESHOLDS, levelColor, levelFor, type Thresholds } from '../lib/usageView'

use([GaugeChart, CanvasRenderer])

const props = withDefaults(
  defineProps<{ utilization: number; label: string; subtitle?: string; thresholds?: Thresholds }>(),
  { subtitle: '', thresholds: () => DEFAULT_THRESHOLDS },
)

const color = computed(() => levelColor(levelFor(props.utilization, props.thresholds)))
const percent = computed(() => Math.min(100, Math.round(props.utilization * 100)))

const option = computed(() => ({
  animationDuration: 400,
  series: [
    {
      type: 'gauge',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      radius: '100%',
      center: ['50%', '58%'],
      progress: { show: true, width: 10, roundCap: true, itemStyle: { color: color.value } },
      axisLine: { lineStyle: { width: 10, color: [[1, '#e2e8f0']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: true,
        formatter: (v: number) => `${Math.round(v)} %`,
        fontSize: 18,
        fontWeight: 600,
        color: '#0f172a',
        offsetCenter: [0, '5%'],
      },
      data: [{ value: percent.value }],
    },
  ],
}))
</script>

<template>
  <div class="flex flex-col items-center">
    <VChart :option="option" autoresize :style="{ width: '112px', height: '112px' }" />
    <div class="-mt-2 text-sm font-medium">{{ label }}</div>
    <div v-if="subtitle" class="text-xs text-slate-500">{{ subtitle }}</div>
  </div>
</template>
