import { createBrowserApp } from '../'
import * as match from "../match"
import { apps } from "../browser"
import { foo } from './foo'
import { cliTest } from "./cliTest"
import { ParsedCli, PEPRN_AUTO } from '../util'
createBrowserApp({
    id: 'cli', modules: {
        match: match.default, cliTest, foo
    },
    userKeyEffects: [
        async (key, ownId) => {
            const currCmd = apps[ownId].el.value
            localStorage.setItem('match:initial', currCmd)
        }
    ],
    catch: (e) => {
        console.error(`Caught ${e.message}`)
    },
    dataHandler: async (parsedCli: ParsedCli, data: any, appId: string) => {

        const isAutomated = parsedCli[PEPRN_AUTO]
        const isChildmost = parsedCli['peprn:childmost']
        const dataEl = apps[appId].dataEl
        if (!isAutomated && isChildmost) {

            if (dataEl) {
                dataEl.innerHTML = `
${JSON.stringify(data, null, 2)}
${dataEl.innerHTML}
`
            } else {
                console.warn(`Could not find html data container for peprn app "${appId}"`)
            }
        }
    },
    init: (ownId) => {

        apps[ownId].el.value = localStorage.getItem('match:initial') || ''
    }
})
