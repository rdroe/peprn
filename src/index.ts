import repl from 'node:repl'
import { getMatchingModules, parse, yargsOptions } from './utils/cliParser'
import match from './match'

repl.start({
    prompt: '> ',
    eval: async function(input, context, filename, callback) {
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
                        return matched[o].fn.call(parsed, successiveCalls)
                    })()
                )

            } while (!!matched[n])

            callback(null, await Promise.all(successiveCalls))
        } else {
            callback(null, null)
        }
    }
})
