import { describe, expect, it } from 'vitest'
import { BILLING_VISIBILITIES, billingFor, maskBilling } from '../../src/lib/accountMeta'
import type { Account } from '../../src/stores/accounts'

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'a',
    name: 'Work',
    color: '#eab308',
    token: 'sk-ant-oat01-test',
    notificationsEnabled: true,
    primaryWindow: 'critical',
    order: 0,
    billingAccount: 'Acme GmbH · DE-1234',
    billingVisibility: 'everywhere',
    usedBy: '',
    ...over,
  }
}

describe('maskBilling', () => {
  it('keeps the first and the last four characters', () => {
    expect(maskBilling('Acme GmbH · DE-1234')).toBe('Acme…1234')
    expect(maskBilling('Team Alpha')).toBe('Team…lpha')
  })

  it('hides values that are too short to mask meaningfully', () => {
    expect(maskBilling('ACME')).toBe('…')
    expect(maskBilling('Acme GmbH')).toBe('…')
  })

  it('trims and survives empty input', () => {
    expect(maskBilling('  Acme GmbH · DE-1234  ')).toBe('Acme…1234')
    expect(maskBilling('')).toBe('…')
  })
})

describe('billingFor', () => {
  it('shows the full value in both places when set to everywhere', () => {
    const a = account({ billingVisibility: 'everywhere' })
    expect(billingFor(a, 'dashboard')).toBe('Acme GmbH · DE-1234')
    expect(billingFor(a, 'elsewhere')).toBe('Acme GmbH · DE-1234')
  })

  it('masks the value in both places when set to masked', () => {
    const a = account({ billingVisibility: 'masked' })
    expect(billingFor(a, 'dashboard')).toBe('Acme…1234')
    expect(billingFor(a, 'elsewhere')).toBe('Acme…1234')
  })

  it('drops the value on the dashboard only when set to hideOnDashboard', () => {
    const a = account({ billingVisibility: 'hideOnDashboard' })
    expect(billingFor(a, 'dashboard')).toBeNull()
    expect(billingFor(a, 'elsewhere')).toBe('Acme GmbH · DE-1234')
  })

  it('returns null for an account without a billing account', () => {
    for (const visibility of BILLING_VISIBILITIES) {
      const a = account({ billingAccount: '   ', billingVisibility: visibility })
      expect(billingFor(a, 'dashboard')).toBeNull()
      expect(billingFor(a, 'elsewhere')).toBeNull()
    }
  })

  it('falls back to showing everything for an account from an older vault', () => {
    const a = { ...account(), billingVisibility: undefined } as unknown as Account
    expect(billingFor(a, 'dashboard')).toBe('Acme GmbH · DE-1234')
  })
})
