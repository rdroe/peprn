import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import type { Modules } from '../src/core/types.js'
import { ParseError, UnknownCommandError } from '../src/core/errors.js'
import { tokenizeLine } from '../src/core/tokenizer.js'
import { parseLine, walkStem } from '../src/core/parser.js'
import { fixtures } from './fixtures/modules.js'
import match from '../src/modules/match/index.js'

const tok = (s: string) => tokenizeLine(s, 0)

/** fixtures plus the real match module (the parser cases exercise both) */
const mods: Modules = { ...fixtures, match }

const p = (s: string) => parseLine(mods, tok(s), s)

describe('parseLine', () => {
    test('1. alias resolves to canonical name', () => {
        const r = p('echo --alpha 5')
        assert.deepEqual(r.args.options, { a: 5 })
        assert.deepEqual(r.pathKeys, ['echo'])
    })

    test('2. boolean option consumes no value', () => {
        const r = p('echo -v 5')
        assert.deepEqual(r.args.options, { v: true })
        assert.deepEqual(r.args.positional, [5])
    })

    test('3. number type coerces a quoted value', () => {
        const r = p('echo -n "42"')
        assert.deepEqual(r.args.options, { n: 42 })
    })

    test('4. number type rejects a non-number', () => {
        assert.throws(
            () => p('echo -n abc'),
            (err: unknown) =>
                err instanceof ParseError &&
                err.message === 'Option --n expects a number, got "abc"',
        )
    })

    test('5. string type keeps a numeric-looking value', () => {
        const r = p('echo -s 42')
        assert.deepEqual(r.args.options, { s: '42' })
    })

    test('6. negative numbers are values, not flags', () => {
        const r = p('echo -a -3 -1.5')
        assert.deepEqual(r.args.options, { a: -3 })
        assert.deepEqual(r.args.positional, [-1.5])
    })

    test('7. quoted positionals are inert, unquoted numbers coerce', () => {
        const r = p('echo "1" 2')
        assert.deepEqual(r.args.positional, ['1', 2])
    })

    test('8. array option collects until the next flag', () => {
        const r = p('echo --list 1 2 -a 9')
        assert.deepEqual(r.args.options, { list: [1, 2], a: 9 })
    })

    test('9. repeated array flags append', () => {
        const r = p('echo -l 1 -l 2')
        assert.deepEqual(r.args.options, { list: [1, 2] })
    })

    test('10. repeated non-array option: last wins', () => {
        const r = p('echo -a 1 -a 2')
        assert.deepEqual(r.args.options, { a: 2 })
    })

    test('11. non-array option takes exactly one value', () => {
        const r = p('echo -a 1 2')
        assert.deepEqual(r.args.options, { a: 1 })
        assert.deepEqual(r.args.positional, [2])
    })

    test('12. wildcard stem segment', () => {
        const r = p('dyn foo -d 4')
        assert.deepEqual(r.args.commands, ['dyn', 'foo'])
        assert.deepEqual(r.args.modulePath, ['dyn', '$'])
        assert.deepEqual(r.args.wildcards, ['foo'])
        assert.deepEqual(r.args.options, { d: 4 })
    })

    test('13. the stem ends permanently at the first non-match', () => {
        const r = p('echo echo')
        assert.deepEqual(r.args.commands, ['echo'])
        assert.deepEqual(r.args.positional, ['echo'])
    })

    test('14. unknown flags are accepted untyped', () => {
        const r = p('echo --zz 1')
        assert.deepEqual(r.args.options, { zz: 1 })
    })

    test('15. nested stem with two array options', () => {
        const r = p(
            'match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world',
        )
        assert.deepEqual(r.pathKeys, ['match', 'match scalar'])
        assert.deepEqual(r.args.options, {
            l: [1, 'a', 'hellllllo', 'world'],
            r: [1, 'b', 'hellllllllllo', 'world'],
        })
    })

    test('16. a ref in a single-value option slot', () => {
        const r = p('pass -x @a')
        assert.deepEqual(r.args.options, { x: { kind: 'ref', name: 'a' } })
    })

    test('17. refs inside an array option list', () => {
        const r = p('list --xs 1 @a 2')
        assert.deepEqual(r.args.options, {
            xs: [1, { kind: 'ref', name: 'a' }, 2],
        })
    })

    test('18. a ref token ends the stem permanently', () => {
        const r = p('syn @a leaf')
        assert.deepEqual(r.pathKeys, ['syn'])
        assert.deepEqual(r.args.positional, [{ kind: 'ref', name: 'a' }, 'leaf'])
    })

    test('19. --help is detected and consumed', () => {
        const r = p('match scalar --help')
        assert.equal(r.help, 'help')
        assert.deepEqual(r.args.options, {})
    })

    test('20. a bare --man line is legal with an empty chain', () => {
        const r = p('--man')
        assert.deepEqual(r.chain, [])
        assert.equal(r.help, 'man')
    })

    test('21. an unmatched first token throws UnknownCommandError', () => {
        assert.throws(
            () => p('frobnicate 1'),
            (err: unknown) =>
                err instanceof UnknownCommandError &&
                err.message === 'Unknown command "frobnicate"',
        )
    })
})

describe('walkStem', () => {
    test('22. stops at the first flag and accumulates specs', () => {
        const w = walkStem(mods, tok('match scalar -l 1'))
        assert.equal(w.consumed, 2)
        assert.deepEqual(w.pathKeys, ['match', 'match scalar'])
        assert.ok('l' in w.specs)
        assert.ok('r' in w.specs)
    })
})
