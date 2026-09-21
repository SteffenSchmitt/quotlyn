import { ref } from 'vue'

export type Theme = 'system' | 'light' | 'dark'

/** Reactive mirror of the applied theme, for code that cannot use CSS (e.g. canvas charts). */
export const isDark = ref(false)

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemDark() ? 'dark' : 'light'
  return theme
}

export function applyTheme(theme: Theme): void {
  const dark = resolveTheme(theme) === 'dark'
  isDark.value = dark
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', dark)
}

export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
