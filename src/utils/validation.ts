
import { z } from 'zod'


export const isNumber = (arg: string): boolean => {
    return arg.match(/^(\-{0,1}[0-9]*\.[0-9]+|^\-{0,1}[0-9]+)$/) !== null
}

export const num = z.number().or(z.string().refine((val: string) => {
    return isNumber(val)
})).transform((val: string) => {
    return parseFloat(val)
})

export const allNum = (arg: any[]): boolean => {
    let anyIsUndefined = false
    const firstNonNum = arg.find((anArg: any) => {
        if (!anyIsUndefined) {
            anyIsUndefined = (anArg === undefined)
        }

        return !anyIsUndefined && !isNumber(anArg)
    })
    if (anyIsUndefined) return false
    if (firstNonNum === undefined) return true
    return false
}

export const allToNum = (arg: any[]): number[] => {
    return arg.map((anArg) => {
        const num1 = num.parse(anArg)
        if (isNaN(num1)) throw new Error(`Parsing ${arg} turned up NaN`)
        return num1
    })

}


const hasBracket = (str: string) => {
    return str.includes('{') || str.includes('[')
}

export const parseable = z.string().refine((val: string) => {
    if (['null', 'true', 'false'].includes(val.trim())) { return true }
    if (!hasBracket(val)) return false
    try {
        JSON.parse(val)
        return true
    } catch (e) {
        return false
    }
})


export const passivelyParsed = (val: string) => {
    const parseableResult = parseable.safeParse(val)
    if (parseableResult.success) {
        return parseableResult
    }
    return z.string().parse(val)
}

export const single = num.or(parseable.transform((val: string) => {
    return JSON.parse(val)
})).nullable().or(z.string())

export const parseCli = z.array(single)
