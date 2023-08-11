import { getMatchingModules, parse, ParsedCli, yargsOptions } from './util/cliParser'
import awaitAll from './util/awaitAll'
import match from './match'
import { Modules } from './util/types'
import { z } from 'zod'

export type DataHandler = (args: ParsedCli, data: any, appId: string) => Promise<void>
export type KeyHandler = (key: KeyboardEvent, appId: string) => Promise<void>
export type Opts = {
    id: string
    modules?: Modules
    history?: CliApp['history']
    preprocessInput?: (input: string, appId?: string, appsSingleton?: CliApps) => string | null
    dataHandler?: DataHandler
    init?: (ownId: string, apps: CliApps) => void
    userEffects?: DataHandler[]
    userKeyEffects?: KeyHandler[]
    catch?: (err: Error, rawInput: string, parsedCli: ParsedCli | null) => void
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
    userKeyEffects: KeyHandler[]
}

export type CliApps = { [id: string]: CliApp }
export type EvalInteraction = 'called' | 'not-called'

export type CallReturn = (err: null | Error, success: any) => void
export type ArgsMatcher = (parsedCli: ParsedCli) => boolean
export const argsMatchers = new Map<DataHandler, ArgsMatcher>
export const makeRunner = (opts: Opts, appsSingleton: CliApps): (input: string, dataCallback: DataHandler, finalCallback: CallReturn) => Promise<void> => {

    const { modules = { match }, id } = opts

    return async (inputRaw: string, dataCallback: DataHandler, finalCallback: CallReturn) => {
        let parsed: ParsedCli | null = null


        try {
            const input = opts.preprocessInput ? opts.preprocessInput(inputRaw, id, appsSingleton) : inputRaw
            if (input === null) {
                throw ({
                    name: "user input could not be processed",
                    message: `raw user input lead to invalid processing (possibly pre-processing)`
                })
            }
            parsed = parse({ match, ...modules }, yargsOptions, input)
            const matched = getMatchingModules({ match, ...modules })(input)

            const effects = appsSingleton[id]?.userEffects ?? []
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

                            const callbackResults = await dataCallback(parsed, results, id)

                            await Promise.all(effects.map((fn1) => {
                                const matcher = argsMatchers.get(fn1) ?? null
                                if (matcher === null || matcher(parsed)) {
                                    return fn1(parsed, results, id)
                                }
                            }
                            ))
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
        } catch (e: unknown) {
            try {
                const isError = z.object({
                    message: z.string(),
                    name: z.string().optional()
                }).safeParse(e)

                if (!isError) {
                    throw e
                }

                if (opts.catch) {
                    if (isError) {
                        opts.catch(e as Error, inputRaw, parsed)
                    }
                    return
                }

                throw new Error(`Could not respond to ${inputRaw} (and peprn app ${opts.id} has no "catch" parametric property)`, { cause: e })

            } catch (e) {
                throw new Error(`Could not respond to ${inputRaw}; and what got thrown could not be duck-typed  to  an Error`, { cause: e })
            }
        }
    }
}


