import { computed } from 'vue'
import { isDark } from './theme'

/** Text, grid and tooltip colours for ECharts that follow the app theme. */
export function useChartTheme() {
  return computed(() => {
    const dark = isDark.value
    return {
      dark,
      text: dark ? '#e2e8f0' : '#0f172a',
      muted: dark ? '#94a3b8' : '#64748b',
      grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.14)',
      axisLine: dark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)',
      zone: dark ? 'rgba(148,163,184,0.06)' : 'rgba(100,116,139,0.06)',
      now: dark ? '#e2e8f0' : '#0f172a',
      tooltip: {
        backgroundColor: dark ? '#0f172a' : '#ffffff',
        borderColor: dark ? '#334155' : '#e2e8f0',
        textStyle: { color: dark ? '#e2e8f0' : '#0f172a', fontSize: 12 },
        extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.18); border-radius: 8px;',
      },
    }
  })
}
