import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ParsedUsage } from '../api/usageParser'

export interface UsageSnapshot {
  id?: number
  accountId: string
  fetchedAt: string
  ok: boolean
  parsed: ParsedUsage | null
  error: { status: number | null; message: string } | null
}

interface Schema extends DBSchema {
  snapshots: {
    key: number
    value: UsageSnapshot
    indexes: { byAccountTime: [string, string]; byTime: string }
  }
}

const HI = '￿'

export class HistoryDb {
  private constructor(private db: IDBPDatabase<Schema>) {}

  static async open(name = 'quotlyn'): Promise<HistoryDb> {
    const db = await openDB<Schema>(name, 1, {
      upgrade(db) {
        const store = db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true })
        store.createIndex('byAccountTime', ['accountId', 'fetchedAt'])
        store.createIndex('byTime', 'fetchedAt')
      },
    })
    return new HistoryDb(db)
  }

  add(snapshot: Omit<UsageSnapshot, 'id'>): Promise<number> {
    return this.db.add('snapshots', snapshot as UsageSnapshot)
  }

  list(accountId: string, sinceIso = ''): Promise<UsageSnapshot[]> {
    const range = IDBKeyRange.bound([accountId, sinceIso], [accountId, HI])
    return this.db.getAllFromIndex('snapshots', 'byAccountTime', range)
  }

  async latest(accountId: string): Promise<UsageSnapshot | null> {
    const range = IDBKeyRange.bound([accountId, ''], [accountId, HI])
    const cursor = await this.db.transaction('snapshots').store.index('byAccountTime').openCursor(range, 'prev')
    return cursor?.value ?? null
  }

  async latestOk(accountId: string): Promise<UsageSnapshot | null> {
    const range = IDBKeyRange.bound([accountId, ''], [accountId, HI])
    let cursor = await this.db.transaction('snapshots').store.index('byAccountTime').openCursor(range, 'prev')
    while (cursor) {
      if (cursor.value.ok) return cursor.value
      cursor = await cursor.continue()
    }
    return null
  }

  async pruneOlderThan(iso: string): Promise<number> {
    const tx = this.db.transaction('snapshots', 'readwrite')
    let cursor = await tx.store.index('byTime').openCursor(IDBKeyRange.upperBound(iso, true))
    let deleted = 0
    while (cursor) {
      await cursor.delete()
      deleted++
      cursor = await cursor.continue()
    }
    await tx.done
    return deleted
  }

  async deleteAccount(accountId: string): Promise<number> {
    const tx = this.db.transaction('snapshots', 'readwrite')
    const range = IDBKeyRange.bound([accountId, ''], [accountId, HI])
    let cursor = await tx.store.index('byAccountTime').openCursor(range)
    let deleted = 0
    while (cursor) {
      await cursor.delete()
      deleted++
      cursor = await cursor.continue()
    }
    await tx.done
    return deleted
  }

  close(): void {
    this.db.close()
  }
}
