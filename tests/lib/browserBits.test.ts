// @vitest-environment happy-dom
// The thin layers that only exist to touch the browser: theme, favicon, notifications, downloads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, isDark, resolveTheme, watchSystemTheme } from '../../src/lib/theme'
import { applyFavicon, faviconSvg } from '../../src/lib/favicon'
import { notify, permissionState, requestPermission } from '../../src/notify/webNotify'
import { downloadText } from '../../src/lib/exportImport'
import { MemoryStorage } from '../../src/storage/localStore'

/** Replaces window.matchMedia with one that reports the given preference. */
function matchMedia(dark: boolean) {
  const listeners = new Set<() => void>()
  const mq = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => mq)
  return { fire: () => listeners.forEach((fn) => fn()), size: () => listeners.size }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})

describe('theme', () => {
  it('follows the system when asked to', () => {
    matchMedia(true)
    expect(resolveTheme('system')).toBe('dark')
    matchMedia(false)
    expect(resolveTheme('system')).toBe('light')
  })

  it('takes a pinned theme over the system', () => {
    matchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('puts the class on the document and mirrors it reactively', () => {
    applyTheme('dark')
    expect(isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('reports a change of the system preference and stops on release', () => {
    const mq = matchMedia(false)
    const onChange = vi.fn()
    const stop = watchSystemTheme(onChange)
    expect(mq.size()).toBe(1)
    mq.fire()
    expect(onChange).toHaveBeenCalledTimes(1)
    stop()
    expect(mq.size()).toBe(0)
  })

  it('does nothing where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(resolveTheme('system')).toBe('light')
    expect(() => watchSystemTheme(() => {})()).not.toThrow()
  })
})

describe('favicon', () => {
  it('draws a ring whose arc grows with the utilization', () => {
    const empty = faviconSvg(0)
    const full = faviconSvg(1)
    expect(empty).toContain('<svg')
    expect(full).toContain('100')
    expect(empty).not.toBe(full)
  })

  it('creates the icon link once and then reuses it', () => {
    document.head.replaceChildren()
    applyFavicon(faviconSvg(0.5))
    const first = document.querySelector('link[rel="icon"]')!
    expect(first.getAttribute('type')).toBe('image/svg+xml')
    expect(first.getAttribute('href')).toContain('data:image/svg+xml')

    applyFavicon(faviconSvg(0.9))
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
    expect(document.querySelector('link[rel="icon"]')).toBe(first)
  })
})

describe('web notifications', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('reports an unsupported browser instead of throwing', async () => {
    vi.stubGlobal('Notification', undefined)
    expect(permissionState()).toBe('unsupported')
    await expect(requestPermission()).resolves.toBe('unsupported')
    expect(() => notify('t', 'b')).not.toThrow()
  })

  it('asks only while the permission is still open', async () => {
    const request = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'granted', requestPermission: request }))
    await expect(requestPermission()).resolves.toBe('granted')
    expect(request).not.toHaveBeenCalled()

    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'default', requestPermission: request }))
    await expect(requestPermission()).resolves.toBe('granted')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('shows a notification only once permission was granted', () => {
    const made: Array<[string, unknown]> = []
    function Fake(this: unknown, title: string, options: unknown) {
      made.push([title, options])
    }
    vi.stubGlobal('Notification', Object.assign(Fake, { permission: 'denied' }))
    notify('Titel', 'Text')
    expect(made).toHaveLength(0)

    vi.stubGlobal('Notification', Object.assign(Fake, { permission: 'granted' }))
    notify('Titel', 'Text')
    expect(made).toHaveLength(1)
    expect(made[0]![0]).toBe('Titel')
    expect(made[0]![1]).toMatchObject({ body: 'Text', tag: 'Titel:Text' })
  })

  it('swallows a constructor that throws', () => {
    vi.stubGlobal(
      'Notification',
      Object.assign(
        function () {
          throw new Error('insecure context')
        },
        { permission: 'granted' },
      ),
    )
    expect(() => notify('t', 'b')).not.toThrow()
  })
})

describe('downloadText', () => {
  it('clicks a temporary link and cleans up after itself', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: create, revokeObjectURL: revoke }))
    const clicks: string[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = () => clicks.push(el.download)
      return el
    })

    downloadText('history.csv', 'a,b', 'text/csv')
    expect(create).toHaveBeenCalledTimes(1)
    expect(clicks).toEqual(['history.csv'])
    expect(document.querySelectorAll('a')).toHaveLength(0)
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:fake')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
})

describe('MemoryStorage', () => {
  it('behaves like the Storage it stands in for', () => {
    const s = new MemoryStorage()
    expect(s.length).toBe(0)
    s.setItem('a', '1')
    s.setItem('b', '2')
    expect(s.length).toBe(2)
    expect(s.key(0)).toBe('a')
    expect(s.key(9)).toBeNull()
    s.removeItem('a')
    expect(s.getItem('a')).toBeNull()
    s.clear()
    expect(s.length).toBe(0)
  })
})
