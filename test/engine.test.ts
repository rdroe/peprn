import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { executeChain, childmostKey } from '../src/core/engine.js'
import { tokenizeLine } from '../src/core/tokenizer.js'
import { parseLine } from '../src/core/parser.js'
import type { Args, Invocation, Module, Modules, ParsedLine } from '../src/core/types.js'

import { fixtures } from './fixtures/modules.js'
import { dummyApp } from './fixtures/helpers.js'
import match from '../src/modules/match/index.js'

const app = dummyApp()

const mods: Modules = { ...fixtures, match }

/** Parse a real line against the fixture tree plus the real `match` module. */
const parse = (line: string): ParsedLine => parseLine(mods, tokenizeLine(line, 0), line)

/** Minimal hand-built Args for inline (unparsed) chains. */
const mkArgs = (modulePath: string[]): Args => ({
    commands: modulePath.slice(),
    modulePath,
    wildcards: [],
    positional: [],
    options: {},
    raw: modulePath.join(' ')
})

describe('engine', () => {
    test('1. README line produces the exact composite result, childmost-first', async () => {
        const line = 'match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world'
        const parsed = parse(line)
        const result = await executeChain(parsed, parsed.args, app)

        assert.deepEqual(result, {
            'match scalar': [
                { index: 0, match: true, left: 1, right: 1 },
                { index: 1, match: false, left: 'a', right: 'b' },
                { index: 2, match: false, left: 'hellllllo', right: 'hellllllllllo' },
                { index: 3, match: true, left: 'world', right: 'world' }
            ],
            match: 4
        })
        assert.deepEqual(Object.keys(result), ['match scalar', 'match'])
    })

    test('2. `match` alone yields { match: 0 }', async () => {
        const parsed = parse('match')
        const result = await executeChain(parsed, parsed.args, app)
        assert.deepEqual(result, { match: 0 })
    })

    test('3. fn-less ancestors contribute no key', async () => {
        const parsed = parse('syn leaf')
        const result = await executeChain(parsed, parsed.args, app)
        assert.deepEqual(result, { 'syn leaf': 'leaf' })
        assert.equal(childmostKey(parsed), 'syn leaf')
    })

    test('4. a throwing module rejects', async () => {
        const parsed = parse('boom')
        await assert.rejects(
            () => executeChain(parsed, parsed.args, app),
            { message: 'boom!' }
        )
    })

    test('5. parent receives the resolved child result in ctx.children', async () => {
        const child: Module = { fn: () => [1, 2, 3] }
        let sawArray = false
        const parent: Module = {
            fn: (ctx: Invocation) => {
                sawArray = Array.isArray(ctx.children['p c'])
                assert.ok(Array.isArray(ctx.children['p c']))
                return 'parent'
            },
            submodules: { c: child }
        }
        const parsed: ParsedLine = {
            chain: [parent, child],
            pathKeys: ['p', 'p c'],
            help: null,
            args: mkArgs(['p', 'c'])
        }

        const result = await executeChain(parsed, parsed.args, app)
        assert.equal(sawArray, true)
        assert.deepEqual(result, { 'p c': [1, 2, 3], p: 'parent' })
        assert.deepEqual(Object.keys(result), ['p c', 'p'])
    })

    test('6. depth and path are recorded childmost-first', async () => {
        const seen: { depth: number; path: string[] }[] = []
        const record = (ctx: Invocation): null => {
            seen.push({ depth: ctx.depth, path: ctx.path })
            return null
        }
        const child: Module = { fn: record }
        const parent: Module = { fn: record, submodules: { c: child } }
        const parsed: ParsedLine = {
            chain: [parent, child],
            pathKeys: ['p', 'p c'],
            help: null,
            args: mkArgs(['p', 'c'])
        }

        await executeChain(parsed, parsed.args, app)

        assert.equal(seen.length, 2)
        assert.equal(seen[0].depth, 0)
        assert.deepEqual(seen[0].path, ['p', 'c'])
        assert.equal(seen[1].depth, 1)
        assert.deepEqual(seen[1].path, ['p'])
    })

    test('7. childmostKey of an all-fn-less chain is null', () => {
        const inner: Module = {}
        const outer: Module = { submodules: { c: inner } }
        const parsed: ParsedLine = {
            chain: [outer, inner],
            pathKeys: ['p', 'p c'],
            help: null,
            args: mkArgs(['p', 'c'])
        }

        assert.equal(childmostKey(parsed), null)
    })
})
