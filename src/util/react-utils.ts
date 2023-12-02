import React from 'react'
import { ArgsMatcher, argsMatchers, createBrowserApp, DataHandler } from '../index';
import { apps } from '../browser';
import { cleanHistory, earlySaveHistory } from '../browser-default-history';


type DataHandlerReactCallback = DataHandler

const createAppIntervals: {
    [prop: string]: ReturnType<typeof setInterval>
} = {}

export const fakeCli = async (rawInput: string, appId: string = 'cli') => {

    const textArea = apps[appId].el;
    if (!textArea) {
        throw new Error(`Could not find "${appId}" app textarea`);
    }
    const storableHist = cleanHistory(textArea.value)

    if (storableHist) {
        await earlySaveHistory(apps, appId, storableHist,)
    }

    textArea.value = `${rawInput} --peprn:automated true`;

    textArea.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }),
    );
    await apps[appId].restarter


    const rawIn = rawInput.replace(/\s\s+/g, ' ').trim()
    if (apps[appId].dataWait[rawIn]) {
        const calls = await apps[appId].dataWait[rawIn]

        const keys = Object.keys(calls)

        let longest = keys.reduce((accum, key) => {
            return key.length > accum.length ? key : accum
        }, '')
        return calls[longest]
    }

    return apps[appId].restarter;


};

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

