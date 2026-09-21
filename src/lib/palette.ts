import type { Level } from './usageView'

/**
 * Categorical palette for limit windows. Fixed order, never cycled: the first three
 * slots are the known windows, the rest serve unknown windows in sorted order, and
 * anything beyond the last slot falls back to neutral.
 * Validated for CVD separation and contrast on both surfaces (dataviz validator).
 */
const LIGHT = ['#0d9488', '#7c3aed', '#db2777', '#0284c7', '#4f46e5']
const DARK = ['#14a394', '#8b5cf6', '#ec4899', '#0891b2', '#6366f1']
const NEUTRAL = { light: '#64748b', dark: '#94a3b8' }
const KNOWN_ORDER = ['5h', '7d', '7d_oi']

export function slotIndex(key: string, allKeys: string[]): number {
  const known = KNOWN_ORDER.indexOf(key)
  if (known >= 0) return known
  const extras = allKeys.filter((k) => !KNOWN_ORDER.includes(k)).sort()
  return KNOWN_ORDER.length + extras.indexOf(key)
}

export function windowColor(key: string, allKeys: string[], dark: boolean): string {
  const ramp = dark ? DARK : LIGHT
  const i = slotIndex(key, allKeys)
  return ramp[i] ?? (dark ? NEUTRAL.dark : NEUTRAL.light)
}

export interface RingStyle {
  color: string
  track: string
  glow: number
  glowColor: string
}

/** Level drives intensity: ok = calm, warn = glow, crit = strong glow with a hot tint. */
export function ringStyle(base: string, level: Level, dark: boolean): RingStyle {
  const track = dark ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.16)'
  if (level === 'crit') return { color: base, track, glow: 18, glowColor: dark ? '#ffffff' : base }
  if (level === 'warn') return { color: base, track, glow: 10, glowColor: base }
  return { color: base, track, glow: 0, glowColor: 'transparent' }
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}
