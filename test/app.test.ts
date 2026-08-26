import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { createApp } from '../src/core/app.js'
import { createMemoryHistory } from '../src/core/history.js'
import { DisposedError } from '../src/core/errors.js'
import { isManPage } from '../src/core/types.js'
import type { Args, ManPage, TaskReport, AppHandle } from '../src/core/types.js'

import { makeTestApp } from './fixtures/helpers.js'
import match from '../src/modules/match/index.js'

describe('app', () => {
    test('1. pass 1 -> dataHandler once; exact report shape', async () => {
        const { app, reports } = await makeTestApp()
        await app.run('pass 1')

        assert.equal(reports.length, 1)
        const report = reports[0]!
        assert.equal(report.lineIndex, 0)
        assert.equal(report.total, 1)
        assert.equal(report.handle, null)
        assert.equal(report.internal, false)
        assert.equal(report.status, 'ok')
        assert.deepEqual(report.result, { pass: 1 })
    })

    test('2. two-line program -> two reports, both total 2', async () => {
        const { app, reports } = await makeTestApp()
        await app.run('pass 1\npass 2')

        assert.equal(reports.length, 2)
        assert.equal(reports[0]!.total, 2)
        assert.equal(reports[1]!.total, 2)
    })

    test('3. internal run -> report.internal true; history stays empty', async () => {
        const { app, reports } = await makeTestApp()
        await app.run('pass 9', { internal: true })

        assert.equal(reports.length, 1)
        assert.equal(reports[0]!.internal, true)
        assert.deepEqual(app.history?.entries, [])
    })

    test('4. failing task is still recorded before execution', async () => {
        const { app } = await makeTestApp()
        await app.run('boom')

        assert.ok(app.history?.entries.includes('boom'))
    })

    test('5. historyIgnore prefix suppresses recording', async () => {
        const { app } = await makeTestApp({ historyIgnore: ['pass'] })
        await app.run('pass 1')

        assert.deepEqual(app.history?.entries, [])
    })

    test('6. history command + history delete', async () => {
        const { app } = await makeTestApp()
        await app.run('pass 1')

        const r1 = await app.run('history')
        assert.deepEqual(r1.tasks[0]!.result, { history: ['pass 1'] })

        // the root `history` module has its own fn too, so it also runs (after the
        // submodule clears the store) and contributes its own now-empty key
        const r2 = await app.run('history delete')
        assert.deepEqual(r2.tasks[0]!.result, { 'history delete': { deleted: 1 }, history: [] })

        const r3 = await app.run('history')
        assert.deepEqual(r3.tasks[0]!.result, { history: [] })
    })

    test('7. catch spy called once with (error, report, app); report stays error', async () => {
        const calls: { error: Error; report: TaskReport; app: AppHandle }[] = []
        const { app } = await makeTestApp({
            catch: (error, report, appHandle) => {
                calls.push({ error, report, app: appHandle })
            },
        })

        await app.run('boom')

        assert.equal(calls.length, 1)
        assert.equal(calls[0]!.error.message, 'boom!')
        assert.equal(calls[0]!.report.status, 'error')
        assert.equal(calls[0]!.app, app)
    })

    test('8. userEffects: matcher selective, matcher-less always (incl. invalid lines)', async () => {
        const matcherCalls: TaskReport[] = []
        const allCalls: TaskReport[] = []

        const { app } = await makeTestApp({
            userEffects: [
                {
                    matcher: (args: Args) => args.commands[0] === 'pass',
                    fn: (report) => {
                        matcherCalls.push(report)
                    },
                },
                {
                    fn: (report) => {
                        allCalls.push(report)
                    },
                },
            ],
        })

        await app.run('pass 1\necho "unterminated\nobj')

        assert.equal(allCalls.length, 3)
        assert.ok(allCalls.some((r) => r.args === null))

        assert.equal(matcherCalls.length, 1)
        assert.equal(matcherCalls[0]!.args?.commands[0], 'pass')
    })

    test('9. preprocessInput -> null short-circuits, no dataHandler call', async () => {
        const { app, reports } = await makeTestApp({ preprocessInput: () => null })
        const result = await app.run('anything')

        assert.deepEqual(result.tasks, [])
        assert.equal(result.ok, true)
        assert.equal(reports.length, 0)
    })

    test('10. dispose is idempotent; run rejects; handles cleared', async () => {
        const { app } = await makeTestApp()
        await app.run('pass 1 as a')

        app.dispose()
        app.dispose()

        assert.deepEqual(app.handles.names(), [])
        await assert.rejects(() => app.run('pass 1'), DisposedError)
    })

    test('11. init receives the app handle', async () => {
        let received: AppHandle | undefined
        const { app } = await makeTestApp({
            init: (a) => {
                received = a
            },
        })

        assert.equal(received, app)
        assert.equal(received?.id, 't')
    })

    test('12. app.complete finds the "pass" command', async () => {
        const { app } = await makeTestApp()
        const result = await app.complete('pas')

        assert.ok(result.items.some((i) => i.value === 'pass' && i.kind === 'command'))
    })

    test('13. man is injected unless the user defines one', async () => {
        const { app } = await makeTestApp()
        const r1 = await app.run('man')
        const report1 = r1.tasks[0]!
        assert.equal(report1.status, 'ok')

        const page1 = report1.result?.man
        assert.equal(isManPage(page1), true)
        assert.equal((page1 as ManPage).title, 't')

        const app2 = await createApp({ id: 't2', modules: { match }, history: createMemoryHistory() })
        const r2 = await app2.run('man match scalar')
        const page2 = r2.tasks[0]!.result?.man

        assert.equal(isManPage(page2), true)
        assert.equal((page2 as ManPage).title, 'match scalar')
    })
})
