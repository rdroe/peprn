import { CliApp, CliApps, EvalInteraction } from "evaluator"
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
                const storedHistIds = (await histDb.history.where('cliId').equals(appId).toArray()).map(({ id }) => id)
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

export const makeHistory = async (apps: CliApps, id: string): Promise<CliApp['history']> => {

    if (!apps[id].historyData) {
        const storedHist = (await histDb.history.where('cliId').equals(id).toArray())
        const texts = storedHist.map(({ text }) => text) || []
        apps[id].historyData = texts
    }

    apps[id].histCursor = apps[id].historyData.length // cursor beyond end

    return async (key: KeyboardEvent, evalResponse: EvalInteraction = 'not-called') => {

        if (evalResponse === 'called') {
            apps[id].histCursor = apps[id].historyData.length // cursor beyond end
            if (apps[id].el.value && apps[id].el.value.trim().startsWith('history delete') === false) {

                histDb.history.add({ cliId: id, text: apps[id].el.value.replace(/[\n\s]+$/g, ''), })

            }

        } else if (key.key === 'ArrowDown' && key.altKey) {
            if (typeof apps[id].historyData[apps[id].histCursor + 1] === 'string') {
                apps[id].histCursor += 1
                apps[id].el.value = apps[id].historyData[apps[id].histCursor]
            }
        } else if (key.key === 'ArrowUp' && key.altKey) {
            if (undefined !== apps[id].historyData[apps[id].histCursor - 1]) {
                apps[id].histCursor -= 1
                apps[id].el.value = apps[id].historyData[apps[id].histCursor]
            }
        } else {
            apps[id].historyData[
                apps[id].histCursor
            ] = apps[id].el.value.replace(/[\n\s]+$/g, '')
        }
    }
}
