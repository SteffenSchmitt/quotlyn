import type { UsageWindow } from '../api/usageParser'

export interface ResetEvent {
  accountId: string
  windowKey: string
  /** Utilization right after the reset. */
  utilization: number
}

const RESET_TOLERANCE = 5 * 60_000

/**
 * Notices when a window that was used up starts a new cycle: the reset time moved on by more than
 * a drift and the utilization dropped. "Used up" means 100 % or the API rejecting requests.
 */
export class ResetWatcher {
  private last = new Map<string, { resetsAt: string | null; exhausted: boolean }>()

  evaluate(accountId: string, windows: UsageWindow[], limited: boolean): ResetEvent[] {
    const out: ResetEvent[] = []
    for (const w of windows) {
      const key = `${accountId}\u0000${w.key}`
      const prev = this.last.get(key)
      const exhausted = w.utilization >= 1 || limited
      if (prev?.exhausted && prev.resetsAt && w.resetsAt) {
        const moved = Date.parse(w.resetsAt) - Date.parse(prev.resetsAt) > RESET_TOLERANCE
        if (moved && w.utilization < 1) out.push({ accountId, windowKey: w.key, utilization: w.utilization })
      }
      this.last.set(key, { resetsAt: w.resetsAt, exhausted })
    }
    return out
  }

  forget(accountId: string): void {
    for (const key of [...this.last.keys()]) {
      if (key.startsWith(`${accountId}\u0000`)) this.last.delete(key)
    }
  }
}
