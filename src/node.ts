import { CallReturn, makeRunner, CliApp, ZodStore } from './evaluator'
import strlog from './util/strlog'
import { isNode } from './util'
const id = 'CLI'

export const apps: { [id: string]: CliApp } = {}

const genericDataHandler = (zodStore: ZodStore, data: any, params: { time: number }) => {
    zodStore[params.time] = data
    strlog(zodStore)
}

export const createApp = async (id: string /*, taSelector: string, dataSelector: string*/) => {
    if (isNode()) {
        const { default: repl } = await import('node:repl')

        apps['CLI'] = { evaluator: makeRunner({ id }), zodStore: {} }

        const appDataHandler: CallReturn = (input, data) => {
            genericDataHandler(apps['CLI'].zodStore, data, { time: Date.now() })
        }

        repl.start({
            prompt: '> ',
            eval: async (input, cyx, fn, cb) => {
                apps['CLI'].evaluator(input, appDataHandler, cb)
            }
        })
    }

}

createApp(id)

