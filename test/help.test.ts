import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { getHelp } from '../src/core/help.js'
import { parseLine } from '../src/core/parser.js'
import { tokenizeLine } from '../src/core/tokenizer.js'
import match from '../src/modules/match/index.js'
import { fixtures } from './fixtures/modules.js'
import type { Modules, ParsedLine } from '../src/core/types.js'

const parse = (modules: Modules, line: string): ParsedLine =>
    parseLine(modules, tokenizeLine(line, 0), line)

const matchOnly: Modules = { match }
const NOTE = 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'

describe('getHelp', () => {
    test('1. match --help', () => {
        const out = getHelp(matchOnly, parse(matchOnly, 'match --help'))
        assert.deepEqual(out, {
            match: {
                description: 'test whether specified option values are equal',
                options: {
                    'l (left)': 'comparison value',
                    'r (right)': 'comparison value'
                }
            }
        })
    })

    test('2. match scalar --help', () => {
        const out = getHelp(matchOnly, parse(matchOnly, 'match scalar --help'))
        assert.deepEqual(out, {
            'match scalar': {
                description: 'test whether the supplied scalar pairs are equal',
                examples: {
                    'match scalar -l 1 2 3 -r 1 2 4': NOTE,
                    'match scalar --left 1 2 3 --right 1 2 4': NOTE
                }
            }
        })
    })

    test('3. pass --help (no help defined)', () => {
        const out = getHelp(fixtures, parse(fixtures, 'pass --help'))
        assert.deepEqual(out, { pass: { description: 'no help defined' } })
    })

    test('4. bare --help lists root modules', () => {
        const roots: Modules = { match, pass: fixtures.pass }
        const out = getHelp(roots, parse(roots, '--help'))
        assert.deepEqual(out, {
            match: { description: 'test whether specified option values are equal' },
            pass: { description: 'no help defined' }
        })
    })
})
