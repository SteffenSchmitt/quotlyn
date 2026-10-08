import type { SubscriptionCycle } from '../lib/subscription'

export interface SubscriptionAlert {
  kind: 'renews' | 'ends'
  atMs: number
  /** Whole days left, a started day counting as one. */
  days: number
}

/** Where the reported dates survive a reload; a lead time of days would otherwise repeat on every visit. */
export interface FiredStore {
  load(): string[]
  save(keys: string[]): void
}

const DAY_MS = 86_400_000

/** Decides when a renewal or the end of a subscription deserves a notification: once per account and date. */
export class SubscriptionWatcher {
  private fired: Set<string>
  private readonly store: FiredStore

  constructor(store: FiredStore) {
    this.store = store
    this.fired = new Set(store.load())
  }

  evaluate(accountId: string, cycle: SubscriptionCycle, nowMs: number, leadDays: number): SubscriptionAlert | null {
    if (leadDays <= 0 || (cycle.state !== 'active' && cycle.state !== 'ending')) return null
    const left = cycle.endMs - nowMs
    if (left <= 0 || left > leadDays * DAY_MS) return null
    const key = `${accountId}\u0000${cycle.endMs}`
    if (this.fired.has(key)) return null
    this.fired.add(key)
    this.persist(nowMs)
    return { kind: cycle.state === 'ending' ? 'ends' : 'renews', atMs: cycle.endMs, days: Math.ceil(left / DAY_MS) }
  }

  forget(accountId: string): void {
    for (const key of [...this.fired]) {
      if (key.startsWith(`${accountId}\u0000`)) this.fired.delete(key)
    }
    this.persist(Date.now())
  }

  private persist(nowMs: number) {
    for (const key of [...this.fired]) {
      if (Number(key.split('\u0000')[1]) < nowMs) this.fired.delete(key)
    }
    this.store.save([...this.fired])
  }
}
