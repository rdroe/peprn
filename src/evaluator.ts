import { getMatchingModules, parse, ParsedCli, yargsOptions } from './util/cliParser'
import awaitAll from './util/awaitAll'
import match from './match'
import { Modules } from './util/types'
export type DataHandler = (inp: string, data: any, context: { args: ParsedCli, appId: string, apps: CliApps }) => void
export type Opts = {
    id: string
    modules?: Modules
    history?: CliApp['history']
    preprocessInput?: (input: string) => string
    dataHandler?: DataHandler
}

export type ZodStore = {
    [id: string | number]: {
        typings: any,
        data: any
    }
}

export type CliApp = {
    evaluator: ReturnType<typeof makeRunner>
    el?: HTMLTextAreaElement
    dataEl?: HTMLElement
    zodStore: ZodStore
    restarter?: Promise<void>
    dataHandler: DataHandler
    history?: (key: KeyboardEvent, evalInteraction: EvalInteraction) => Promise<void>
    historyData?: string[]
    histCursor?: number
}

export type CliApps = { [id: string]: CliApp }
export type EvalInteraction = 'called' | 'not-called'

export type CallReturn = (err: null | Error, success: any) => void

export const makeRunner = (opts: Opts, appsSingleton: CliApps): (input: string, dataCallback: DataHandler, finalCallback: CallReturn) => Promise<void> => {

    const { modules = { match }, id } = opts
    return async (inputRaw: string, dataCallback: DataHandler, finalCallback: CallReturn) => {
        const input = opts.preprocessInput ? opts.preprocessInput(inputRaw) : inputRaw
        console.log('preprocced', input)
        const parsed = parse({ match, ...modules }, yargsOptions, input)
        const matched = getMatchingModules({ match, ...modules })(input)
        // here, use the module-matching functions from the recent work on event-y things.
        if (matched.length) {

            matched.reverse()
            const modNames = [...parsed.moduleNames]
            modNames.reverse()

            let n = 0
            const successiveCalls: { [modName: string]: Promise<unknown> } = {}

            do {
                const o = n
                const moduleName = modNames[o]
                successiveCalls[moduleName] = (
                    (async () => {

                        console.log('id in module caller', id)
                        const results = await matched[o].fn.call(null, parsed, successiveCalls, id, appsSingleton)
                        dataCallback(moduleName, results, { appId: id, apps: appsSingleton, args: parsed })
                        return results
                    })()
                )
                n += 1
            } while (!!matched[n])

            const allData = await awaitAll(successiveCalls)

            if (finalCallback) { finalCallback(null, allData) }

        } else {
            finalCallback(null, null)
        }
    }
}

