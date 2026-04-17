import { CliApp, CliApps, EvalInteraction } from "./evaluator"
import Dexie, { Table } from 'dexie'
import { Module } from "./util/types"

interface HistoryDbEntry {
    id?: number
    cliId: string
    text: string
}


class HistoryDatabase extends Dexie {
    public history!: Table<HistoryDbEntry, number>;
    public constructor() {
        super("HistoryDatabase");
        this.version(1).stores({
            history: "++id,cliId"
        });
    }
}

const histDb = new HistoryDatabase()

export const history: Module = {
    fn: async () => { },
    submodules: {
        delete: {
            fn: async (_, __, appId, apps: CliApps) => {
                if (!appId || typeof appId !== 'string') return "Argument appId is required and must be a string"

                const storedHistIds = (await histDb.history.where('cliId').equals(appId).toArray())
                    .map(({ id }) => id)
                    .filter((id): id is number => id !== undefined)

                const deletion = await histDb.history.bulkDelete(storedHistIds)
                apps[appId].historyData = []
                apps[appId].histCursor = 0

                return {
                    deleted: deletion
                }
            }
        }
    }
}

export const cleanHistory = (cli?: string) => cli?.replace(/[\n\s]+$/g, '') ?? ""
const addHistory = async (id: string, val: string) => {
    return histDb.history.add({
        cliId: id,
        text: cleanHistory(val),
    })
}

export const historyIgnore = ['history', 'history delete']

export const ignoreIfStartingWith = (cli: string) => {
    historyIgnore.push(cli)
}

const doIgnore = (cli: string) => {
    const ret = historyIgnore.some((ignore) => cli.startsWith(ignore))
    if ((window as Window & { DEBUG?: boolean }).DEBUG) {
        console.log('doIgnore', ret, cli)
    }
    return ret
}
export const earlySaveHistory = async (apps: CliApps, id: string, val: string) => {
    const inclusible = !val.includes('--peprn:automated true')
    if (val && doIgnore(val) === false) {
        if (inclusible || apps[id].rememberAutomated) {
            const hd = apps[id]?.historyData
            if (hd) {
                if (hd[hd.length - 1] !== val) {
                    hd.push(val)
                    apps[id].histCursor = hd.length
                    addHistory(id, val)
                }
            }
        }
    }
}
export const makeHistory = async (apps: CliApps, id: string): Promise<CliApp['history']> => {

    if (!apps[id].historyData) {
        const storedHist = (await histDb.history.where('cliId').equals(id).toArray())
        apps[id].historyData = storedHist.map(({ text }) => text)
    }

    // historyData and histCursor are guaranteed set from here on; el is set by the
    // framework before any key handler fires.
    const app = apps[id] as CliApp & { historyData: string[]; histCursor: number; el: HTMLTextAreaElement }
    app.histCursor = app.historyData.length // cursor beyond end

    return async (key: KeyboardEvent, evalResponse: EvalInteraction = 'not-called') => {

        if (evalResponse === 'called') {

            app.histCursor = app.historyData.length // cursor beyond end
            const val = cleanHistory(app.el?.value)
            earlySaveHistory(apps, id, val)

        } else if (key.key === 'ArrowDown' && key.altKey) {
            if (typeof app.historyData[app.histCursor + 1] === 'string') {
                app.histCursor += 1
                app.el.value = app.historyData[app.histCursor]

            } else if (typeof app.historyData[app.histCursor + 1] === 'undefined') {

                // if on last item
                if (typeof app.historyData[app.histCursor] === 'string') {
                    app.histCursor += 1
                    app.el.value = ''
                }
            }

        } else if (key.key === 'ArrowUp' && key.altKey) {
            if (undefined !== app.historyData[app.histCursor - 1]) {
                app.histCursor -= 1
                app.el.value = app.historyData[app.histCursor]
            }
        }
    }
}
