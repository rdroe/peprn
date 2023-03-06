
import { makeHistory, history as historyCmd } from 'browser-default-history'

import { makeRunner, CliApp, Opts, EvalInteraction } from './evaluator'


export const apps: { [id: string]: CliApp } = {}

const makeFinalCallback = (id: string, res: Function) => async (err: null | Error, result: any) => {
    // @ts-ignore
    if (err) throw new Error(`Error intercepted; `, err)
    res()
    apps[id].restarter = makeProm(id)
}

const genericDataHandler = (id: string, data: any, params: { time: number }) => {
    const zodStore = apps[id].zodStore
    zodStore[params.time] = data
    const dataEl = apps[id].dataEl as HTMLElement
    dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`
}


export const createApp = async ({ id, modules, history }: Opts, runner?: ReturnType<typeof makeRunner>) => {
    const combinedModules = { ...modules }
    // if the user did not provide their own history fn
    if (!history) {
        // add the history-editing cli commands (unless user defined same name)
        combinedModules.history = combinedModules.history || historyCmd
    }
    apps[id] = {
        el: document.querySelector(`textarea#${id}`),
        dataEl: document.querySelector(`pre#${id}`),
        evaluator: runner ? runner : makeRunner({ id, modules: combinedModules }, apps),
        zodStore: {},
        dataHandler: (input, data) => {
            genericDataHandler(id, data, { time: Date.now() })
        },
        restarter: null
    }
    apps[id].restarter = makeProm(id)
    apps[id].history = history ? history : await makeHistory(apps, id)
}

function makeProm(id: string) {
    return new Promise<void>((res) => {
        apps[id].el.onkeyup = async (ev: KeyboardEvent) => {
            let evalInter: EvalInteraction = 'not-called'
            const t = apps[id].el.value
            if (ev.key === 'Enter' && !ev.shiftKey) {
                await apps[id].evaluator(t, apps[id].dataHandler, makeFinalCallback(id, res))
                evalInter = 'called'
            }

            if (apps[id].history) {
                await apps[id].history(ev, evalInter)
            }

            if (ev.key === 'Enter' && !ev.shiftKey) {
                apps[id].el.value = ''
            }
        }
    })
}
