import { getMatchingModules, parse, ParsedCli, yargsOptions } from './util/cliParser'
import awaitAll from './util/awaitAll'
import match from './match'
import { Modules, Module } from './util/types'
import { z } from 'zod'

export const shared: {
    queue: string[]
} = {
    queue: []
}




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
    dataWait?: { [serial: string]: Promise<any> }
}

export type CliApps = { [id: string]: CliApp }
export type EvalInteraction = 'called' | 'not-called'

export type CallReturn = (err: null | Error, success: any) => void
export type ArgsMatcher = (parsedCli: ParsedCli) => boolean
export const argsMatchers = new Map<DataHandler, ArgsMatcher>



const isCallForHelp = (input: string): boolean => {

    return input.trim().split(' ').includes('--help') || input.trim().split(' ').includes('-h')
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
) => Promise<void> /* end type definition for makeRunner return*/ => { // begin actual function definition

    const { modules = { match }, id } = opts
    // Note: opts.multiLineDefaults is used both here and in browser.ts and node.ts (but not node, yet)
    if (opts.multilineDefaults) {
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
            parsed = parse({ match, ...modules }, yargsOptions, input)
            const matched = getMatchingModules({ match, ...modules })(input)

            const effects = appsSingleton[id]?.userEffects ?? []

            if (matched.length) {
                matched.reverse()
                if (isCallForHelp(input)) {

                    const helpResults = getHelpOutput(
                        matched,
                        parsed
                    )
                    await dataCallback(parsed, helpResults, id)
                    finalCallback(null, helpResults)
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


                            const resultProm = matched[o].fn(parsed, successiveCalls, id, appsSingleton).then(async (resolved: any) => {
                                if (!appsSingleton[id].dataWait) {
                                    appsSingleton[id].dataWait = {}
                                }

                                if (parsed.rawIn) {

                                    appsSingleton[id].dataWait[parsed.rawIn.toString()] = appsSingleton[id].dataWait[parsed.rawIn.toString()] ?? awaitAll(successiveCalls)


                                }
                                dataCallback(parsed, resolved, id)
                                effects.forEach((fn1) => {
                                    const matcher = argsMatchers.get(fn1) ?? null
                                    if (matcher === null || matcher(parsed)) {
                                        fn1(parsed, resolved, id)
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



function multilinePreprocessor(snt: string): string | null {

    if (snt.trim() === '') {

        return null;
    }
    if (snt.includes('"')) {
        throw new Error(`Do not include quotation marks`);
    }
    if (snt.includes('\n')) {
        const sntsSplit = snt.split('\n');
        const snts = sntsSplit.reduce((accum, curr) => {
            const trimed = curr.trim();
            if (!trimed) {
                return accum;
            }
            return [...accum, trimed];
        }, [] as string[]);
        const snt1 = snts.shift();
        shared.queue.push(...snts);
        const call = `${snt1}`;
        return call;
    } else {
        return snt;
    }
}
