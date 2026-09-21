import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { HistoryDb, type UsageSnapshot } from '../../src/storage/historyDb'

let db: HistoryDb
let n = 0

function snap(accountId: string, fetchedAt: string, ok = true): Omit<UsageSnapshot, 'id'> {
  return {
    accountId,
    fetchedAt,
    ok,
    parsed: ok
      ? {
          fetchedAt,
          windows: [],
          overall: { status: null, representativeClaim: null, resetsAt: null, fallbackPercentage: null },
          overage: { status: null, disabledReason: null },
          raw: {},
          usage: null,
        }
      : null,
    error: ok ? null : { status: 429, message: 'rate_limited' },
  }
}

beforeEach(async () => {
  db = await HistoryDb.open(`test-${++n}`)
})

describe('HistoryDb', () => {
  it('adds and lists snapshots per account in time order', async () => {
    await db.add(snap('a', '2026-09-21T10:00:00.000Z'))
    await db.add(snap('b', '2026-09-21T10:01:00.000Z'))
    await db.add(snap('a', '2026-09-21T09:00:00.000Z'))
    const list = await db.list('a')
    expect(list.map((s) => s.fetchedAt)).toEqual(['2026-09-21T09:00:00.000Z', '2026-09-21T10:00:00.000Z'])
    expect(list[0]!.id).toBeTypeOf('number')
  })

  it('filters by since', async () => {
    await db.add(snap('a', '2026-09-21T09:00:00.000Z'))
    await db.add(snap('a', '2026-09-21T10:00:00.000Z'))
    const list = await db.list('a', '2026-09-21T09:30:00.000Z')
    expect(list.map((s) => s.fetchedAt)).toEqual(['2026-09-21T10:00:00.000Z'])
  })

  it('returns latest and latestOk', async () => {
    await db.add(snap('a', '2026-09-21T09:00:00.000Z'))
    await db.add(snap('a', '2026-09-21T10:00:00.000Z', false))
    expect((await db.latest('a'))!.fetchedAt).toBe('2026-09-21T10:00:00.000Z')
    expect((await db.latestOk('a'))!.fetchedAt).toBe('2026-09-21T09:00:00.000Z')
    expect(await db.latest('zzz')).toBeNull()
  })

  it('prunes older snapshots', async () => {
    await db.add(snap('a', '2026-08-01T00:00:00.000Z'))
    await db.add(snap('b', '2026-08-02T00:00:00.000Z'))
    await db.add(snap('a', '2026-09-21T00:00:00.000Z'))
    expect(await db.pruneOlderThan('2026-09-01T00:00:00.000Z')).toBe(2)
    expect(await db.list('a')).toHaveLength(1)
    expect(await db.list('b')).toHaveLength(0)
  })

  it('deletes an account', async () => {
    await db.add(snap('a', '2026-09-21T09:00:00.000Z'))
    await db.add(snap('a', '2026-09-21T10:00:00.000Z'))
    await db.add(snap('b', '2026-09-21T10:00:00.000Z'))
    expect(await db.deleteAccount('a')).toBe(2)
    expect(await db.list('a')).toHaveLength(0)
    expect(await db.list('b')).toHaveLength(1)
  })
})
