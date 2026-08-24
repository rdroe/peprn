import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Token } from '../src/core/types.js'
import { tokenizeLine } from '../src/core/tokenizer.js'
import { ParseError } from '../src/core/errors.js'

const w = (text: string): Token => ({ kind: 'word', text, quoted: false })
const q = (text: string): Token => ({ kind: 'word', text, quoted: true })
const r = (name: string): Token => ({ kind: 'ref', name })

describe('tokenizeLine', () => {
    test('1. splits a bare command line on whitespace', () => {
        assert.deepEqual(
            tokenizeLine('match scalar -l 1 a -r 1 b', 0),
            [w('match'), w('scalar'), w('-l'), w('1'), w('a'), w('-r'), w('1'), w('b')],
        )
    })

    test('2. double quotes group a token', () => {
        assert.deepEqual(
            tokenizeLine('echo "hello world"', 0),
            [w('echo'), q('hello world')],
        )
    })

    test('3. escapes inside quotes yield literal characters', () => {
        assert.deepEqual(
            tokenizeLine('echo "she said \\"hi\\""', 0),
            [w('echo'), q('she said "hi"')],
        )
    })

    test("4. a quote mid-token is literal", () => {
        assert.deepEqual(
            tokenizeLine("echo it's", 0),
            [w('echo'), w("it's")],
        )
    })

    test('5. escaped @ is literal, bare @ is a ref', () => {
        assert.deepEqual(
            tokenizeLine('echo \\@lit @ref', 0),
            [w('echo'), w('@lit'), r('ref')],
        )
    })

    test('6. @ mid-token is literal', () => {
        assert.deepEqual(
            tokenizeLine('echo user@host', 0),
            [w('echo'), w('user@host')],
        )
    })

    test('7. lone @ is an invalid reference', () => {
        assert.throws(
            () => tokenizeLine('echo @', 0),
            (err: unknown) => {
                assert.ok(err instanceof ParseError)
                assert.equal(err.message, 'Invalid @reference "@"')
                return true
            },
        )
    })

    test('8. @ followed by a non-NAME is an invalid reference', () => {
        assert.throws(
            () => tokenizeLine('echo @9x', 0),
            (err: unknown) => {
                assert.ok(err instanceof ParseError)
                assert.equal(err.message, 'Invalid @reference "@9x"')
                return true
            },
        )
    })

    test('9. unterminated quote', () => {
        assert.throws(
            () => tokenizeLine('echo "unterminated', 0),
            (err: unknown) => {
                assert.ok(err instanceof ParseError)
                assert.equal(err.message, 'Unterminated quote')
                return true
            },
        )
    })

    test('10. trailing backslash is a dangling escape', () => {
        assert.throws(
            () => tokenizeLine('echo one\\', 0),
            (err: unknown) => {
                assert.ok(err instanceof ParseError)
                assert.equal(err.message, 'Dangling escape')
                return true
            },
        )
    })

    test('11. a whitespace-only line yields no tokens', () => {
        assert.deepEqual(tokenizeLine('   ', 0), [])
    })

    test('12. empty quotes yield an empty quoted token', () => {
        assert.deepEqual(
            tokenizeLine("echo ''", 0),
            [w('echo'), q('')],
        )
    })

    test('13. negative numbers and flags stay bare words', () => {
        assert.deepEqual(
            tokenizeLine('echo -1.5 --flag', 0),
            [w('echo'), w('-1.5'), w('--flag')],
        )
    })
})
