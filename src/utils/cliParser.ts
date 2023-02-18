import stringArgv from "string-argv"
import { Module, Modules } from "./types"
import { z } from 'zod'
import { single, isNumber } from './validation'


type Opt = {
    type?: 'string' | 'number' | 'boolean' | 'bool'
    array?: boolean
    alias?: string
}

export type Opts = {
    [optName: string]: Opt
} & typeof yargsOptions

// Universal options
export const yargsOptions: {
    [optName: string]: Opt
} = {
    'commands': {
        array: true,
        alias: 'c:c',
    },
    'names': {
        array: true,
        alias: 'c:n',
    },
    'help': {
        type: 'bool'
    }
}


type ParsedArg = string | number | boolean | (string | number | boolean)[]

export type ParsedCli = {
    '_': string[]
    'positionalNonCommands': null | (string | number)[]
    'c:c': string[]
    'commands': string[]
    'c:n': string[]
    'names': string[]
    temp?: any
    [optName: string]: ParsedArg

}

const getIsModuleName = (modules: Modules) => (str: string): boolean => {
    if (!modules) return false

    return !!Object.keys(modules).includes(str)
}

export const parse = (modules: Modules, rawOpts: Opts, rawIn: string | string[]): ParsedCli => {

    const opts: Opts = { ...rawOpts, ...yargsOptions }

    const input: string[] = typeof rawIn === 'string' ? stringArgv(rawIn) : rawIn
    let currSubmodules = modules
    const ret: ParsedCli = input.reduce((accum: ParsedCli, curr) => {

        const isModuleName = getIsModuleName(currSubmodules)

        const { temp } = accum
        // intrinsically, does not start with "-"
        if (isModuleName(curr)) {
            if (temp.lastCommandReached) throw new Error(`Invariant violated; last command should be surpassed if module names are still being encountered.`)
            if (undefined === currSubmodules[curr]) throw new Error(`Invariant violated; as a module name "${curr}" should be a property name in the current submodules being analyzed.`)
            if (!temp.lastCommandReached) {
                currSubmodules = currSubmodules[curr].submodules
                const und = accum['_'] ?? []
                const uInGood = und.concat([curr])
                return {
                    ...accum,
                    _: uInGood

                }
            } else throw new Error(`A command /subcommand name cannot be repeated as an option name `)
        } else if (curr.startsWith('-') && !isNumber(curr)) {

            const newCursOptName = curr.replace(/\-/g, '')
            let newCursOpt: Opt = opts[newCursOptName] || {
                array: false,
            }

            let newCursAlias = newCursOpt.alias ?? null
            if (newCursAlias === null) {

                const aliasOwner = Object.entries(opts).find(([ownerNm, ownerOpt]) => {
                    return ownerOpt.alias === newCursOptName
                })

                if (aliasOwner) {
                    newCursAlias = aliasOwner[0]
                    newCursOpt = aliasOwner[1]
                }

            }


            if (newCursOpt.type === 'bool' || newCursOpt.type === 'boolean') {
                const ret = {
                    ...accum,
                    temp: {
                        ...temp ?? {},
                        lastCommandReached: true
                    }
                };

                (ret as ParsedCli)[newCursOptName] = true

                if (newCursAlias !== null) {
                    (ret as ParsedCli)[newCursAlias] = true;
                }

                return ret
            }

            const newCursNames = newCursAlias ? [newCursOptName, newCursAlias] : [newCursOptName]
            return {
                ...accum,
                temp: {
                    lastCommandReached: true,
                    cursor: [newCursNames, newCursOpt]
                }
            }

            // non-hyphenated thing reached; use cursor if present
        } else if (temp.lastCommandReached && temp?.cursor?.length) {
            const nms = temp.cursor[0]
            const opt: Opt = temp.cursor[1]
            const ret = {
                ...accum
            }
            const parsed = single.parse(curr)
            const newVal: z.infer<typeof single> = parsed
            const currValuation = Object.entries(accum).find(([optName, currVal]) => {

                if (temp.cursor[0].includes(optName)) {

                    return true
                } else {

                    return false
                }
            })

            if (opt.array) {
                let currArr = currValuation ? currValuation[1] : []
                if (!Array.isArray(currArr)) throw new Error(`Valuation of an array:true option should be an array at all times`)
                nms.forEach((optName: string) => {
                    ret[optName] = [
                        ...currArr as (string | number)[],
                        newVal
                    ]
                })
                return ret
            }


            nms.forEach((optName: string) => {
                // special behavior for those always initial


                if (undefined !== ret[optName] && ['c:c', 'commands', 'c:n', 'names'].includes(optName)) {
                    if (!Array.isArray(ret[optName])) {
                        const msg =
                            `value of opt: ${JSON.stringify(opt)}; "ret": ${JSON.stringify(ret)}; failed invariant; info ${JSON.stringify({
                                temp,
                                optName,
                                ret,
                                nms,
                                opts
                            }, null, 2)} `


                        console.warn(`Options name ${optName} in ${curr}; Attempted to supply multiple values to non - array option; or used an alias twice for different options; ${msg}; forcing non-array to be treated as array.`)
                    }
                }

                if (undefined === ret[optName]) {
                    ret[optName] = newVal
                } else {
                    ret[optName] = Array.isArray(ret[optName]) ? [...ret[optName] as any[], newVal] : [ret[optName], newVal]
                }
            })

            return ret

            // non-hyphenated thing, also non-module name, and no cursor yet.
            // this is a positional argument
        } else {
            const { _: und, positionalNonCommands = [] } = accum
            return {
                ...accum,
                positionalNonCommands: (positionalNonCommands ?? []).concat([curr]),
                _: (und ?? []).concat([curr])
            }
        }
    }, {
        positionalNonCommands: null as ParsedArg,
        'c:c': [],
        'c:n': [],
        commands: [],
        names: [],
        temp: {
            lastCommandReached: false,
            cursor: null as null | [string[], Opt]
        }

    } as ParsedCli)

    return ret
}


export const getMatchingModules = (moduleObj: Modules | null) => (str: string): Module[] => {
    console.log('get matching module', moduleObj, str)
    if (!moduleObj) return
    const asArgs = stringArgv(str)
    let modulesAndSubmodules: Module[] = []
    let curs: string | number | undefined = asArgs.shift()
    let currSubmodules = moduleObj
    while (curs && currSubmodules[curs]) {
        const foundModule = currSubmodules[curs] ?? null
        if (foundModule) {
            modulesAndSubmodules.push(foundModule)
        }
        currSubmodules = foundModule && foundModule.submodules ? foundModule.submodules : {}
        curs = asArgs.shift()
    }
    return modulesAndSubmodules
}
