import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { HistoryStore } from '../core/types.js'

type HistoryFile = Record<string, string[]>

/** arg → PEPRN_HISTORY_FILE → ~/.peprn/history.json. Resolved lazily, per call. */
const resolvePath = (filePath?: string): string =>
    filePath ?? process.env.PEPRN_HISTORY_FILE ?? join(homedir(), '.peprn', 'history.json')

/** Reads the store. Missing or corrupt file yields `{}`; never throws. */
const readAll = async (path: string): Promise<HistoryFile> => {
    let text: string
    try {
        text = await readFile(path, 'utf8')
    } catch {
        return {}
    }
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return {}
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}
    const out: HistoryFile = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (Array.isArray(value)) out[key] = value.filter((e): e is string => typeof e === 'string')
    }
    return out
}

const writeAll = async (path: string, data: HistoryFile): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

/** A `HistoryStore` backed by a single JSON file of shape `{ [appId]: string[] }`. */
export function createFileHistory(filePath?: string): HistoryStore {
    return {
        async load(appId: string): Promise<string[]> {
            const all = await readAll(resolvePath(filePath))
            return all[appId] ?? []
        },
        async append(appId: string, entry: string): Promise<void> {
            const path = resolvePath(filePath)
            const all = await readAll(path)
            const entries = all[appId] ?? []
            entries.push(entry)
            all[appId] = entries
            await writeAll(path, all)
        },
        async clear(appId: string): Promise<number> {
            const path = resolvePath(filePath)
            const all = await readAll(path)
            const removed = all[appId]?.length ?? 0
            if (!(appId in all)) return removed
            delete all[appId]
            await writeAll(path, all)
            return removed
        },
    }
}
