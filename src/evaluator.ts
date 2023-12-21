import { getMatchingModules, parse, ParsedCli, yargsOptions } from './util/cliParser'
import awaitAll from './util/awaitAll'
import match from './match'
import { Modules, Module } from './util/types'
import { z } from 'zod'
import { isNode, PEPRN_AUTO_TRUE, PEPRN_MULTILINE_INDEX, PEPRN_MULTILINE_TOTAL, PEPRN_MULTILINE_TRUE } from './util'

type PromiseByLine = [
    nonWhitespaceLineNumber: number,
    prom: any
]

export const shared: {
    queue: string[]
} = {
    queue: []
}


let apps: CliApps | null = null
const regexGetLineNumber = /peprn\:multilineIndex\s([0-9]{1,3})/;
const regexGetProgramSize = /peprn\:multilineTotal\s([0-9]{1,3})/;
const parseLine = (line: string): number => {
    const parse = line.match(regexGetLineNumber)
    if (!parse || !parse[1]) return -99
    return parseInt(parse[1])
}
const parseLineForProgramSize = (line: string): number => {
    const parse = line.match(regexGetProgramSize)
    if (!parse || !parse[1]) return 0
    return parseInt(parse[1])
}
export const fakeCli = async (rawInput: string, appId: string = 'cli', isInternal = false) => {
    if (!apps) return
    const rawInTrimmed = rawInput.trim()
    const rawIn = !isInternal
        ? rawInTrimmed.replace(/\s\s+/g, ' ').trim()
        : `${rawInTrimmed} ${PEPRN_AUTO_TRUE}`.replace(/\s\s+/g, ' ').trim()

    const prom = await apps[appId].evaluator(rawIn, apps[appId].dataHandler, () => { })
    const ownLineNum = parseLine(rawIn)

    const dw =
        ownLineNum > 0 && apps[appId].dataWait
            ?
            apps[appId].dataWait : []

    const priorLines = dw.filter(([lineNum, prom]) => {
        if (lineNum < 0) return false
        return lineNum < ownLineNum
    })

    const progSize = parseLineForProgramSize(rawIn)
    if (priorLines.length) {
        await Promise.all(priorLines.map(([, prom]) => prom))
        const ownPromTuple = dw.find(([k]) => k === ownLineNum)
        if (ownLineNum === progSize - 1) {
            await Promise.all(Object.values(
                apps[appId].dataWait
            ))
            delete apps[appId].dataWait
        }

        if (ownPromTuple) {
            const data = await ownPromTuple[1]
            const sortedByKeyLength = Object.entries(data).sort(([cliLineA], [cliLineB]) => {
                return cliLineB.length - cliLineA.length
            })

            const longestByKey = sortedByKeyLength[0]

            console.log('awaited data', data, 'longest', longestByKey)

            return longestByKey[1]
        }
    }
    console.log('nested call', rawIn, 'result', prom)
    return prom
};


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
    useBrowserDefault?: false
    catch?: (err: Error, rawInput: string, parsedCli: ParsedCli | null) => void
    multilineDefaults?: boolean
    rememberAutomated?: boolean
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
    dataWait?: PromiseByLine[]
    rememberAutomated: boolean
}

export type CliApps = { [id: string]: CliApp }
export type EvalInteraction = 'called' | 'not-called'

export type CallReturn = (err: null | Error, success: any) => void
export type ArgsMatcher = (parsedCli: ParsedCli) => boolean
export const argsMatchers = new Map<DataHandler, ArgsMatcher>

const isCallForHelp = (input: string): boolean => {
    return input
        .trim()
        .split(' ')
        .includes('--help') || input
            .trim()
            .split(' ')
            .includes('-h')
}

const getHelpOutput = (matched: Module[], parsed: ParsedCli) => {
    const modHelp = matched.filter(({ help }) => {
        return !!help
    })

    let helpResults: any = "no help defined"

    if (modHelp[0]) {
        helpResults = modHelp[0]
        const examplePrefix = parsed.commands.join(' ')
        helpResults = {
            [examplePrefix]: modHelp[0].help.description,
            examples: !modHelp[0].help.examples ? {} : Object.fromEntries(Object.entries(
                modHelp[0].help.examples
            ).map(([exampleArgs, exampleDes]) => {
                return [`${examplePrefix} ${exampleArgs}`, exampleDes]
            }))
        }
    }


    return helpResults
}

export const makeRunner = (
    opts: Opts,
    appsSingleton: CliApps
): (
    input: string,
    dataCallback: DataHandler,
    finalCallback: CallReturn
) => Promise<any> /* end type definition for makeRunner return*/ => { // begin actual function definition
    apps = appsSingleton
    const { modules = { match }, id } = opts
    // Note: opts.multiLineDefaults is used both here and in browser.ts and node.ts (but not node, yet)
    if (opts.multilineDefaults || opts.multilineDefaults === undefined) {
        if (opts.preprocessInput) {
            opts.preprocessInput = (preprocIn) => {
                const multilineResult = multilinePreprocessor(preprocIn)
                if (multilineResult === null) {
                    return null
                }
                return opts.preprocessInput(multilineResult, id, appsSingleton)
            }
        } else {
            opts.preprocessInput = multilinePreprocessor
        }

    }


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

            parsed = parse({ match, ...modules }, input)

            const matched = getMatchingModules({ match, ...modules })(input)

            const effects = appsSingleton[id]?.userEffects ?? []

            if (matched.length) {
                matched.reverse()
                if (isCallForHelp(input)) {

                    const helpResults = getHelpOutput(
                        matched,
                        parsed
                    )

                    dataCallback(parsed, helpResults, id).then(() => {
                        finalCallback(null, helpResults)
                    })

                    return
                }

                const modNames = [...parsed.moduleNames]

                modNames.reverse()

                let n = 0

                const successiveCalls: { [modName: string]: Promise<unknown> } = {}
                let resolveAllCalled: () => void = () => { }
                let allCalledProm: Promise<void> = new Promise((res) => {
                    resolveAllCalled = res
                })

                do {

                    const o = n
                    const moduleName = modNames[o]

                    // call all fns
                    successiveCalls[moduleName] = (
                        (async function peprnModuleLoop() {

                            await allCalledProm // wait for all promises to be initialized before actually calling any functions on modules
                            const parsed2 = {
                                ...parsed,
                                // some use cases likely only want the deepest module invokation (i.e. supposing a user wants to print only the bottom line of the program entered. the lineation is unrelated to ancestralDepth, but we need the ancestral depth in that case
                                'peprn:ancestralDepth': o,
                            }

                            const resultProm = matched[o].fn(o === 0 ? {
                                ...parsed2,
                                'peprn:childmost': true
                            } : parsed2, successiveCalls, id, appsSingleton).then(async (resolved: any) => {

                                if (!appsSingleton[id].dataWait) {
                                    appsSingleton[id].dataWait = []
                                }

                                if (parsed.rawIn) {

                                    const dataProm = awaitAll(successiveCalls)
                                    const cliLineProm2 = [
                                        parsed[PEPRN_MULTILINE_INDEX] ?? -99,
                                        dataProm
                                    ] as PromiseByLine

                                    const myLine = parseLine(parsed.rawIn.toString())
                                    if (myLine >= 0 && appsSingleton[id].dataWait.find(([k]) => k === myLine) === undefined) {
                                        console.log('new push in dataWait',
                                            {
                                                cli: parsed.rawIn,
                                                progSize: parsed[PEPRN_MULTILINE_TOTAL],
                                                myLine: parsed[PEPRN_MULTILINE_INDEX],
                                                'var o': o,
                                                parsed2: JSON.parse(JSON.stringify(parsed2)),

                                            })
                                        appsSingleton[id].dataWait.push(cliLineProm2)
                                    }






                                }

                                dataCallback(o === 0 ? {
                                    ...parsed2,
                                    'peprn:childmost': true,
                                } : parsed2, resolved, id)

                                effects.forEach((fn1) => {
                                    const matcher = argsMatchers.get(fn1) ?? null
                                    if (matcher === null || matcher(parsed)) {
                                        fn1(parsed2, resolved, id)
                                    }
                                })
                                return resolved
                            })
                            return resultProm
                        })() //auto-call peprnModuleLoop as soon as it's defined
                    )
                    n += 1
                } while (!!matched[n])

                // end call all fns
                resolveAllCalled()

                const allData = awaitAll(successiveCalls).then((ad) => {
                    if (finalCallback) { return finalCallback(null, ad) }
                })

                if (!isNode()) {
                    await allData
                }
                return allData
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



function multilinePreprocessor(snt: string): string | null {

    if (snt.trim() === '') {
        return null;
    }
    if (snt.includes('"')) {
        throw new Error(`Do not include quotation marks`);
    }
    if (snt.includes('\n')) {
        const nth = PEPRN_MULTILINE_INDEX
        const mlTrue = PEPRN_MULTILINE_TRUE
        const mlTot = PEPRN_MULTILINE_TOTAL
        const sntsSplit = snt.trim().split('\n')

        const sntsProcessed = sntsSplit.map((userLine, idx): string => {
            return `${userLine} --${nth} ${idx} --${mlTot} ${sntsSplit.length} ${mlTrue}`

        })

        const snts = sntsProcessed.reduce((accum, curr) => {
            const trimed = curr.trim();
            if (!trimed) {
                return accum;
            }
            return [...accum, trimed];
        }, [] as string[]);
        const snt1 = snts.shift();
        shared.queue.push(...snts.map((userLine, idx) => {
            return userLine
        }));
        const call = snt1
        return call;
    } else {
        return snt;
    }
}
