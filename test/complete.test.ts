import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import type { CompletionItem, CompletionSources, Modules } from '../src/core/types.js'
import { complete } from '../src/core/complete.js'
import { fixtures } from './fixtures/modules.js'
import match from '../src/modules/match/index.js'

/** fixtures plus the real match module (the completion cases exercise both) */
const mods: Modules = { ...fixtures, match }

const src = (extra: Partial<CompletionSources> = {}): CompletionSources => ({
    modules: mods,
    ...extra,
})

const values = (items: CompletionItem[]): string[] => items.map((i) => i.value)

describe('complete', () => {
    test('1. command prefix at the root level', async () => {
        const res = await complete(src(), 'mat', 3)
        assert.deepEqual(res.items, [
            {
                value: 'match',
                kind: 'command',
                detail: 'test whether specified option values are equal',
                replaceFrom: 0,
                replaceTo: 3,
            },
        ])
        assert.equal(res.prefix, 'mat')
    })

    test('2. empty fresh token lists the submodule level', async () => {
        const res = await complete(src(), 'match ', 6)
        assert.deepEqual(values(res.items), ['scalar'])
        assert.equal(res.items[0]?.kind, 'command')
        assert.equal(res.prefix, '')
    })

    test('3. long-form option prefix', async () => {
        const res = await complete(src(), 'match scalar --l', 16)
        assert.deepEqual(res.items, [
            {
                value: '--left',
                kind: 'option',
                detail: 'untyped[] comparison value',
                replaceFrom: 13,
                replaceTo: 16,
            },
        ])
        assert.equal(res.prefix, '--l')
    })

    test('4. bare dash lists canonical and alias forms alphabetically', async () => {
        const res = await complete(src(), 'match scalar -', 14)
        assert.deepEqual(values(res.items), ['--left', '--right', '-l', '-r'])
    })

    test('5. @ prefix completes registered handles', async () => {
        const res = await complete(src({ handles: ['users', 'u2'] }), 'pass -x @u', 10)
        assert.deepEqual(values(res.items), ['@u2', '@users'])
        assert.equal(res.items[0]?.kind, 'handle')
    })

    test('6. option choices complete as values', async () => {
        const res = await complete(src(), 'pick --color g', 14)
        assert.deepEqual(res.items, [
            { value: 'green', kind: 'value', replaceFrom: 13, replaceTo: 14 },
        ])
    })

    test("7. a module's own complete() supplies values", async () => {
        const res = await complete(src(), 'dynv al', 7)
        assert.deepEqual(res.items, [
            { value: 'alpha', kind: 'value', replaceFrom: 5, replaceTo: 7 },
        ])
    })

    test('8. history items follow the context items', async () => {
        const res = await complete(
            src({ history: ['match scalar -l 1 -r 1'] }),
            'match sc',
            8,
        )
        assert.ok(
            res.items.some((i) => i.kind === 'command' && i.value === 'scalar'),
            'expected a command item for scalar',
        )
        const hist = res.items.find((i) => i.kind === 'history')
        assert.deepEqual(hist, {
            value: 'match scalar -l 1 -r 1',
            kind: 'history',
            replaceFrom: 0,
            replaceTo: 8,
        })
    })

    test('9. an unterminated quote at the cursor completes nothing', async () => {
        const res = await complete(src(), 'echo "unterm', 12)
        assert.deepEqual(res.items, [])
    })

    test('10. handle names after `as` are never suggested', async () => {
        const res = await complete(src(), 'pass 1 as ', 10)
        assert.deepEqual(res.items, [])
    })

    test('11. an unmatched stem completes nothing', async () => {
        const res = await complete(src(), 'frobnicate x', 12)
        assert.deepEqual(res.items, [])
    })

    test('12. no suggestions once the stem has ended with nothing to offer', async () => {
        const res = await complete(src(), 'match scalar -l 1 ', 18)
        assert.deepEqual(res.items, [])
    })
})
