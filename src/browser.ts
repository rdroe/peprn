
import { makeHistory } from 'browser-default-history'
import { makeRunner, CliApp, Opts, EvalInteraction, CliApps } from './evaluator'

export const apps: { [id: string]: CliApp } = {}

const makeFinalCallback = (id: string, res: Function) => async (err: null | Error, result: any) => {
    // @ts-ignore
    if (err) throw new Error(`Error intercepted; `, err)
    res()
    if (result) {
    }
    apps[id].restarter = makeProm(id)
}

const genericDataHandler = (id: string, data: any, params: { time: number }) => {
    const zodStore = apps[id].zodStore
    zodStore[params.time] = data
    const dataEl = apps[id].dataEl as HTMLElement
    dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`
}

export const createApp = async ({ id, modules, history }: Opts, runner?: ReturnType<typeof makeRunner>) => {

    apps[id] = {
        el: document.querySelector(`textarea`),
        dataEl: document.querySelector('pre'),
        evaluator: runner ? runner : makeRunner({ id, modules }),
        zodStore: {},
        dataHandler: (input, data) => {
            genericDataHandler(id, data, { time: Date.now() })
        },
        restarter: null,
        history: makeHistory(apps, id)
    }
    apps[id].restarter = makeProm(id)
}

function makeProm(id: string) {
    return new Promise<void>((res) => {
        apps[id].el.onkeyup = async (ev: KeyboardEvent) => {
            let evalInter: EvalInteraction = 'not-called'
            const t = apps[id].el.value
            if (ev.key === 'Enter') {
                apps[id].el.value = ''
                await apps[id].evaluator(t, apps[id].dataHandler, makeFinalCallback(id, res))
                evalInter = 'called'
                if (apps[id].history) {
                    await apps[id].history(t, ev, evalInter)
                }
            }
        }
    })
}
