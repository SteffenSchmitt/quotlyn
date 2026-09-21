import type { UsageWindow } from '../api/usageParser'
import { levelFor, type Level, type Thresholds } from '../lib/usageView'

export interface Crossing {
  accountId: string
  windowKey: string
  level: 'warn' | 'crit'
  utilization: number
  resetsAt: string | null
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, crit: 2 }

export class ThresholdWatcher {
  private last = new Map<string, Level>()

  evaluate(accountId: string, windows: UsageWindow[], thresholds: Thresholds): Crossing[] {
    const out: Crossing[] = []
    for (const w of windows) {
      const key = `${accountId}\u0000${w.key}`
      const level = levelFor(w.utilization, thresholds)
      const prev = this.last.get(key) ?? 'ok'
      if (RANK[level] > RANK[prev] && level !== 'ok') {
        out.push({ accountId, windowKey: w.key, level, utilization: w.utilization, resetsAt: w.resetsAt })
      }
      this.last.set(key, level)
    }
    return out
  }

  forget(accountId: string): void {
    for (const key of [...this.last.keys()]) {
      if (key.startsWith(`${accountId}\u0000`)) this.last.delete(key)
    }
  }
}
