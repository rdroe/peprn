import repl from 'node:repl'
import { CallReturn, makeRunner, CliApp, ZodStore } from 'evaluator'
const id = 'CLI'


export const apps: { [id: string]: CliApp } = {}

const genericDataHandler = (zodStore: ZodStore, data: any, params: { time: number }) => {
    zodStore[params.time] = data
}

export const createApp = (id: string /*, taSelector: string, dataSelector: string*/) => {
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


