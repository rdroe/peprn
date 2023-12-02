const isProm = (arg1: any): boolean => {
    if (arg1 === null) return false
    if (arg1 === undefined) return false
    if (typeof arg1 === 'function') return false
    const isFunc = (propVal: any): boolean => typeof propVal === 'function'
    return ['catch', 'finally', 'then'].reduce((tOrF: boolean, fnName: string) => {

        if (tOrF === false) { return false }

        return arg1[fnName] !== undefined && isFunc(arg1[fnName])
    }, true)
}

/**
   Passed an object with mixed Promisory and non-promisory values, await all of the promisory ones and return an object in which each property is its own awaited value.
*/
export default async function awaitAll<T = any>(allProperties: {
    [numOrString: string]: any,
}): Promise<T> {

    let props: string[] = []
    let vals: Promise<any>[] = []
    Object.entries(allProperties).forEach(([p, v]) => {
        if (isProm(v)) {
            vals.push(v)
        } else {
            vals.push(Promise.resolve(v))
        }
        props.push(p)
    })

    const completions = await Promise.all(vals)
    console.log('completions in awaitAll', completions)
    const cb = (accum: T, prop: any, idx: number) => {
        return { ...accum, [prop]: completions[idx] }
    }

    return props.reduce(cb, {} as T)
}
