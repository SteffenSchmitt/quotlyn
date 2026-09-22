import type { Account } from '../stores/accounts'

/**
 * Where a billing account may appear:
 * - `everywhere`   in full, wherever it is relevant
 * - `masked`       shortened everywhere
 * - `hideOnDashboard`  kept out of the cards, still shown in timeline and history
 */
export type BillingVisibility = 'everywhere' | 'masked' | 'hideOnDashboard'
export const BILLING_VISIBILITIES: BillingVisibility[] = ['everywhere', 'masked', 'hideOnDashboard']
export const DEFAULT_BILLING_VISIBILITY: BillingVisibility = 'everywhere'

/** Shortest value that still hides something worth hiding once four characters show at each end. */
const MASK_MIN_LENGTH = 10
const KEEP = 4

/** "Acme GmbH · DE-1234" → "Acme…1234"; anything shorter is dropped entirely. */
export function maskBilling(value: string): string {
  const v = value.trim()
  if (v.length < MASK_MIN_LENGTH) return '…'
  return `${v.slice(0, KEEP)}…${v.slice(-KEEP)}`
}

export type BillingPlace = 'dashboard' | 'elsewhere'

/** The billing account as it may be shown in one place, or null when it stays hidden there. */
export function billingFor(account: Account, place: BillingPlace): string | null {
  const value = account.billingAccount?.trim() ?? ''
  if (!value) return null
  const visibility = account.billingVisibility ?? DEFAULT_BILLING_VISIBILITY
  if (visibility === 'hideOnDashboard') return place === 'dashboard' ? null : value
  return visibility === 'masked' ? maskBilling(value) : value
}

/** The lines of a "used by" note, without the empty ones; an empty list when nothing is set. */
export function usedByLines(account: Account): string[] {
  return (account.usedBy ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}
