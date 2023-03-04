
import { getMatchingModules, parse, yargsOptions } from './utils/cliParser'
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
            let n = 0
            const successiveCalls: Promise<any>[] = []

            do {
                const o = n
                successiveCalls.push(
                    (() => {

                        console.log('fn--->', matched[o].fn)
                        Promise.all(successiveCalls)
                        return matched[o].fn.call(null, parsed, successiveCalls)
                    })()
                )
                n += 1
            } while (!!matched[n])

            dataCallback(null, await Promise.all(successiveCalls))
            if (finalCallback) { finalCallback(null, await Promise.all(successiveCalls)) }
        } else {
            finalCallback(null, null)
        }
    }
}

