import { describe, expect, it } from 'vitest'
import { faviconSvg } from '../../src/lib/favicon'

describe('faviconSvg', () => {
  it('draws the percentage in the level colour', () => {
    const svg = faviconSvg(0.83, 'warn')
    expect(svg).toContain('>83<')
    expect(svg).toContain('#f59e0b')
    expect(svg.startsWith('<svg')).toBe(true)
  })
  it('caps at 100 and uses the critical colour', () => {
    const svg = faviconSvg(1.2, 'crit')
    expect(svg).toContain('>100<')
    expect(svg).toContain('#ef4444')
  })
  it('falls back to the plain icon without data', () => {
    const svg = faviconSvg(null, 'ok')
    expect(svg).not.toMatch(/>\d+</)
  })
})
