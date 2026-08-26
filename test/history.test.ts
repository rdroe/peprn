import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { createHistorySession, createMemoryHistory, makeHistoryModule } from '../src/core/history.js'
import type { AppHandle, HistorySession, Invocation } from '../src/core/types.js'

const session = (
    store = createMemoryHistory(),
    appId = 'app',
    ignore?: string[]
): Promise<HistorySession> => createHistorySession(store, appId, ignore)

/** Minimal Invocation carrying only what the history module reads. */
const ctxFor = (history: HistorySession | null): Invocation =>
    ({ app: { history } as unknown as AppHandle }) as unknown as Invocation

describe('history session', () => {
    test('1. dedupe-adjacent', async () => {
        const h = await session()
        assert.equal(await h.record('pass 1'), true)
        assert.equal(await h.record('pass 1'), false)
        assert.equal(await h.record('pass 2'), true)
        assert.equal(await h.record('pass 1'), true)
        assert.deepEqual(h.entries, ['pass 1', 'pass 2', 'pass 1'])
    })

    test('2. ignores the default `history` prefix', async () => {
        const h = await session()
        assert.equal(await h.record('history delete'), false)
        assert.equal(await h.record('history'), false)
        assert.deepEqual(h.entries, [])
    })

    test('3. blank input is not recorded', async () => {
        const h = await session()
        assert.equal(await h.record(''), false)
        assert.equal(await h.record('   \n  '), false)
        assert.deepEqual(h.entries, [])
    })

    test("4. 'pass 2\\n' is stored trimmed as 'pass 2'", async () => {
        const h = await session()
        assert.equal(await h.record('pass 2\n'), true)
        assert.deepEqual(h.entries, ['pass 2'])
    })

    test('5. cursor walk over [a, b]', async () => {
        const h = await session()
        await h.record('a')
        await h.record('b')
        assert.equal(h.prev(), 'b')
        assert.equal(h.prev(), 'a')
        assert.equal(h.prev(), null)
        assert.equal(h.next(), 'b')
        assert.equal(h.next(), '')
        assert.equal(h.next(), null)
    })

    test('6. clear reports 2 then leaves entries empty', async () => {
        const h = await session()
        await h.record('a')
        await h.record('b')
        assert.equal(await h.clear(), 2)
        assert.deepEqual(h.entries, [])
    })

    test('7. two appIds are isolated in one store', async () => {
        const store = createMemoryHistory()
        const one = await session(store, 'one')
        const two = await session(store, 'two')
        await one.record('from one')
        await two.record('from two')
        assert.deepEqual(one.entries, ['from one'])
        assert.deepEqual(two.entries, ['from two'])
        assert.deepEqual(await store.load('one'), ['from one'])
        assert.deepEqual(await store.load('two'), ['from two'])
    })

    test('8. a new session over the same store reloads entries', async () => {
        const store = createMemoryHistory()
        const first = await session(store)
        await first.record('match scalar -l 1 -r 1')
        const second = await session(store)
        assert.deepEqual(second.entries, ['match scalar -l 1 -r 1'])
        assert.equal(second.prev(), 'match scalar -l 1 -r 1')
    })

    test('9. a custom ignore list replaces the default', async () => {
        const h = await session(createMemoryHistory(), 'app', ['pass'])
        assert.equal(await h.record('pass 1'), false)
        assert.equal(await h.record('history'), true)
        assert.deepEqual(h.entries, ['history'])
    })

    test('10. recording resets the cursor', async () => {
        const h = await session()
        await h.record('a')
        await h.record('b')
        assert.equal(h.prev(), 'b')
        await h.record('c')
        assert.equal(h.prev(), 'c')
    })
})

describe('makeHistoryModule', () => {
    test('11. root command returns a copy of the entries', async () => {
        const h = await session()
        await h.record('a')
        const mod = makeHistoryModule()
        assert.ok(mod.fn)
        const out = await mod.fn(ctxFor(h))
        assert.deepEqual(out, ['a'])
        assert.notEqual(out, h.entries)
    })

    test('12. root command with no session returns []', async () => {
        const mod = makeHistoryModule()
        assert.ok(mod.fn)
        assert.deepEqual(await mod.fn(ctxFor(null)), [])
    })

    test('13. `history delete` reports the deleted count', async () => {
        const h = await session()
        await h.record('a')
        await h.record('b')
        const del = makeHistoryModule().submodules?.['delete']
        assert.ok(del?.fn)
        assert.deepEqual(await del.fn(ctxFor(h)), { deleted: 2 })
        assert.deepEqual(h.entries, [])
    })

    test('14. `history delete` with no session reports 0', async () => {
        const del = makeHistoryModule().submodules?.['delete']
        assert.ok(del?.fn)
        assert.deepEqual(await del.fn(ctxFor(null)), { deleted: 0 })
    })
})
