import { CallReturn, makeRunner, CliApp, ZodStore, Opts } from './evaluator'
import strlog from './util/strlog'
import { isNode } from './util'

export const apps: { [id: string]: CliApp } = {}

const genericDataHandler = (zodStore: ZodStore, data: any, params: { time: number }) => {
    zodStore[params.time] = data
    strlog(zodStore)
}

export const createApp = async ({ id, modules }: Opts, runner?: ReturnType<typeof makeRunner>) => {

    const appDataHandler: CallReturn = (error, data) => {
        genericDataHandler(apps[id].zodStore, data, { time: Date.now() })
    }

    if (isNode()) {
        const { default: repl } = await import('node:repl')

        apps[id] = { evaluator: runner ? runner : makeRunner({ id, modules }), zodStore: {} }

        repl.start({
            prompt: '> ',
            eval: async (input, _, __, cb) => {
                apps[id].evaluator(input, appDataHandler, cb)
            }
        })
    }
}
