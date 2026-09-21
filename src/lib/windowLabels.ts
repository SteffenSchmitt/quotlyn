import { useI18n } from 'vue-i18n'
import { WINDOW_LABEL_KEYS } from './usageView'

type T = (key: string) => string
type Te = (key: string) => boolean

/** Two-line label for a window key: [duration, scope]. Unknown keys fall back to [key, '']. */
export function windowLines(t: T, te: Te, key: string): [string, string] {
  const k = WINDOW_LABEL_KEYS[key]
  if (k && te(`windows.${k}.short`)) return [t(`windows.${k}.short`), t(`windows.${k}.scope`)]
  return [key, '']
}

/** "5 h · Sitzung"; works outside components (e.g. with i18n.global). */
export function windowOneLine(t: T, te: Te, key: string): string {
  const [a, b] = windowLines(t, te, key)
  return b ? `${a} · ${b}` : a
}

/** Component flavour of the labels above; `tag` is the one-word scope for tight spots such as the ring legend. */
export function useWindowLabels() {
  const { t, te } = useI18n()
  const tt: T = (k) => t(k)
  function lines(key: string): [string, string] {
    return windowLines(tt, te, key)
  }
  function tag(key: string): string {
    const k = WINDOW_LABEL_KEYS[key]
    if (k && te(`windows.${k}.tag`)) return t(`windows.${k}.tag`)
    return lines(key)[1]
  }
  function oneLine(key: string): string {
    return windowOneLine(tt, te, key)
  }
  return { lines, tag, oneLine }
}
