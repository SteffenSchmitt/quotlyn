import type { UsageSnapshot } from '../storage/historyDb'
import { costPerPercent, cycleUsage, type CycleUsage } from './cycleUsage'
import { subscriptionCycle, type Plan, type SubscriptionCycle, type SubscriptionInput } from './subscription'

/** The part of an account the overview needs. */
export interface SummaryAccount extends SubscriptionInput {
  id: string
  name: string
  plan: Plan
  monthlyPrice: number | null
}

export interface SummaryRow {
  id: string
  name: string
  plan: Plan
  monthlyPrice: number | null
  cycle: SubscriptionCycle
  /** The running billing month, or the last thirty days without a date. */
  current: CycleUsage
  /** The billing month before; empty without a date. */
  previous: CycleUsage
  perPercent: number | null
}

export interface SubscriptionSummary {
  rows: SummaryRow[]
  /** Sum of the prices of everything that has not run out; null when no price is known. */
  totalMonthly: number | null
  /** Listed subscriptions that have not run out. */
  running: number
  next: { name: string; atMs: number; kind: 'renewal' | 'end' } | null
  /** Mean of the current averages that have readings. */
  average: number | null
}

/** The window the evaluation looks at: the weekly limit across all models. */
export const USAGE_WINDOW = '7d'
const DAY_MS = 86_400_000
const FALLBACK_DAYS = 30
const EMPTY: CycleUsage = { average: null, weeks: 0, firstMs: null }

function hasSubscription(a: SummaryAccount): boolean {
  return a.subscriptionDate !== '' || a.plan !== '' || a.monthlyPrice !== null
}

/** Everything the "Subscriptions" page shows, from the accounts and their stored history. */
export function summarizeSubscriptions(
  accounts: SummaryAccount[],
  history: Record<string, UsageSnapshot[] | undefined>,
  nowMs: number,
): SubscriptionSummary {
  const rows = accounts.filter(hasSubscription).map((a): SummaryRow => {
    const snaps = history[a.id] ?? []
    const cycle = subscriptionCycle(a, nowMs)
    let current = EMPTY
    let previous = EMPTY
    if (cycle.state === 'none') {
      current = cycleUsage(snaps, USAGE_WINDOW, nowMs - FALLBACK_DAYS * DAY_MS, nowMs + 1)
    } else {
      // The month before always starts on the same anchor day, cancelled or not.
      const before = subscriptionCycle({ subscriptionDate: a.subscriptionDate, subscriptionCancelled: false }, cycle.startMs - 1)
      current = cycleUsage(snaps, USAGE_WINDOW, cycle.startMs, cycle.endMs)
      previous = cycleUsage(snaps, USAGE_WINDOW, before.startMs, cycle.startMs)
    }
    return {
      id: a.id,
      name: a.name,
      plan: a.plan,
      monthlyPrice: a.monthlyPrice,
      cycle,
      current,
      previous,
      perPercent: costPerPercent(a.monthlyPrice, current.average),
    }
  })

  const live = rows.filter((r) => r.cycle.state !== 'expired')
  const prices = live.map((r) => r.monthlyPrice).filter((p): p is number => p !== null)
  const averages = rows.map((r) => r.current.average).filter((v): v is number => v !== null)
  const upcoming = live
    .filter((r) => r.cycle.state === 'active' || r.cycle.state === 'ending')
    .sort((x, y) => x.cycle.endMs - y.cycle.endMs)[0]

  return {
    rows,
    totalMonthly: prices.length ? prices.reduce((sum, p) => sum + p, 0) : null,
    running: live.length,
    next: upcoming
      ? { name: upcoming.name, atMs: upcoming.cycle.endMs, kind: upcoming.cycle.state === 'ending' ? 'end' : 'renewal' }
      : null,
    average: averages.length ? averages.reduce((sum, v) => sum + v, 0) / averages.length : null,
  }
}
