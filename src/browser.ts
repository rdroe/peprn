import { makeHistory, history as historyCmd } from './browser-default-history'
import { makeRunner, CliApp, Opts, EvalInteraction, DataHandler } from './evaluator'

export { earlySaveHistory, cleanHistory } from './browser-default-history'

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
    dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`
}

export const createApp = async (opts: Opts, runner?: ReturnType<typeof makeRunner>) => {
    const { id, modules, history } = opts
    const combinedModules = { ...modules }
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
            const t = apps[id].el.value

            if (ev.key === 'Enter' && !ev.shiftKey) {
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
