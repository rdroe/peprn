
import { makeRunner, CliApp, ZodStore, CallReturn } from './evaluator'

export const apps: { [id: string]: CliApp } = {}

type AppResolver = { resolver: null | Function, promise: null | Promise<any> }

export const appResolvers: {
    [id: string]: AppResolver[]
} = {}

const finalCallback = async (err: null | Error, result: any) => {
    // @ts-ignore
    if (err) throw new Error(`Error intercepted; `, err)

    if (result) {

    }
}

const genericDataHandler = (id: string, data: any, params: { time: number }) => {
    const zodStore = apps[id].zodStore
    zodStore[params.time] = data
    const dataEl = apps[id].dataEl as HTMLElement
    dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`
}


const makeRestarter = (id: string) => {
    const cliEl = apps[id].el as HTMLTextAreaElement
    const restarter = async (err: Error, success: any) => {
        if (err) {
            throw new Error(`Err intercetped; ${err.message}`)
        }
        cliEl.onkeyup = null
        const prev = appResolvers[id][appResolvers[id].length - 1]
        prev.resolver(success)
        const next: AppResolver = {
            promise: new Promise(async (resolver) => {
                cliEl.onkeyup = async (ev: KeyboardEvent) => {
                    if (ev.key === 'Enter') {
                        const input = cliEl.value
                        const result = await apps[id].evaluator(input, apps[id].dataHandler, apps[id].restarter)
                    }
                };
            }),
            resolver: null
        }
    }
    apps[id].restarter = restarter
}


export const createAppx = (id: string, taSelector: string, dataSelector: string) => {

    const cliEl: HTMLTextAreaElement = document.querySelector(taSelector);
    const dataEl = document.querySelector(dataSelector);

    if (!cliEl) throw new Error(`Could not initialize app; selector was ${taSelector}`)
    if (!dataEl) throw new Error(`Could not initialize data recipient; selector was ${dataSelector}`)

    apps[id] = {
        el: cliEl,
        dataEl: dataEl as HTMLElement,
        evaluator: makeRunner({ id }),
        zodStore: {},
        restarter: makeRestarter(id)
    }


    cliEl.onkeyup = null

    appResolvers[id] = []

    restart(id, appResolvers)


}


export const createApp = (id: string /*, taSelector: string, dataSelector: string*/) => {
    apps[id] = {
        evaluator: makeRunner({ id }),
        zodStore: {},
        dataHandler: (input, data) => {
            genericDataHandler(id, data, { time: Date.now() })
        },
        restarter: makeRestarter(id)
    }



}
