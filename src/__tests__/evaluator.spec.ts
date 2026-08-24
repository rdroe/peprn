import { makeRunner, CliApp, CliApps, DataHandler } from '../evaluator'
import match from '../match'
import { Modules } from '../util/types'

function makeApps(id: string, runner?: CliApp['evaluator']): CliApps {
    const apps: CliApps = {}
    apps[id] = {
        evaluator: runner ?? (async () => {}),
        zodStore: {},
        dataHandler: async () => {},
        userEffects: [],
        userKeyEffects: [],
        rememberAutomated: false,
    }
    return apps
}

function run(
    runner: ReturnType<typeof makeRunner>,
    input: string,
    dataCallback: DataHandler
): Promise<void> {
    return new Promise((res, rej) => {
        const result = runner(input, dataCallback, (err) => {
            if (err) rej(err)
            else res()
        })
        if (result && typeof result.then === 'function') {
            result.then(() => res()).catch(rej)
        }
    })
}

describe('makeRunner', () => {
    it('returns a function', () => {
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules: { match } }, apps)
        expect(typeof runner).toBe('function')
    })

    it('calls dataCallback when a module matches', async () => {
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules: { match } }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        await run(runner, 'match scalar -l 1 -r 1', cb)
        expect(cb).toHaveBeenCalled()
    })

    it('calls finalCallback with no match', async () => {
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules: { match } }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        const finalCb = jest.fn()
        runner('nonexistent', cb, finalCb)
        await new Promise((r) => setTimeout(r, 10))
        expect(finalCb).toHaveBeenCalledWith(null, null)
    })

    it('returns help output for --help flag', async () => {
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules: { match } }, apps)
        apps.test.evaluator = runner

        const received: unknown[] = []
        const cb: DataHandler = jest.fn(async (_parsed, data) => {
            received.push(data)
        })
        await run(runner, 'match --help', cb)
        expect(received.length).toBeGreaterThan(0)
    })

    it('passes parsed args to the module fn', async () => {
        const receivedArgs: unknown[] = []
        const modules: Modules = {
            cmd: {
                fn: async (args) => {
                    receivedArgs.push(args)
                    return 'done'
                },
                yargs: { flag: { alias: 'f', type: 'boolean' } },
            },
        }

        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        await run(runner, 'cmd --flag', cb)
        expect(receivedArgs.length).toBeGreaterThan(0)
        expect((receivedArgs[0] as Record<string, unknown>)['flag']).toBe(true)
    })

    it('invokes the custom catch handler on preprocessor error', async () => {
        const modules: Modules = { cmd: { fn: async () => 'ok' } }
        const apps = makeApps('test')
        const caught: Error[] = []
        const runner = makeRunner(
            {
                id: 'test',
                modules,
                multilineDefaults: false,
                preprocessInput: () => { throw new Error('preprocess failed') },
                catch: (e) => caught.push(e),
            },
            apps
        )
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        await runner('cmd', cb, () => {}).catch(() => {})
        expect(caught.length).toBeGreaterThan(0)
    })

    // --- regressions ---

    it('treats a blank line as a no-op rather than an error', async () => {
        const modules: Modules = { cmd: { fn: async () => 'ok' } }
        const apps = makeApps('test')
        const caught: Error[] = []
        const runner = makeRunner({ id: 'test', modules, catch: (e) => caught.push(e) }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        const finalCb = jest.fn()
        await runner('   ', cb, finalCb)
        expect(finalCb).toHaveBeenCalledWith(null, null)
        expect(caught).toHaveLength(0)
    })

    it('detects --man when it is the final token', async () => {
        // The node repl hands eval its input with a trailing newline, so the
        // manual check has to trim before splitting.
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules: { match } }, apps)
        apps.test.evaluator = runner

        const received: unknown[] = []
        const cb: DataHandler = jest.fn(async (_p, data) => { received.push(data) })
        await run(runner, 'match --man\n', cb)

        const manual = received[0] as [string, unknown][]
        expect(Array.isArray(manual)).toBe(true)
        expect(manual.map(([stem]) => stem)).toEqual(['match', 'match scalar'])
    })

    it('routes an error thrown inside a module fn to the catch handler', async () => {
        const modules: Modules = {
            boom: { fn: async () => { throw new Error('module exploded') } },
        }
        const apps = makeApps('test')
        const caught: Error[] = []
        const runner = makeRunner({ id: 'test', modules, catch: (e) => caught.push(e) }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        const finalCb = jest.fn()
        runner('boom', cb, finalCb)
        await new Promise((r) => setTimeout(r, 50))

        expect(caught.map((e) => e.message)).toContain('module exploded')
        // finalCallback must still fire, or callers hang forever
        expect(finalCb).toHaveBeenCalledWith(null, null)
    })

    it('reports a module fn error through finalCallback when no catch is supplied', async () => {
        const modules: Modules = {
            boom: { fn: async () => { throw new Error('module exploded') } },
        }
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn().mockResolvedValue(undefined)
        const finalCb = jest.fn()
        runner('boom', cb, finalCb)
        await new Promise((r) => setTimeout(r, 50))

        expect(finalCb).toHaveBeenCalledTimes(1)
        const [err] = finalCb.mock.calls[0]
        expect((err as Error).message).toBe('module exploded')
    })

    it('gives a parent module its descendants calls without deadlocking on itself', async () => {
        // A module handed the live successiveCalls map would await its own
        // promise and hang; it must only see its children.
        const modules: Modules = {
            parent: {
                fn: async (_args, children) => {
                    const resolved = await Promise.all(Object.values(children ?? {}))
                    return { childCount: resolved.length, children: resolved }
                },
                submodules: {
                    child: { fn: async () => 'child-result' },
                },
            },
        }
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules }, apps)
        apps.test.evaluator = runner

        const seen: unknown[] = []
        const cb: DataHandler = jest.fn(async (_p, data) => { seen.push(data) })
        await run(runner, 'parent child', cb)
        await new Promise((r) => setTimeout(r, 20))

        const parentResult = seen.find(
            (d) => !!d && typeof d === 'object' && 'childCount' in (d as object)
        ) as { childCount: number, children: unknown[] }

        expect(parentResult).toBeDefined()
        expect(parentResult.childCount).toBe(1)
        expect(parentResult.children).toEqual(['child-result'])
    })

    it('preprocesses multiline input into queued commands', async () => {
        const results: unknown[] = []
        const modules: Modules = {
            echo: {
                fn: async (args) => args,
            },
        }
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules }, apps)
        apps.test.evaluator = runner

        const cb: DataHandler = jest.fn(async (_p, data) => {
            results.push(data)
        })
        await run(runner, 'echo\necho', cb)
        expect(cb).toHaveBeenCalled()
    })
})
