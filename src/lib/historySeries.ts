import type { UsageSnapshot } from '../storage/historyDb'

export type Range = '24h' | '7d' | '30d'
export const RANGES: Range[] = ['24h', '7d', '30d']
const RANGE_MS: Record<Range, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 }

export function rangeSince(range: Range, nowMs: number): string {
  return new Date(nowMs - RANGE_MS[range]).toISOString()
}

export function seriesFor(snapshots: UsageSnapshot[], windowKey: string): Array<[string, number | null]> {
  return snapshots.map((s) => {
    const w = s.parsed?.windows.find((x) => x.key === windowKey)
    return [s.fetchedAt, w ? Math.round(w.utilization * 1000) / 10 : null]
  })
}

export function resetMarkersFor(snapshots: UsageSnapshot[], windowKey: string): string[] {
  const set = new Set<string>()
  for (const s of snapshots) {
    const w = s.parsed?.windows.find((x) => x.key === windowKey)
    if (w?.resetsAt) set.add(w.resetsAt)
  }
  return [...set].sort()
}

export function windowKeysIn(snapshots: UsageSnapshot[]): string[] {
  const set = new Set<string>()
  for (const s of snapshots) for (const w of s.parsed?.windows ?? []) set.add(w.key)
  return [...set].sort()
}

/**
 * Bands between consecutive reset times, clipped to [fromIso, toIso]. The band before the
 * first known reset starts at fromIso; the band after the last reset ends at toIso.
 * Every other band is returned so the chart can alternate a tint.
 */
export function resetZones(markers: string[], fromIso: string, toIso: string): Array<[string, string]> {
  const edges = [fromIso, ...markers.filter((m) => m > fromIso && m < toIso), toIso]
  const zones: Array<[string, string]> = []
  for (let i = 0; i + 1 < edges.length; i += 2) zones.push([edges[i]!, edges[i + 1]!])
  return zones
}
