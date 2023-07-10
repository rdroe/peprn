import { makeRunner, CliApp, Opts, DataHandler, CliApps } from './evaluator'
import { isNode } from './util'
import { ReplOptions, REPLServer } from 'node:repl'
import { ParsedCli } from 'util/cliParser'

export const apps: { [id: string]: CliApp } = {}


const genericDataHandler: DataHandler = async (id: string, data: any, argz: { args: ParsedCli, appId: string, apps: CliApps }) => {
    const zodStore = apps[argz.appId].zodStore
    zodStore[Date.now()] = data
    return data
}
let nodeReplOpts: ReplOptions
let nodeRepl: REPLServer
export const createApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {

    const { id } = opts
    if (isNode()) {


        const xProm = (new Function(`return import('node:repl')`)()) as Promise<{
            default: {
                start: ((opts: typeof nodeReplOpts) => typeof nodeRepl)

            }
        }>

        apps[id] = {
            evaluator: runner ? runner : makeRunner({ ...opts }, apps),
            zodStore: {},
            dataHandler: opts.dataHandler ?? genericDataHandler,
            userEffects: opts.userEffects ?? []
        }
        const { default: repl } = await xProm

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
