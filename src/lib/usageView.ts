import type { ParsedUsage, UsageWindow } from '../api/usageParser'

export type Level = 'ok' | 'warn' | 'crit'
export interface Thresholds {
  warn: number
  crit: number
}
export const DEFAULT_THRESHOLDS: Thresholds = { warn: 0.8, crit: 0.95 }

export function levelFor(utilization: number, t: Thresholds = DEFAULT_THRESHOLDS): Level {
  if (utilization >= t.crit) return 'crit'
  if (utilization >= t.warn) return 'warn'
  return 'ok'
}

export function levelColor(level: Level): string {
  return level === 'crit' ? '#ef4444' : level === 'warn' ? '#f59e0b' : '#10b981'
}

export function formatCountdown(resetsAtIso: string | null, nowMs: number): string {
  if (!resetsAtIso) return '–'
  const ms = Date.parse(resetsAtIso) - nowMs
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function criticalWindow(parsed: ParsedUsage | undefined): UsageWindow | null {
  if (!parsed || parsed.windows.length === 0) return null
  return parsed.windows.reduce((max, w) => (w.utilization > max.utilization ? w : max))
}

export function headroom(parsed: ParsedUsage | undefined): number {
  if (!parsed) return -1
  const w = criticalWindow(parsed)
  return w ? 1 - w.utilization : 1
}

export function sortByHeadroom<T>(items: T[], get: (t: T) => ParsedUsage | undefined): T[] {
  return items
    .map((item, index) => ({ item, index, room: headroom(get(item)) }))
    .sort((a, b) => b.room - a.room || a.index - b.index)
    .map((x) => x.item)
}

export const IDENTIFYING_HEADERS: ReadonlySet<string> = new Set([
  'anthropic-organization-id',
  'anthropic-workspace-id',
  'request-id',
])

export const KNOWN_HEADER_RE =
  /^(anthropic-ratelimit-unified-(status|representative-claim|reset|fallback-percentage|overage-status|overage-disabled-reason|.+-(utilization|reset|status))|anthropic-organization-id|anthropic-workspace-id|request-id)$/

export function isIdentifying(name: string): boolean {
  return IDENTIFYING_HEADERS.has(name)
}

export function isKnownHeader(name: string): boolean {
  return KNOWN_HEADER_RE.test(name)
}

export function maskValue(value: string): string {
  return value.length > 4 ? `${value.slice(0, 4)}…` : '…'
}

/** i18n key suffix for known window keys; unknown keys fall back to the raw key. */
export const WINDOW_LABEL_KEYS: Record<string, string> = {
  '5h': 'session',
  '7d': 'weekAll',
  '7d_oi': 'weekFable',
}

export type PrimaryWindow = 'critical' | '5h' | '7d' | '7d_oi'
export const PRIMARY_WINDOWS: PrimaryWindow[] = ['critical', '5h', '7d', '7d_oi']

/** The window an account wants to lead with; falls back to the most used one when missing. */
export function primaryWindowFor(parsed: ParsedUsage | undefined, setting: PrimaryWindow = 'critical'): UsageWindow | null {
  if (!parsed) return null
  if (setting !== 'critical') {
    const w = parsed.windows.find((x) => x.key === setting)
    if (w) return w
  }
  return criticalWindow(parsed)
}
