import { makeRunner, CliApp, Opts, DataHandler } from './evaluator'
import { isNode } from './util'
import { ReplOptions, REPLServer } from 'node:repl'

export const apps: { [id: string]: CliApp } = {}


const genericDataHandler: DataHandler = async (id: string, data: any, { args: ParsedCli, appId: string, apps: CliApps }) => {
    const zodStore = apps[id].zodStore
    zodStore[Date.now()] = data
    return data
}
let nodeReplOpts: ReplOptions
let nodeRepl: REPLServer
export const createApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {

    const { id } = opts
    if (isNode()) {
        const { default: repl } = await new (Function(`import('node:repl')`)()) as {
            default: {
                start: ((opts: typeof nodeReplOpts) => typeof nodeRepl)

            }
        }
        apps[id] = {
            evaluator: runner ? runner : makeRunner({ ...opts }, apps),
            zodStore: {},
            dataHandler: opts.dataHandler ?? genericDataHandler,
            userEffects: opts.userEffects ?? []
        }

        repl.start({
            prompt: '> ',
            eval: async (input, _, __, cb) => {
                apps[id].evaluator(input, genericDataHandler, cb)
            }
        })
        if (opts.init) {
            opts.init(id, apps)
        }
    }
}
