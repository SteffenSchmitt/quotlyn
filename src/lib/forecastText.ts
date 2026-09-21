import type { Forecast } from './forecast'
import { formatCountdown, type Level } from './usageView'

type T = (key: string, params?: Record<string, unknown>) => string

/** One short sentence for a forecast, e.g. "full in 1h 20m (+12 %/h)". */
export function forecastLine(f: Forecast, nowMs: number, t: T): string {
  const rate = Math.round(f.ratePerHour * 100)
  if (f.beforeReset) return t('dashboard.forecast.exhausts', { t: formatCountdown(f.exhaustsAt, nowMs), rate })
  return t('dashboard.forecast.lasts', { p: Math.round(f.atReset * 100), rate })
}

/** Muted text colours per tone; the forecast is a hint, not an alarm. */
export const FORECAST_TONE_CLASS: Record<Level, string> = {
  ok: 'text-slate-400 dark:text-slate-500',
  warn: 'text-amber-700/70 dark:text-amber-300/60',
  crit: 'text-red-700/70 dark:text-red-300/60',
}

/** Severity of a forecast: crit within an hour of exhaustion, warn when it comes before the reset. */
export function forecastTone(f: Forecast, nowMs: number): Level {
  if (!f.beforeReset) return 'ok'
  return Date.parse(f.exhaustsAt) - nowMs <= 3_600_000 ? 'crit' : 'warn'
}
