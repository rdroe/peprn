import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'

import { formatTaskReport, makeCompleter, startShell } from '../src/node/shell.js'
import { buildManIndex } from '../src/core/man.js'
import type { TaskReport } from '../src/core/types.js'

import { makeTestApp } from './fixtures/helpers.js'
import { fixtures } from './fixtures/modules.js'
import match from '../src/modules/match/index.js'

/** Minimal report builder; callers override just what a case cares about. */
const mkReport = (over: Partial<TaskReport> = {}): TaskReport => ({
    lineIndex: 0,
    total: 1,
    raw: '',
    handle: null,
    internal: false,
    status: 'ok',
    result: null,
    error: null,
    args: null,
    ...over,
})

/** Poll `check` until it passes (or the timeout elapses). */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now()
    while (!check()) {
        if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

describe('formatTaskReport', () => {
    test('1. ok single -> "{ pass: 1 }"', () => {
        const text = formatTaskReport(mkReport({ result: { pass: 1 } }))
        assert.equal(text, '{ pass: 1 }')
    })

    test("2. total 2 + handle 'fives' -> starts with '[fives] '", () => {
        const text = formatTaskReport(mkReport({ total: 2, handle: 'fives', result: { pass: 5 } }))
        assert.ok(text.startsWith('[fives] '))
    })

    test('3. total 2, handle null, lineIndex 1 -> starts with "[line 2] "', () => {
        const text = formatTaskReport(
            mkReport({ total: 2, handle: null, lineIndex: 1, result: { pass: 5 } })
        )
        assert.ok(text.startsWith('[line 2] '))
    })

    test("4. error 'boom!' -> 'Error: boom!'", () => {
        const text = formatTaskReport(
            mkReport({ status: 'error', result: null, error: new Error('boom!') })
        )
        assert.equal(text, 'Error: boom!')
    })

    test("5. internal -> ''", () => {
        const text = formatTaskReport(mkReport({ internal: true, result: { pass: 1 } }))
        assert.equal(text, '')
    })

    test("6. ManPage result -> output starts with 'NAME'", () => {
        const page = buildManIndex({ match }, 'cli')
        const text = formatTaskReport(mkReport({ result: { man: page } }))
        assert.ok(text.startsWith('NAME'))
    })
})

describe('makeCompleter', () => {
    test("7. 'match sc' -> cb [['scalar'], 'sc']", async () => {
        const { app } = await makeTestApp({ modules: { match } })
        const completer = makeCompleter(app)

        const result = await new Promise<[string[], string]>((resolve) => {
            completer('match sc', (_err, res) => resolve(res))
        })

        assert.deepEqual(result, [['scalar'], 'sc'])
    })
})

describe('startShell', () => {
    test('8. drives app.run over a PassThrough pair, with continuation', async () => {
        const input = new PassThrough()
        const output = new PassThrough()

        let buf = ''
        output.on('data', (chunk: Buffer) => {
            buf += chunk.toString('utf8')
        })

        const { app } = await makeTestApp({
            modules: { pass: fixtures.pass, list: fixtures.list },
            dataHandler: (report) => {
                const text = formatTaskReport(report)
                if (text !== '') output.write(text + '\n')
            },
        })

        const shell = startShell(app, { input, output, prompt: '> ' })

        input.write('pass 1\n')
        await waitFor(() => buf.includes('{ pass: 1 }'))
        assert.equal((buf.match(/> /g) ?? []).length, 2)

        input.write('list --xs 1 \\\n--xs 2\n')
        await waitFor(() => buf.includes('{ list: [ 1, 2 ] }'))
        assert.ok(buf.includes('... '))

        shell.close()
        await waitFor(() => app.disposed)
    })
})
