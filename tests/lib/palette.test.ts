import { describe, expect, it } from 'vitest'
import { ringStyle, slotIndex, windowColor, withAlpha } from '../../src/lib/palette'

describe('palette', () => {
  it('assigns known windows fixed slots regardless of other keys', () => {
    expect(slotIndex('5h', ['7d', '5h'])).toBe(0)
    expect(slotIndex('7d', ['7d'])).toBe(1)
    expect(slotIndex('7d_oi', ['5h', '7d', '7d_oi'])).toBe(2)
  })

  it('assigns unknown windows the next slots in sorted order', () => {
    const keys = ['5h', 'zz', '7d', 'aa']
    expect(slotIndex('aa', keys)).toBe(3)
    expect(slotIndex('zz', keys)).toBe(4)
  })

  it('falls back to neutral beyond the last slot instead of cycling', () => {
    const keys = ['5h', '7d', '7d_oi', 'a', 'b', 'c']
    expect(windowColor('c', keys, false)).toBe('#64748b')
    expect(windowColor('c', keys, true)).toBe('#94a3b8')
  })

  it('uses different ramps for light and dark', () => {
    expect(windowColor('5h', ['5h'], false)).toBe('#0d9488')
    expect(windowColor('5h', ['5h'], true)).toBe('#14a394')
  })

  it('scales glow with level', () => {
    expect(ringStyle('#0d9488', 'ok', false).glow).toBe(0)
    expect(ringStyle('#0d9488', 'warn', false).glow).toBeGreaterThan(0)
    expect(ringStyle('#0d9488', 'crit', true).glow).toBeGreaterThan(ringStyle('#0d9488', 'warn', true).glow)
  })

  it('builds rgba strings', () => {
    expect(withAlpha('#ff0080', 0.5)).toBe('rgba(255,0,128,0.5)')
  })
})
