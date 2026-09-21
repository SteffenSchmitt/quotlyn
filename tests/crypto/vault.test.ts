import { describe, expect, it } from 'vitest'
import {
  VaultError,
  exportKey,
  fromBase64,
  importKey,
  openVault,
  openWithKey,
  sealVault,
  sealWithKey,
  toBase64,
} from '../../src/crypto/vault'

const FAST = { iterations: 1000 }
const sample = { accounts: [{ id: 'a', name: 'Alpha', token: 'sk-ant-oat-test-1' }] }

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('sealVault / openVault', () => {
  it('round-trips data with the right passphrase', async () => {
    const blob = await sealVault('correct horse', sample, FAST)
    const { data } = await openVault('correct horse', blob)
    expect(data).toEqual(sample)
  })

  it('produces a well-formed blob', async () => {
    const blob = await sealVault('p', sample, FAST)
    expect(blob.v).toBe(1)
    expect(blob.kdf).toBe('PBKDF2-SHA256')
    expect(blob.iterations).toBe(1000)
    expect(fromBase64(blob.salt)).toHaveLength(16)
    expect(fromBase64(blob.iv)).toHaveLength(12)
    expect(blob.ciphertext).not.toContain('sk-ant')
  })

  it('rejects a wrong passphrase with VaultError', async () => {
    const blob = await sealVault('right', sample, FAST)
    await expect(openVault('wrong', blob)).rejects.toBeInstanceOf(VaultError)
    await expect(openVault('wrong', blob)).rejects.toMatchObject({ code: 'wrong_passphrase' })
  })

  it('uses a fresh salt and iv every time', async () => {
    const a = await sealVault('p', sample, FAST)
    const b = await sealVault('p', sample, FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('rejects a malformed blob', async () => {
    await expect(openVault('p', { v: 1 } as never)).rejects.toMatchObject({ code: 'malformed' })
  })
})

describe('key reuse', () => {
  it('re-seals with an opened key and opens with the same key', async () => {
    const first = await sealVault('p', sample, FAST)
    const { key } = await openVault('p', first)
    const second = await sealWithKey(key, fromBase64(first.salt), first.iterations, { changed: true })
    expect(second.salt).toBe(first.salt)
    expect(second.iv).not.toBe(first.iv)
    expect(await openWithKey(key, second)).toEqual({ changed: true })
    expect((await openVault('p', second)).data).toEqual({ changed: true })
  })

  it('exports and imports a key', async () => {
    const blob = await sealVault('p', sample, FAST)
    const { key } = await openVault('p', blob)
    const restored = await importKey(await exportKey(key))
    expect(await openWithKey(restored, blob)).toEqual(sample)
  })
})
