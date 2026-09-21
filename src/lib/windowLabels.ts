import { useI18n } from 'vue-i18n'
import { WINDOW_LABEL_KEYS } from './usageView'

/** Two-line label for a window key: [duration, scope]. Unknown keys fall back to [key, '']. */
export function useWindowLabels() {
  const { t, te } = useI18n()
  function lines(key: string): [string, string] {
    const k = WINDOW_LABEL_KEYS[key]
    if (k && te(`windows.${k}.short`)) return [t(`windows.${k}.short`), t(`windows.${k}.scope`)]
    return [key, '']
  }
  function oneLine(key: string): string {
    const [a, b] = lines(key)
    return b ? `${a} · ${b}` : a
  }
  return { lines, oneLine }
}
