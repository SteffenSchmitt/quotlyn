import { formatCountdown, type Thresholds } from '../lib/usageView'
import type { Crossing } from './thresholds'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface NotificationText {
  title: string
  body: string
}

/**
 * Title and body for a threshold crossing, e.g.
 * "Work · Warning" / "Session · 5 h at 82 % (warn level 80 %) · resets in 1h 12m".
 * Framework-free: the caller supplies the translator and the window label.
 */
export function crossingNotification(
  c: Crossing,
  accountName: string,
  thresholds: Thresholds,
  nowMs: number,
  t: Translate,
  windowLabel: (key: string) => string,
): NotificationText {
  const title = t('notify.title', { account: accountName, level: t(`notify.level.${c.level}`) })
  const params = {
    window: windowLabel(c.windowKey),
    percent: Math.round(c.utilization * 100),
    threshold: Math.round(thresholds[c.level] * 100),
  }
  const body = c.resetsAt
    ? t('notify.body', { ...params, countdown: formatCountdown(c.resetsAt, nowMs) })
    : t('notify.bodyNoReset', params)
  return { title, body }
}
