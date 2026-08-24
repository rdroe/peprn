import type { HistoryStore, HistorySession, Invocation, Module } from './types.js'

const TRAILING_WS = /[\n\s]+$/

/** Default prefixes whose lines are never recorded. */
const DEFAULT_IGNORE: readonly string[] = ['history']

/**
 * Volatile HistoryStore. Entries live only for the lifetime of the process;
 * useful for tests and for platforms with no durable storage.
 */
export function createMemoryHistory(): HistoryStore {
    const byApp = new Map<string, string[]>()
    const bucket = (appId: string): string[] => {
        let list = byApp.get(appId)
        if (!list) {
            list = []
            byApp.set(appId, list)
        }
        return list
    }
    return {
        async load(appId: string): Promise<string[]> {
            return bucket(appId).slice()
        },
        async append(appId: string, entry: string): Promise<void> {
            bucket(appId).push(entry)
        },
        async clear(appId: string): Promise<number> {
            const list = bucket(appId)
            const removed = list.length
            list.length = 0
            return removed
        }
    }
}

/**
 * Load `appId`'s entries out of `store` and wrap them in a cursored session.
 * The cursor starts one past the newest entry (i.e. "on the empty new line").
 */
export async function createHistorySession(
    store: HistoryStore,
    appId: string,
    ignore?: string[]
): Promise<HistorySession> {
    const entries: string[] = await store.load(appId)
    const ignored: readonly string[] = ignore ?? DEFAULT_IGNORE
    let cursor = entries.length

    const session: HistorySession = {
        get entries(): readonly string[] {
            return entries
        },
        async record(entry: string): Promise<boolean> {
            const text = entry.replace(TRAILING_WS, '')
            if (text === '') return false
            if (ignored.some((prefix) => text.startsWith(prefix))) return false
            if (entries.length > 0 && entries[entries.length - 1] === text) return false
            entries.push(text)
            await store.append(appId, text)
            session.reset()
            return true
        },
        prev(): string | null {
            if (cursor <= 0) return null
            cursor -= 1
            return entries[cursor] ?? null
        },
        next(): string | null {
            if (cursor >= entries.length) return null
            cursor += 1
            return cursor < entries.length ? entries[cursor] : ''
        },
        reset(): void {
            cursor = entries.length
        },
        async clear(): Promise<number> {
            const removed = await store.clear(appId)
            entries.length = 0
            session.reset()
            return removed
        }
    }
    return session
}

/** The built-in `history` command (and its `history delete` submodule). */
export function makeHistoryModule(): Module {
    return {
        fn: (ctx: Invocation): string[] => ctx.app.history?.entries.slice() ?? [],
        help: {
            description: 'list the recorded command history',
            examples: { history: 'show every recorded line, oldest first' }
        },
        submodules: {
            delete: {
                fn: async (ctx: Invocation): Promise<{ deleted: number }> => ({
                    deleted: ctx.app.history ? await ctx.app.history.clear() : 0
                }),
                help: {
                    description: 'erase every recorded history entry',
                    examples: { 'history delete': 'clear the history and report how many entries went away' }
                }
            }
        }
    }
}
