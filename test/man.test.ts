import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildManIndex, buildManPage, makeManModule, renderManText } from '../src/core/man.js'
import { UnknownCommandError } from '../src/core/errors.js'
import { isManPage } from '../src/core/types.js'
import type { Args, AppHandle, Invocation, Modules } from '../src/core/types.js'
import match from '../src/modules/match/index.js'
import { fixtures } from './fixtures/modules.js'

const NOTE =
    'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'

const stubApp = (modules: Modules, id: string): AppHandle => ({
    id,
    modules,
    handles: {
        register: () => undefined,
        lookup: () => undefined,
        has: () => false,
        names: () => [],
        clear: () => undefined
    },
    history: null,
    disposed: false,
    run: () => Promise.reject(new Error('not implemented')),
    complete: () => Promise.reject(new Error('not implemented')),
    dispose: () => undefined
})

const makeArgs = (positional: unknown[]): Args => ({
    commands: ['man'],
    modulePath: ['man'],
    wildcards: [],
    positional,
    options: {},
    raw: 'man'
})

describe('man', () => {
    test('1. buildManPage({match}, [match, scalar])', () => {
        const page = buildManPage({ match }, ['match', 'scalar'])
        assert.equal(page.title, 'match scalar')
        assert.deepEqual(page.options, [
            {
                name: 'l',
                alias: 'left',
                type: 'untyped',
                array: true,
                describe: 'comparison value',
                choices: undefined
            },
            {
                name: 'r',
                alias: 'right',
                type: 'untyped',
                array: true,
                describe: 'comparison value',
                choices: undefined
            }
        ])
        assert.equal(page.synopsis, 'match scalar [-l value ...] [-r value ...]')
        assert.equal(page.examples.length, 2)
        for (const ex of page.examples) assert.ok(ex.cmd.startsWith('match scalar '))
        assert.deepEqual(page.subcommands, [])
    })

    test('2. buildManPage({match}, [match])', () => {
        const page = buildManPage({ match }, ['match'])
        assert.deepEqual(page.subcommands, [
            { name: 'scalar', description: 'test whether the supplied scalar pairs are equal' }
        ])
        assert.ok(page.synopsis.endsWith(' <subcommand>'))
    })

    test('3. buildManPage(fixtures, [dyn]) renders the wildcard submodule', () => {
        const page = buildManPage(fixtures, ['dyn'])
        assert.deepEqual(page.subcommands, [{ name: '<name>', description: '(no description)' }])
    })

    test('4. buildManPage(fixtures, [nope]) throws UnknownCommandError', () => {
        assert.throws(() => buildManPage(fixtures, ['nope']), UnknownCommandError)
    })

    test('5. buildManIndex', () => {
        const page = buildManIndex({ match, pass: fixtures.pass }, 'cli')
        assert.deepEqual(page.path, [])
        assert.equal(page.title, 'cli')
        assert.deepEqual(page.subcommands.map((s) => s.name), ['match', 'pass'])
        assert.equal(page.synopsis, 'cli <command>')
    })

    test('6. renderManText golden', () => {
        const page = buildManPage({ match }, ['match', 'scalar'])
        const expected = [
            'NAME',
            '  match scalar — test whether the supplied scalar pairs are equal',
            '',
            'SYNOPSIS',
            '  match scalar [-l value ...] [-r value ...]',
            '',
            'OPTIONS',
            '  -l, --left   untyped[]  comparison value',
            '  -r, --right  untyped[]  comparison value',
            '',
            'EXAMPLES',
            '  match scalar -l 1 2 3 -r 1 2 4',
            '    ' + NOTE,
            '  match scalar --left 1 2 3 --right 1 2 4',
            '    ' + NOTE
        ].join('\n')
        assert.equal(renderManText(page), expected)
    })

    test('7. isManPage', () => {
        assert.equal(isManPage(buildManIndex({ match }, 'cli')), true)
        assert.equal(isManPage({}), false)
    })

    test('8. buildManPage(fixtures, [pick]) option metadata', () => {
        const page = buildManPage(fixtures, ['pick'])
        assert.deepEqual(page.options[0], {
            name: 'color',
            alias: undefined,
            type: 'untyped',
            array: false,
            describe: 'a color',
            choices: ['red', 'green']
        })
    })

    test('makeManModule routes empty path to the index and a path to a page', async () => {
        const mod = makeManModule()
        assert.ok(mod.fn)
        const app = stubApp({ match }, 'cli')
        const index = await mod.fn({
            args: makeArgs([]),
            children: {},
            path: ['man'],
            depth: 0,
            app
        } as Invocation)
        assert.equal(isManPage(index), true)
        assert.equal((index as { title: string }).title, 'cli')

        const page = await mod.fn({
            args: makeArgs(['match', 'scalar']),
            children: {},
            path: ['man'],
            depth: 0,
            app
        } as Invocation)
        assert.equal((page as { title: string }).title, 'match scalar')
    })
})
