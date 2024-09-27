import { createBrowserApp } from '../'
import * as match from "../match"
import { apps } from "../browser"
import { foo } from './foo'
import { cliTest } from "./cliTest"
import { ParsedCli, PEPRN_AUTO, PEPRN_MULTILINE, PEPRN_MULTILINE_INDEX, PEPRN_MULTILINE_TOTAL } from '../util'

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
        const isMultiline = parsedCli[PEPRN_MULTILINE]
        const multilineTot = parsedCli[PEPRN_MULTILINE_TOTAL]
        const multilineIndex = parsedCli[PEPRN_MULTILINE_INDEX]
        const dataEl = apps[appId].dataEl
        let didPrint = false
        if (!dataEl) throw new Error(`Nowhere to output results`)
        if (!isAutomated && isChildmost) {
            if (!isMultiline
                || (
                    typeof multilineTot === 'number'
                    && typeof multilineIndex === 'number'
                    && multilineTot === multilineIndex + 1
                )
            ) {
                dataEl.innerHTML = `
${JSON.stringify(data, null, 2)}
${dataEl.innerHTML}
`
                didPrint = true
            }
        }

        if (!didPrint) {
            console.log(data)
        }
    },
    init: (ownId) => {
        apps[ownId].el.value = localStorage.getItem('match:initial') || ''
    }
})
