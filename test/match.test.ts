import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import match, { scalar } from '../src/modules/match/index.js'
import type { AppHandle, Args, Invocation, Module } from '../src/core/types.js'

const args = (options: Record<string, unknown>, commands: string[]): Args => ({
    commands,
    modulePath: commands,
    wildcards: [],
    positional: [],
    options,
    raw: commands.join(' ')
})

const ctx = (
    options: Record<string, unknown>,
    children: Record<string, unknown>,
    path: string[]
): Invocation => ({
    args: args(options, path),
    children,
    path,
    depth: 0,
    app: {} as AppHandle
})

const call = (mod: Module, invocation: Invocation): unknown => {
    assert.ok(mod.fn, 'module has an fn')
    return mod.fn(invocation)
}

describe('match scalar', () => {
    test('produces exact pairwise rows', () => {
        const result = call(
            scalar,
            ctx(
                {
                    l: [1, 'a', 'hellllllo', 'world'],
                    r: [1, 'b', 'hellllllllllo', 'world']
                },
                {},
                ['match', 'scalar']
            )
        )
        assert.deepEqual(result, [
            { index: 0, match: true, left: 1, right: 1 },
            { index: 1, match: false, left: 'a', right: 'b' },
            { index: 2, match: false, left: 'hellllllo', right: 'hellllllllllo' },
            { index: 3, match: true, left: 'world', right: 'world' }
        ])
    })

    test('ragged lengths: the longer side wins, short side is undefined', () => {
        const longLeft = call(scalar, ctx({ l: [1, 2, 3], r: [1] }, {}, ['match', 'scalar']))
        assert.deepEqual(longLeft, [
            { index: 0, match: true, left: 1, right: 1 },
            { index: 1, match: false, left: 2, right: undefined },
            { index: 2, match: false, left: 3, right: undefined }
        ])

        const longRight = call(scalar, ctx({ l: [], r: ['x', 'y'] }, {}, ['match', 'scalar']))
        assert.deepEqual(longRight, [
            { index: 0, match: false, left: undefined, right: 'x' },
            { index: 1, match: false, left: undefined, right: 'y' }
        ])
    })

    test('missing -r throws the exact message', () => {
        assert.throws(
            () => call(scalar, ctx({ l: [1, 2] }, {}, ['match', 'scalar'])),
            (err: unknown) => {
                assert.ok(err instanceof Error)
                assert.equal(err.message, 'match scalar requires -l/--left and -r/--right')
                return true
            }
        )
        assert.throws(
            () => call(scalar, ctx({ r: [1, 2] }, {}, ['match', 'scalar'])),
            (err: unknown) => {
                assert.ok(err instanceof Error)
                assert.equal(err.message, 'match scalar requires -l/--left and -r/--right')
                return true
            }
        )
    })

    test('identical object references match', () => {
        const same = { deep: 'value' }
        const twin = { deep: 'value' }
        const result = call(scalar, ctx({ l: [same, same], r: [same, twin] }, {}, ['match', 'scalar']))
        assert.deepEqual(result, [
            { index: 0, match: true, left: same, right: same },
            { index: 1, match: false, left: same, right: twin }
        ])
    })
})

describe('match', () => {
    test('counts the flattened child results', () => {
        assert.equal(call(match, ctx({}, { 'match scalar': [1, 2, 3, 4] }, ['match'])), 4)
        assert.equal(call(match, ctx({}, {}, ['match'])), 0)
    })
})

describe('match module shape', () => {
    test('help and options are verbatim', () => {
        assert.equal(match.help?.description, 'test whether specified option values are equal')
        assert.deepEqual(match.help?.options, {
            'l (left)': 'comparison value',
            'r (right)': 'comparison value'
        })
        assert.equal(scalar.help?.description, 'test whether the supplied scalar pairs are equal')
        assert.deepEqual(scalar.help?.examples, {
            '-l 1 2 3 -r 1 2 4':
                'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.',
            '--left 1 2 3 --right 1 2 4':
                'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'
        })
        assert.deepEqual(scalar.options, {
            l: { alias: 'left', array: true, describe: 'comparison value' },
            r: { alias: 'right', array: true, describe: 'comparison value' }
        })
        assert.equal(match.submodules?.scalar, scalar)
    })
})
