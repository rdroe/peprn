import { CallReturn, makeRunner, CliApp, ZodStore, Opts, DataHandler } from './evaluator'
import strlog from './util/strlog'
import { isNode } from './util'

export const apps: { [id: string]: CliApp } = {}

const genericDataHandler: DataHandler = (id: string, data: any, { args: ParsedCli, appId: string, apps: CliApps }) => {
    const zodStore = apps[id].zodStore
    zodStore[Date.now()] = data
}

export const createApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {
    const { id } = opts


    if (isNode()) {
        const { default: repl } = await import('node:repl')

        apps[id] = {
            evaluator: runner ? runner : makeRunner({ ...opts }, apps),
            zodStore: {},
            dataHandler: opts.dataHandler ?? genericDataHandler
        }

        repl.start({
            prompt: '> ',
            eval: async (input, _, __, cb) => {
                apps[id].evaluator(input, genericDataHandler, cb)
            }
        })
    }
}
