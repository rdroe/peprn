import { getMatchingModules, parse, ParsedCli, yargsOptions } from './util/cliParser'
import awaitAll from './util/awaitAll'
import match from './match'
import { Modules } from './util/types'

export type DataHandler = (inp: string, data: any, context: { args: ParsedCli, appId: string, apps: CliApps }) => Promise<void>

export type Opts = {
    id: string
    modules?: Modules
    history?: CliApp['history']
    preprocessInput?: (input: string, appId?: string, appsSingleton?: CliApps) => string
    dataHandler?: DataHandler
    init?: (ownId: string, apps: CliApps) => void
    userEffects?: DataHandler[]
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
    userEffects: DataHandler[]
}

export type CliApps = { [id: string]: CliApp }
export type EvalInteraction = 'called' | 'not-called'

export type CallReturn = (err: null | Error, success: any) => void

export const makeRunner = (opts: Opts, appsSingleton: CliApps): (input: string, dataCallback: DataHandler, finalCallback: CallReturn) => Promise<void> => {

    const { modules = { match }, id } = opts

    return async (inputRaw: string, dataCallback: DataHandler, finalCallback: CallReturn) => {

        const input = opts.preprocessInput ? opts.preprocessInput(inputRaw, id, appsSingleton) : inputRaw

        const parsed = parse({ match, ...modules }, yargsOptions, input)
        const matched = getMatchingModules({ match, ...modules })(input)


        const effects: DataHandler[] = Object.values(appsSingleton).map((app1) => app1.userEffects).reduce((fns, currFns) => {
            return fns.concat(currFns)
        }, [] as DataHandler[])

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


                        const results = await matched[o].fn.call(null, parsed, successiveCalls, id, appsSingleton)
                        const singletonPackage = { appId: id, apps: appsSingleton, args: parsed }
                        const callbackResults = await dataCallback(moduleName, results, singletonPackage)
                        await Promise.all(effects.map((fn1) => fn1(moduleName, callbackResults, singletonPackage)))
                        return callbackResults
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

