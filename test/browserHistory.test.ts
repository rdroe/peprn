import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalStorageHistory } from '../src/browser/history.js'
import type { StorageLike } from '../src/browser/history.js'

/** A plain-object storage stub implementing `StorageLike` (no jsdom/DOM emulation). */
function makeStorage(initial: Record<string, string> = {}): StorageLike & { removeItemCalls: string[] } {
    const data = new Map<string, string>(Object.entries(initial))
    const removeItemCalls: string[] = []
    return {
        getItem: (k: string): string | null => (data.has(k) ? (data.get(k) as string) : null),
        setItem: (k: string, v: string): void => {
            data.set(k, v)
        },
        removeItem: (k: string): void => {
            data.delete(k)
            removeItemCalls.push(k)
        },
        removeItemCalls
    }
}

describe('createLocalStorageHistory', () => {
    test('1. append then load round-trips entries in order', async () => {
        const storage = makeStorage()
        const store = createLocalStorageHistory(storage)
        await store.append('app', 'a')
        await store.append('app', 'b')
        assert.deepEqual(await store.load('app'), ['a', 'b'])
    })

    test('2. appIds are isolated under separate keys', async () => {
        const storage = makeStorage()
        const store = createLocalStorageHistory(storage)
        await store.append('one', 'a')
        await store.append('two', 'b')
        assert.deepEqual(await store.load('one'), ['a'])
        assert.deepEqual(await store.load('two'), ['b'])
    })

    test('3. clear returns the removed count and calls removeItem', async () => {
        const storage = makeStorage()
        const store = createLocalStorageHistory(storage)
        await store.append('app', 'a')
        await store.append('app', 'b')
        assert.equal(await store.clear('app'), 2)
        assert.deepEqual(storage.removeItemCalls, ['peprn:history:app'])
        assert.deepEqual(await store.load('app'), [])
    })

    test('4. corrupt JSON loads as empty', async () => {
        const storage = makeStorage({ 'peprn:history:app': '{ not json at all' })
        const store = createLocalStorageHistory(storage)
        assert.deepEqual(await store.load('app'), [])
    })
})
