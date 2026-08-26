import type { HistoryStore } from '../core/types.js'

/** Minimal surface of the Web Storage API that `createLocalStorageHistory` needs. */
export interface StorageLike {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
    removeItem(k: string): void
}

const keyFor = (appId: string): string => `peprn:history:${appId}`

/** Parses the stored JSON array; corrupt/missing/non-array data yields `[]`. */
function readEntries(storage: StorageLike, appId: string): string[] {
    const raw = storage.getItem(keyFor(appId))
    if (raw === null) return []
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return []
    }
    if (!Array.isArray(data)) return []
    return data.filter((e): e is string => typeof e === 'string')
}

/**
 * A `HistoryStore` backed by (by default) the browser's `localStorage`, one
 * JSON string-array per app under key `peprn:history:<appId>`.
 */
export function createLocalStorageHistory(storage?: StorageLike): HistoryStore {
    const s: StorageLike =
        storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefinedStorage())

    return {
        async load(appId: string): Promise<string[]> {
            return readEntries(s, appId)
        },
        async append(appId: string, entry: string): Promise<void> {
            const entries = readEntries(s, appId)
            entries.push(entry)
            s.setItem(keyFor(appId), JSON.stringify(entries))
        },
        async clear(appId: string): Promise<number> {
            const removed = readEntries(s, appId).length
            s.removeItem(keyFor(appId))
            return removed
        }
    }
}

/** Fallback used only when no storage is supplied and no global `localStorage` exists. */
function undefinedStorage(): StorageLike {
    throw new Error('peprn: no storage available for createLocalStorageHistory')
}
