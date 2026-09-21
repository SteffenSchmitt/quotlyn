import { levelColor, type Level } from './usageView'

/**
 * Favicon as inline SVG: a ring in the level colour with the percentage inside, or the plain
 * icon without data. Kept tiny and text-based so it can be swapped on every poll without assets.
 */
export function faviconSvg(utilization: number | null, level: Level): string {
  if (utilization === null) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<circle cx="16" cy="16" r="14" fill="none" stroke="#cbd5e1" stroke-width="4"/>' +
      '<path d="M16 2 a14 14 0 0 1 14 14" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="16" cy="16" r="4" fill="#0f172a"/></svg>'
    )
  }
  const pct = Math.min(100, Math.max(0, Math.round(utilization * 100)))
  const color = levelColor(level)
  const r = 13.5
  const circumference = 2 * Math.PI * r
  const dash = (pct / 100) * circumference
  const size = pct >= 100 ? 11 : 13
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="16" fill="#0f172a"/>' +
    `<circle cx="16" cy="16" r="${r}" fill="none" stroke="#334155" stroke-width="3"/>` +
    `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" ` +
    `stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 16 16)"/>` +
    `<text x="16" y="17" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui,sans-serif" ` +
    `font-weight="700" font-size="${size}" fill="#f8fafc">${pct}</text></svg>`
  )
}

/** Swaps the page's icon for the given SVG. */
export function applyFavicon(svg: string): void {
  if (typeof document === 'undefined') return
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
