import { makeHistory, history as historyCmd } from 'browser-default-history'
import { makeRunner, CliApp, Opts, EvalInteraction, CliApps, DataHandler } from './evaluator'

export const apps: { [id: string]: CliApp } = {}

const makeFinalCallback = (id: string, res: Function) => async (err: null | Error, result: any) => {
    // @ts-ignore
    if (err) throw new Error(`Error intercepted; `, err)
    res()
    apps[id].restarter = makeProm(id)
}

const genericDataHandler: DataHandler = (input, data: any, { args: ParsedCli, appId: uniqueAppId, apps: CliApps }) => {
    console.log('generic handler', uniqueAppId, apps)
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
    console.log('running createApp', opts)
    apps[id] = {
        el: document.querySelector(`#${id}`),
        dataEl: document.querySelector(outputSelector),
        evaluator: runner ? runner : makeRunner({ ...opts, modules: combinedModules }, apps),
        zodStore: {},
        dataHandler: opts.dataHandler ? opts.dataHandler : genericDataHandler,
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

                console.log('id on hitting enter', id)
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
