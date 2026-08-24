import { makeRunner, CliApp, Opts, DataHandler, fakeCli, shared } from './evaluator'
import { isNode } from './util'
import { ReplOptions, REPLServer } from 'node:repl'

export const apps: { [id: string]: CliApp } = {}

// Drains the queue that multilinePreprocessor fills, so lines 2..n of a
// multiline input actually run instead of being silently dropped.
const multilineUserEffect: DataHandler = async function multilineUserEffect(_, __, appId) {
    const shifted = shared.queue.shift()
    if (shifted) {
        await fakeCli(shifted, appId, true)
    }
}

const genericDataHandler: DataHandler = async (_, data, appId) => {
    const zodStore = apps[appId].zodStore
    zodStore[Date.now()] = data
    return data
}

export const createApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {

    const { id, multilineDefaults: userMultilineDefaultsChoice } = opts
    const multilineDefaults = userMultilineDefaultsChoice === undefined ? true : userMultilineDefaultsChoice
    if (isNode()) {
        if (opts.userKeyEffects) {
            console.warn('"userKeyEffects" is not yet implemented for node platform')

            process.on('unhandledRejection', console.log);
        }

        const sourceMapSupport = await (new Function(`return import('source-map-support');`)() as Promise<{ install: () => void }>);
        sourceMapSupport.install();

        const xProm = (new Function(`return import('node:repl')`)()) as Promise<{
            default: {
                start: ((opts: ReplOptions) => REPLServer)

            }
        }>

        apps[id] = {
            evaluator: runner ? runner : makeRunner({ ...opts }, apps),
            zodStore: {},
            dataHandler: opts.dataHandler ?? genericDataHandler,
            userEffects: multilineDefaults
                ? [multilineUserEffect, ...(opts.userEffects ?? [])]
                : (opts.userEffects ?? []),
            userKeyEffects: [],
            rememberAutomated: true
        }

        const { default: repl } = await xProm

        if (repl && typeof repl.start === 'function') {
            repl.start({
                prompt: '> ',
                eval: (input, _, __, cb) => {
                    apps[id].evaluator(input, genericDataHandler, cb)
                }
            })
        } else {
            // Some runtimes (bun as of 1.3) ship node:repl as a stub with no
            // start(). Everything else in peprn works there, so fall back to a
            // readline loop that presents the same prompt and output.
            await startReadlineRepl(id)
        }
        if (opts.init) {
            opts.init(id, apps)
        }
    }
}

const startReadlineRepl = async (id: string) => {
    const { createInterface } = await (new Function(`return import('node:readline')`)() as Promise<
        typeof import('node:readline')
    >)

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> '
    })

    rl.prompt()

    rl.on('line', (line) => {
        apps[id].evaluator(line, genericDataHandler, (err, result) => {
            if (err) {
                console.error(`Uncaught ${err.message ?? err}`)
            } else {
                console.log(result)
            }
            rl.prompt()
        })
    })

    rl.on('close', () => {
        process.exit(0)
    })
}
