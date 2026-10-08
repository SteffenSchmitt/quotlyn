/** The part of an account that describes its subscription. */
export interface SubscriptionInput {
  /** 'YYYY-MM-DD': any renewal day, or the end day once cancelled. '' when unset. */
  subscriptionDate: string
  subscriptionCancelled: boolean
}

/**
 * - `none`     no date entered
 * - `active`   renews every month on the same day
 * - `ending`   cancelled, runs until the entered day
 * - `expired`  cancelled and past its end
 */
export type SubscriptionState = 'none' | 'active' | 'ending' | 'expired'

export interface SubscriptionCycle {
  state: SubscriptionState
  /** Start of the current billing month, local midnight. */
  startMs: number
  /** Next renewal or the end, local midnight. */
  endMs: number
  /** Day of the billing month, from 1. */
  day: number
  /** Days in the billing month. */
  days: number
  /** Share of the billing month that has passed, 0..1. */
  progress: number
}

export type Plan = '' | 'pro' | 'max5x' | 'max20x'
export const PLANS: Exclude<Plan, ''>[] = ['pro', 'max5x', 'max20x']

export type Currency = 'EUR' | 'USD'
export const CURRENCIES: Currency[] = ['EUR', 'USD']

export function isPlan(x: unknown): x is Plan {
  return x === '' || (PLANS as unknown[]).includes(x)
}

/** A monthly price worth keeping: a finite number from zero up, otherwise null. */
export function priceOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
}

const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
/** How close a renewal has to be before the card mentions it. */
export const RENEWS_SOON_DAYS = 7

const NONE: SubscriptionCycle = { state: 'none', startMs: 0, endMs: 0, day: 0, days: 0, progress: 0 }

function parseDay(iso: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(iso)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const check = new Date(y, m, d)
  return check.getMonth() === m && check.getDate() === d ? { y, m, d } : null
}

/** The anchor day shifted by whole months, clamped to the last day of shorter months. */
function monthsFrom(anchor: { y: number; m: number; d: number }, n: number): number {
  const first = new Date(anchor.y, anchor.m + n, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(anchor.d, last)).getTime()
}

function cycleOf(startMs: number, endMs: number, nowMs: number, state: SubscriptionState): SubscriptionCycle {
  // Rounded day counts stay right across a daylight saving change.
  const days = Math.round((endMs - startMs) / DAY_MS)
  const progress = Math.min(1, Math.max(0, (nowMs - startMs) / (endMs - startMs)))
  const day = Math.min(days, Math.max(1, Math.floor((nowMs - startMs) / DAY_MS) + 1))
  return { state, startMs, endMs, day, days, progress }
}

/** The billing month `nowMs` falls into: renewal to renewal, or the last month before the end. */
export function subscriptionCycle(sub: SubscriptionInput, nowMs: number): SubscriptionCycle {
  const anchor = parseDay(sub.subscriptionDate)
  if (!anchor) return NONE
  if (sub.subscriptionCancelled) {
    const endMs = monthsFrom(anchor, 0)
    const startMs = monthsFrom(anchor, -1)
    if (nowMs >= endMs) return { ...cycleOf(startMs, endMs, nowMs, 'expired'), progress: 1 }
    return cycleOf(startMs, endMs, nowMs, 'ending')
  }
  const now = new Date(nowMs)
  // Start with the month difference, then step to the renewal that is not after now.
  let n = (now.getFullYear() - anchor.y) * 12 + (now.getMonth() - anchor.m)
  while (monthsFrom(anchor, n) > nowMs) n--
  while (monthsFrom(anchor, n + 1) <= nowMs) n++
  return cycleOf(monthsFrom(anchor, n), monthsFrom(anchor, n + 1), nowMs, 'active')
}

export interface SubscriptionEvent {
  atMs: number
  kind: 'renewal' | 'end'
}

/** Renewals and the end of a cancelled subscription within [fromMs, toMs], in order. */
export function subscriptionEvents(sub: SubscriptionInput, fromMs: number, toMs: number): SubscriptionEvent[] {
  const anchor = parseDay(sub.subscriptionDate)
  if (!anchor || toMs < fromMs) return []
  const from = new Date(fromMs)
  let n = (from.getFullYear() - anchor.y) * 12 + (from.getMonth() - anchor.m) - 1
  const out: SubscriptionEvent[] = []
  for (let at = monthsFrom(anchor, n); at <= toMs; at = monthsFrom(anchor, ++n)) {
    if (sub.subscriptionCancelled && n > 0) break
    const kind = sub.subscriptionCancelled && n === 0 ? 'end' : 'renewal'
    if (at >= fromMs) out.push({ atMs: at, kind })
  }
  return out
}

export interface SubscriptionBadge {
  kind: 'renews' | 'ends' | 'expired'
  /** Whole days left, a started day counting as one. */
  days: number
}

/** What the card says about the subscription, or null when there is nothing worth a badge. */
export function subscriptionBadge(cycle: SubscriptionCycle, nowMs: number): SubscriptionBadge | null {
  const days = Math.max(0, Math.ceil((cycle.endMs - nowMs) / DAY_MS))
  if (cycle.state === 'expired') return { kind: 'expired', days: 0 }
  if (cycle.state === 'ending') return { kind: 'ends', days }
  if (cycle.state === 'active' && days <= RENEWS_SOON_DAYS) return { kind: 'renews', days }
  return null
}
