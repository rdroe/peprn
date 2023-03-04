
import { getMatchingModules, parse, yargsOptions } from './util/cliParser'
import awaitAll from './util/awaitAll'
import match from './match'

type Opts = {
    id: string
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
    dataHandler?: CallReturn
}

export type CallReturn = (err: null | Error, success: any) => void

export const makeRunner = (opts: Opts) => {

    return async (input: string, dataCallback: CallReturn, finalCallback: CallReturn) => {
        const parsed = parse({ match }, yargsOptions, input)
        const matched = getMatchingModules({ match })(input)
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
                    (() => {
                        return matched[o].fn.call(null, parsed, successiveCalls)
                    })()
                )
                n += 1
            } while (!!matched[n])

            const allData = await awaitAll(successiveCalls)
            dataCallback(null, allData)
            if (finalCallback) { finalCallback(null, allData) }

        } else {
            finalCallback(null, null)
        }
    }
}

