import { describe, expect, it } from 'vitest'
import { MemoryStorage, readJson, remove, writeJson } from '../../src/storage/localStore'

describe('localStore', () => {
  it('writes and reads JSON', () => {
    const s = new MemoryStorage()
    writeJson(s, 'k', { a: 1 })
    expect(readJson<{ a: number }>(s, 'k')).toEqual({ a: 1 })
  })

  it('returns null for missing keys', () => {
    expect(readJson(new MemoryStorage(), 'nope')).toBeNull()
  })

  it('returns null for unparsable content', () => {
    const s = new MemoryStorage()
    s.setItem('k', '{not json')
    expect(readJson(s, 'k')).toBeNull()
  })

  it('removes keys', () => {
    const s = new MemoryStorage()
    writeJson(s, 'k', 1)
    remove(s, 'k')
    expect(readJson(s, 'k')).toBeNull()
  })
})
