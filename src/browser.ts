import { makeHistory, history as historyCmd } from './browser-default-history'
import { makeRunner, CliApp, Opts, EvalInteraction, DataHandler } from './evaluator'

import { Modules, Module } from './util/types'
import { conditionallyAddBrowserDefault } from './default-browser-app'

export * from './util/react-utils'
export { earlySaveHistory, cleanHistory, historyIgnore } from './browser-default-history'
export const apps: { [id: string]: CliApp } = {}


const makeFinalCallback = (id: string, res: Function) => async (err: null | Error, result: any) => {
    // @ts-ignore
    if (err) throw new Error(`Error intercepted; `, err)
    res(result)
    apps[id].restarter = makeProm(id)
}

const genericDataHandler: DataHandler = async (parsed, data, uniqueAppId) => {
    const zodStore = apps[uniqueAppId].zodStore
    zodStore[Date.now()] = data
    const dataEl = apps[uniqueAppId].dataEl as HTMLElement
    if (data !== undefined) {
        dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`
    }
}


const defaultModules: Modules = {
    hideOutput: {
        fn: async function() {

            const dataEl = document.querySelector('div.peprn-default-out') as HTMLDivElement
            if (dataEl && dataEl?.style) {
                dataEl.style.right = '100%'
            }
        }
    },
    showOutput: {
        fn: async function() {
            const dataEl = document.querySelector('div.peprn-default-out') as HTMLDivElement
            if (dataEl && dataEl?.style) {
                dataEl.style.right = '0px'
            }
        }
    }
}
export const createApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {
    const { id, modules, history, useBrowserDefault } = opts
    let combinedModules = { ...modules }
    if (useBrowserDefault === undefined) {
        combinedModules = {
            ...modules,
            ...defaultModules
        }
    }
    // if the user did not provide their own history fn
    if (!history) {
        // add the history-editing cli commands (unless user defined same name)
        combinedModules.history = combinedModules.history || historyCmd
    }
    const outputSelector = `#${id}-out`

    apps[id] = {
        el: document.querySelector(`#${id}`),
        dataEl: document.querySelector(outputSelector),
        evaluator: runner ? runner : makeRunner({ ...opts, modules: combinedModules }, apps),
        zodStore: {},
        dataHandler: opts.dataHandler ? opts.dataHandler : genericDataHandler,
        restarter: null,
        userEffects: opts.userEffects ?? [],
        userKeyEffects: opts.userKeyEffects ?? []
    }

    if (useBrowserDefault || useBrowserDefault === undefined) { conditionallyAddBrowserDefault(id, apps) }
    apps[id].restarter = makeProm(id)
    apps[id].history = history ? history : await makeHistory(apps, id)

    if (opts.init) {
        opts.init(id, apps)
    }
}

function makeProm(id: string) {
    return new Promise<void>((res) => {
        apps[id].el.onkeyup = async (ev: KeyboardEvent) => {
            let evalInter: EvalInteraction = 'not-called'
            let t = apps[id].el.value

            if (ev.key === 'Enter' && !ev.shiftKey) {
                const loc1 = apps[id].el.selectionStart
                const loc2 = apps[id].el.selectionEnd
                // in case user hit enter in middle of text
                if (loc1 === loc2) {
                    const x = t.charCodeAt(loc1 - 1)
                    if (x === 10) {
                        t = [apps[id].el.value.substring(0, loc1 - 1), apps[id].el.value.substring(loc1, apps[id].el.value.length)].join('')
                        apps[id].el.value = t
                    }
                }
                await apps[id].evaluator(t, apps[id].dataHandler, makeFinalCallback(id, res))
                evalInter = 'called'
            }

            if (apps[id].history) {
                await apps[id].history(ev, evalInter)
            }

            await Promise.all(apps[id].userKeyEffects.map((fn1) => {
                return fn1(ev, id)
            }))

            if (ev.key === 'Enter' && !ev.shiftKey) {
                apps[id].el.value = ''
            }
        }
    })
}
