import React from 'react'
import { ArgsMatcher, argsMatchers, createBrowserApp, DataHandler } from '../index';
import { apps } from '../browser';
import { cleanHistory, earlySaveHistory } from '../browser-default-history';
import { PEPRN_AUTO_TRUE } from '../util';
import { fakeCli as fakeCliFn } from '../evaluator'

type DataHandlerReactCallback = DataHandler

const createAppIntervals: {
    [prop: string]: ReturnType<typeof setInterval>
} = {}

export const fakeCli = fakeCliFn

export const useFakeCli = () => {
    return fakeCli
}

export const useCreateApp = (...appArgs: Parameters<typeof createBrowserApp>) => {
    const [initted, setInitted] = React.useState(false)

    const ta = React.useRef<HTMLTextAreaElement | null>(null)
    const out = React.useRef<HTMLDivElement | null>(null)

    const id = appArgs[0].id

    const taSel = `#${id}`
    const outSel = `#${id}-out`

    React.useEffect(() => {
        if (initted) return

        if (createAppIntervals[id] === undefined) {
            createAppIntervals[id] = setInterval(() => {
                ta.current = document.querySelector(taSel)
                out.current = document.querySelector(outSel)
                if (ta.current && out.current) {
                    setInitted(true)
                    clearInterval(createAppIntervals[id])
                }
            }, 100)
        }
    }, [])

    React.useEffect(() => {
        if (!initted) return
        createBrowserApp(...appArgs);
    }, [initted])
}


// use once per app
const useAppsInitted = (ids: string[], addId: (inittedId: string) => void) => {
    React.useEffect(() => {

        const inittedAppIntervals: {
            [prop: string]: ReturnType<typeof setInterval>
        } = {}
        ids.forEach((id) => {
            if (inittedAppIntervals[id] === undefined) {
                inittedAppIntervals[id] = setInterval(() => {
                    if (apps[id]) {
                        addId(id)
                        clearInterval(inittedAppIntervals[id])
                    }
                }, 100)
            }
        })
    }, [])

}

export const useOnAppsInitted = (requiredIds: string[], fn: (...args: any[]) => void) => {

    const [ran, setRan] = React.useState(false)

    const [initted, setInitted] = React.useState<string[]>([])
    const addId = (inittedId: string) => {
        if (!initted.includes(inittedId)) {
            initted.push(inittedId)
            setInitted([...initted])
        }
    }
    useAppsInitted(requiredIds, addId)
    React.useEffect(() => {
        if (ran) return
        const firstUninitialized = requiredIds.find((requiredId: string) => initted.includes(requiredId) === false)

        if (firstUninitialized === undefined) {
            setRan(true)
            fn()
        }
    }, [JSON.stringify(initted)])
}


export const useAddUserEffectFn = (id: string) => {

    return (fn: DataHandlerReactCallback, argsMatcher: ArgsMatcher = () => true) => {

        if (!apps || !apps[id]) return

        if (apps[id].userEffects.find(anFn => {
            return anFn === fn
        }) !== undefined) {
            return false
        }

        if (apps && apps[id]) {
            apps[id].userEffects.push(fn)
            argsMatchers.set(fn, argsMatcher)
        }
    }
}

