import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { HandleRegistry } from '../src/core/handles.js'
import { injectArgs, runProgram } from '../src/core/scheduler.js'
import type { SchedulerContext } from '../src/core/scheduler.js'
import { buildProgram } from '../src/core/program.js'
import { isManPage } from '../src/core/types.js'
import type {
    AppHandle, Args, Modules, RefPlaceholder, RunReport, TaskReport
} from '../src/core/types.js'
import { fixtures } from './fixtures/modules.js'
import match from '../src/modules/match/index.js'

const ref = (name: string): RefPlaceholder => ({ kind: 'ref', name })

/** Hand-built Args for the pure `injectArgs` cases. */
const mkArgs = (over: Partial<Args> = {}): Args => ({
    commands: [],
    modulePath: [],
    wildcards: [],
    positional: [],
    options: {},
    raw: '',
    ...over
})

const resolved = (entries: Record<string, unknown>): Map<string, unknown> =>
    new Map(Object.entries(entries))

/** Inert AppHandle carrying the modules + registry the scheduler needs. */
function stubApp(modules: Modules, registry: HandleRegistry): AppHandle {
    return {
        id: 'test',
        modules,
        handles: registry,
        history: null,
        disposed: false,
        run: () => Promise.reject(new Error('stub app cannot run')),
        complete: () => Promise.reject(new Error('stub app cannot complete')),
        dispose: () => undefined
    }
}

/** `run(text)` harness over one persistent registry. */
function harness(modules: Modules = fixtures) {
    const registry = new HandleRegistry()
    const reports: TaskReport[] = []
    const app = stubApp(modules, registry)
    const ctx: SchedulerContext = {
        app,
        registry,
        internal: false,
        onReport: async (r: TaskReport) => { reports.push(r) }
    }
    const run = (text: string): Promise<RunReport> => runProgram(buildProgram(text, modules), ctx)
    return { run, registry, reports, app }
}

const codeOf = (err: Error | null): string | undefined =>
    (err as { code?: string } | null)?.code

describe('injectArgs', () => {
    test('1. non-array option slot takes the value as-is, by reference', () => {
        const value = { k: 1 }
        const out = injectArgs(mkArgs({ options: { x: ref('a') } }), resolved({ a: value }))
        assert.deepEqual(out.options, { x: { k: 1 } })
        assert.strictEqual(out.options.x, value)
    })

    test('2. an array splices into a list position', () => {
        const out = injectArgs(mkArgs({ options: { xs: [0, ref('a'), 9] } }), resolved({ a: [1, 2] }))
        assert.deepEqual(out.options, { xs: [0, 1, 2, 9] })
    })

    test('3. a non-scalar in a list position throws InjectionError', () => {
        assert.throws(
            () => injectArgs(mkArgs({ options: { xs: [ref('a')] } }), resolved({ a: { k: 1 } })),
            (err: Error) => {
                assert.equal(codeOf(err), 'BAD_INJECTION')
                assert.equal(
                    err.message,
                    'Cannot inject @a: non-scalar value in a list position; use a single-value option slot'
                )
                return true
            }
        )
    })

    test('4. positionals: scalar inserts, null throws', () => {
        const ok = injectArgs(mkArgs({ positional: [ref('a')] }), resolved({ a: 5 }))
        assert.deepEqual(ok.positional, [5])
        assert.throws(
            () => injectArgs(mkArgs({ positional: [ref('a')] }), resolved({ a: null })),
            (err: Error) => codeOf(err) === 'BAD_INJECTION'
        )
    })
})

describe('runProgram', () => {
    test('5. a single task reports ok', async () => {
        const { run } = harness()
        const report = await run('pass 1')
        assert.equal(report.ok, true)
        assert.equal(report.tasks.length, 1)
        assert.equal(report.tasks[0].status, 'ok')
        assert.deepEqual(report.tasks[0].result, { pass: 1 })
        assert.equal(report.tasks[0].total, 1)
        assert.equal(report.tasks[0].handle, null)
    })

    test('6. a handle feeds the next line', async () => {
        const { run, registry } = harness()
        const out = await run('pass 1 as a\npass @a')
        assert.equal(out.ok, true)
        assert.deepEqual(out.tasks[1].result, { pass: 1 })
        assert.equal(registry.has('a'), true)
    })

    test('7. an array handle splices into an array option', async () => {
        const { run } = harness()
        const out = await run('list --xs 1 2 as xs\nlist --xs 0 @xs 9')
        assert.equal(out.ok, true)
        assert.deepEqual(out.tasks[1].result, { list: [0, 1, 2, 9] })
    })

    test('8. an object handle fills a single-value option slot', async () => {
        const { run } = harness()
        const out = await run('obj as o\npass -x @o')
        assert.equal(out.ok, true)
        assert.deepEqual(out.tasks[1].result, { pass: { k: 1 } })
    })

    test('9. an object handle in a list position fails only that task', async () => {
        const { run } = harness()
        const out = await run('obj as o\nlist --xs @o')
        assert.equal(out.tasks[0].status, 'ok')
        assert.equal(out.tasks[1].status, 'error')
        assert.equal(codeOf(out.tasks[1].error), 'BAD_INJECTION')
        assert.equal(out.ok, false)
    })

    test('10. a rejected dependency fails dependents only', async () => {
        const { run } = harness()
        const out = await run('boom as b\npass @b\npass 3')
        assert.equal(out.tasks[0].status, 'error')
        assert.equal(out.tasks[0].error?.message, 'boom!')
        assert.equal(out.tasks[1].status, 'error')
        assert.equal(codeOf(out.tasks[1].error), 'DEP_FAILED')
        assert.equal(out.tasks[1].error?.message, 'Dependency "@b" failed: boom!')
        assert.equal(out.tasks[2].status, 'ok')
        assert.deepEqual(out.tasks[2].result, { pass: 3 })
        assert.equal(out.ok, false)
    })

    test('11. an unknown handle', async () => {
        const { run } = harness()
        const out = await run('pass @nope')
        assert.equal(out.tasks[0].status, 'error')
        assert.equal(codeOf(out.tasks[0].error), 'UNKNOWN_HANDLE')
        assert.equal(out.tasks[0].error?.message, 'Unknown handle "@nope"')
    })

    test('12. no self reference', async () => {
        const { run } = harness()
        const out = await run('pass @a as a')
        assert.equal(out.tasks[0].status, 'error')
        assert.equal(codeOf(out.tasks[0].error), 'UNKNOWN_HANDLE')
    })

    test('13. a rebound handle is read as it stood at scheduling time', async () => {
        const { run } = harness()
        const out = await run('pass 1 as a\npass @a as b\npass 2 as a\npass @a')
        assert.equal(out.ok, true)
        assert.deepEqual(out.tasks[1].result, { pass: 1 })
        assert.deepEqual(out.tasks[3].result, { pass: 2 })
    })

    test('14. handles persist across runs', async () => {
        const { run } = harness()
        await run('pass 7 as seven')
        const out = await run('pass @seven')
        assert.equal(out.ok, true)
        assert.deepEqual(out.tasks[0].result, { pass: 7 })
    })

    test('15. a handled task blocks nothing', async () => {
        const { run, reports } = harness()
        const out = await run('wait 40 as slow\npass 2')
        assert.equal(out.ok, true)
        assert.equal(reports[0].lineIndex, 1)
        assert.deepEqual(out.tasks.map((t) => t.lineIndex), [0, 1])
        assert.deepEqual(out.tasks[1].result, { pass: 2 })
    })

    test('16. the sequential chain continues after a failure', async () => {
        const { run } = harness()
        const out = await run('boom\npass 5')
        assert.equal(out.tasks[0].status, 'error')
        assert.equal(out.tasks[1].status, 'ok')
        assert.deepEqual(out.tasks[1].result, { pass: 5 })
    })

    test('17. empty programs', async () => {
        const { run } = harness()
        for (const text of ['', '  \n\n']) {
            const out = await run(text)
            assert.deepEqual(out.tasks, [])
            assert.equal(out.ok, true)
        }
    })

    test('18. help mode short-circuits', async () => {
        const { run } = harness()
        const out = await run('pass --help')
        assert.equal(out.ok, true)
        assert.deepEqual(out.tasks[0].result, { pass: { description: 'no help defined' } })
    })

    test('19. the handle value is the childmost result', async () => {
        const modules: Modules = {
            p: { fn: () => 'parent', submodules: { c: { fn: () => 'child' } } }
        }
        const { run, registry } = harness(modules)
        const out = await run('p c as h')
        assert.equal(out.ok, true)
        assert.equal(await registry.lookup('h'), 'child')
    })

    test('20. man mode short-circuits', async () => {
        const { run } = harness({ match })
        const out = await run('match --man')
        assert.equal(out.ok, true)
        const result = out.tasks[0].result
        assert.ok(result !== null)
        assert.deepEqual(Object.keys(result), ['match'])
        assert.equal(isManPage(result.match), true)
    })
})
