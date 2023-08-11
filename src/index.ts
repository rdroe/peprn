import * as utils from './util'
import match from './match'

import { makeRunner, Opts } from './evaluator'


export { match }


export * from './evaluator'

export const createServerApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {
    if (utils.isNode()) {
        const defaultModule = await import('./node')
        return defaultModule.createApp(opts, runner)
    }
    throw new Error(`createServerApp cannot be used in the browser.`)
}


export const createBrowserApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {
    if (!utils.isNode()) {
        const defaultModule = await import('./browser')
        return defaultModule.createApp(opts, runner)
    }
    throw new Error(`createBrowserApp cannot be used in node.`)
}

