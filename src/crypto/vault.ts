export interface VaultBlob {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

export interface VaultOptions {
  iterations?: number
}

export const DEFAULT_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12

export class VaultError extends Error {
  readonly code: 'wrong_passphrase' | 'malformed'

  constructor(code: 'wrong_passphrase' | 'malformed') {
    super(code)
    this.code = code
    this.name = 'VaultError'
  }
}

const subtle = globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function sealWithKey(
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  data: unknown,
): Promise<VaultBlob> {
  const iv = randomBytes(IV_BYTES)
  const plaintext = encoder.encode(JSON.stringify(data))
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext)
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
}

export async function sealVault(passphrase: string, data: unknown, opts: VaultOptions = {}): Promise<VaultBlob> {
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(passphrase, salt, iterations)
  return sealWithKey(key, salt, iterations, data)
}

function assertBlob(blob: unknown): asserts blob is VaultBlob {
  const b = blob as Partial<VaultBlob> | null
  if (
    !b ||
    b.v !== 1 ||
    b.kdf !== 'PBKDF2-SHA256' ||
    typeof b.iterations !== 'number' ||
    typeof b.salt !== 'string' ||
    typeof b.iv !== 'string' ||
    typeof b.ciphertext !== 'string'
  ) {
    throw new VaultError('malformed')
  }
}

export async function openWithKey(key: CryptoKey, blob: VaultBlob): Promise<unknown> {
  assertBlob(blob)
  try {
    const plaintext = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(blob.iv) as BufferSource },
      key,
      fromBase64(blob.ciphertext) as BufferSource,
    )
    return JSON.parse(decoder.decode(plaintext))
  } catch {
    throw new VaultError('wrong_passphrase')
  }
}

export async function openVault(passphrase: string, blob: VaultBlob): Promise<{ data: unknown; key: CryptoKey }> {
  assertBlob(blob)
  const key = await deriveKey(passphrase, fromBase64(blob.salt), blob.iterations)
  const data = await openWithKey(key, blob)
  return { data, key }
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await subtle.exportKey('raw', key)))
}

export async function importKey(raw: string): Promise<CryptoKey> {
  return subtle.importKey('raw', fromBase64(raw) as BufferSource, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
}
