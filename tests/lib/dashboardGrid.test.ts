import { describe, expect, it } from 'vitest'
import { DASHBOARD_COLUMNS, gridClass } from '../../src/lib/dashboardGrid'

describe('gridClass', () => {
  it('steps up to the chosen number of columns and no further', () => {
    expect(gridClass(2)).toBe('grid gap-4 md:grid-cols-2')
    expect(gridClass(3)).toBe('grid gap-4 md:grid-cols-2 xl:grid-cols-3')
    expect(gridClass(4)).toBe('grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')
  })

  it('falls back to three columns for anything unexpected', () => {
    expect(gridClass(undefined as never)).toBe(gridClass(3))
    expect(gridClass(7 as never)).toBe(gridClass(3))
  })

  it('offers exactly the columns the dashboard lets you pick', () => {
    expect(DASHBOARD_COLUMNS).toEqual([2, 3, 4])
  })

  it('spells every class out, because Tailwind only ships what it can read in the source', () => {
    for (const columns of DASHBOARD_COLUMNS) {
      const classes = gridClass(columns).split(' ')
      expect(classes).toContain('grid')
      // A built-up name such as `xl:grid-cols-${n}` would never reach the stylesheet.
      for (const name of classes) expect(name).not.toMatch(/[${}`]/)
    }
  })
})
