import { useEffect, useRef, useState } from 'react';
import { createBrowserApp, DataHandler } from 'peprn';
import { apps, cleanHistory, earlySaveHistory } from "peprn/browser";
import { ParsedCli } from 'peprn/util';


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
        await earlySaveHistory(appId, storableHist)
    }
    textArea.value = rawInput;

    textArea.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }),
    );
    const result = await apps[appId].restarter;

    return result;
};

export const useFakeCli = () => {
    return fakeCli
}

export const useCreateApp = (...appArgs: Parameters<typeof createBrowserApp>) => {

    const [initted, setInitted] = useState(false)

    const ta = useRef<HTMLTextAreaElement | null>(null)
    const out = useRef<HTMLDivElement | null>(null)

    const id = appArgs[0].id

    const taSel = `#${id}`
    const outSel = `#${id}-out`

    useEffect(() => {
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

    useEffect(() => {
        if (!initted) return
        createBrowserApp(...appArgs);
    }, [initted])
}


// use once per app
const useAppsInitted = (ids: string[], addId: (inittedId: string) => void) => {
    useEffect(() => {

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

    const [ran, setRan] = useState(false)

    const [initted, setInitted] = useState<string[]>([])
    const addId = (inittedId: string) => {
        if (!initted.includes(inittedId)) {
            initted.push(inittedId)
            setInitted([...initted])
        }
    }
    useAppsInitted(requiredIds, addId)
    useEffect(() => {
        if (ran) return
        const firstUninitialized = requiredIds.find((requiredId: string) => initted.includes(requiredId) === false)

        if (firstUninitialized === undefined) {
            setRan(true)
            fn()
        }
    }, [JSON.stringify(initted)])
}

export const useAddUserEffectFn = (id: string) => {

    return (fn: DataHandler, argsMatcher: (parsedCli: ParsedCli) => boolean = () => true) => {
        if (!apps || !apps[id]) return

        if (apps[id].userEffects.find(anFn => anFn === fn) !== undefined) {
            return
        }

        if (apps && apps[id]) {
            apps[id].userEffects.push(async (...dHArgs: Parameters<DataHandler>) => {
                if (
                    argsMatcher(dHArgs[2].args)
                ) {
                    return fn(...dHArgs)
                }
            })
        }

    }
}

