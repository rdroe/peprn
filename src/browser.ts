
import { makeRunner, CliApp, ZodStore, CallReturn } from './evaluator'

export const apps: { [id: string]: CliApp } = {}

type AppResolver = { resolver: null | Function, promise: null | Promise<any> }

export const appResolvers: {
    [id: string]: AppResolver[]
} = {}


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

export const createApp = (id: string /*, taSelector: string, dataSelector: string*/) => {
    apps[id] = {
        el: document.querySelector(`textarea`),
        dataEl: document.querySelector('pre'),
        evaluator: makeRunner({ id }),
        zodStore: {},
        dataHandler: (input, data) => {
            genericDataHandler(id, data, { time: Date.now() })
        },
        restarter: null
    }
    apps[id].restarter = makeProm(id)
}

function makeProm(id: string) {
    return new Promise<void>((res) => {
        apps[id].el.onkeyup = (ev: KeyboardEvent) => {
            if (ev.key === 'Enter') {
                const t = apps[id].el.value
                apps[id].el.value = ''
                apps[id].evaluator(t, apps[id].dataHandler, makeFinalCallback(id, res))

            } else {
                console.log('asdf', apps[id].el.value)
            }
        }
    })
}
