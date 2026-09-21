import type { Forecast } from '../lib/forecast'

/**
 * Decides when a forecast deserves a notification: exhaustion before the reset and within the
 * horizon, once per account, window and cycle. A window already at 100 % is the threshold
 * watcher's business.
 */
export class ForecastWatcher {
  private fired = new Set<string>()

  evaluate(accountId: string, forecasts: Array<Forecast | null>, nowMs: number, horizonMs: number): Forecast[] {
    const out: Forecast[] = []
    for (const f of forecasts) {
      if (!f || !f.beforeReset || f.current >= 1) continue
      if (Date.parse(f.exhaustsAt) - nowMs > horizonMs) continue
      const key = `${accountId}\u0000${f.windowKey}\u0000${f.resetsAt}`
      if (this.fired.has(key)) continue
      this.fired.add(key)
      out.push(f)
    }
    return out
  }

  forget(accountId: string): void {
    for (const key of [...this.fired]) {
      if (key.startsWith(`${accountId}\u0000`)) this.fired.delete(key)
    }
  }
}
