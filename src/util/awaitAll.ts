const isProm = (arg1: unknown): boolean => {
    if (arg1 === null) return false
    if (arg1 === undefined) return false
    if (typeof arg1 === 'function') return false
    const isFunc = (propVal: unknown): boolean => typeof propVal === 'function'
    const rec = arg1 as Record<string, unknown>
    return ['catch', 'finally', 'then'].reduce((tOrF: boolean, fnName: string) => {
        if (tOrF === false) { return false }
        return rec[fnName] !== undefined && isFunc(rec[fnName])
    }, true)
}

/**
   Passed an object with mixed Promisory and non-promisory values, await all of the promisory ones and return an object in which each property is its own awaited value.
*/
export default async function awaitAll<T = unknown>(allProperties: {
    [numOrString: string]: unknown,
}): Promise<T> {

    const props: string[] = []
    const vals: Promise<unknown>[] = []
    Object.entries(allProperties).forEach(([p, v]) => {
        if (isProm(v)) {
            vals.push(v as Promise<unknown>)
        } else {
            vals.push(Promise.resolve(v))
        }
        props.push(p)
    })

    const completions = await Promise.all(vals)

    const cb = (accum: T, prop: string, idx: number) => {
        return { ...accum, [prop]: completions[idx] }
    }

    return props.reduce(cb, {} as T)
}
