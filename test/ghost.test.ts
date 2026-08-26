import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import type { CompletionItem } from '../src/core/types.js'
import { ghostRemainder } from '../src/browser/ghost.js'

const item = (partial: Partial<CompletionItem> & { value: string; replaceFrom: number; replaceTo: number }): CompletionItem => ({
    kind: 'command',
    ...partial,
})

describe('ghostRemainder', () => {
    test('1. simple command prefix yields the trailing remainder', () => {
        const items = [item({ value: 'match', replaceFrom: 0, replaceTo: 3 })]
        const res = ghostRemainder(items, 'mat', 3)
        assert.ok(res)
        assert.equal(res.item, items[0])
        assert.equal(res.remainder, 'ch')
    })

    test('2. history item spanning the whole line', () => {
        const items = [
            item({ value: 'match scalar -l 1', kind: 'history', replaceFrom: 0, replaceTo: 8 }),
        ]
        const res = ghostRemainder(items, 'match sc', 8)
        assert.ok(res)
        assert.equal(res.item, items[0])
        assert.equal(res.remainder, 'alar -l 1')
    })

    test('3. cursor not at end, exact-equal value, and empty items all yield null', () => {
        const items = [item({ value: 'match', replaceFrom: 0, replaceTo: 3 })]

        // cursor not at the end of the text (text is longer than cursor)
        assert.equal(ghostRemainder(items, 'mat!', 3), null)

        // exact-equal value is not a proper prefix
        const equalItems = [item({ value: 'mat', replaceFrom: 0, replaceTo: 3 })]
        assert.equal(ghostRemainder(equalItems, 'mat', 3), null)

        // empty items
        assert.equal(ghostRemainder([], 'mat', 3), null)
    })
})
