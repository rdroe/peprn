import { createBrowserApp } from '../'
import * as match from "../match"
import { apps } from "../browser"

createBrowserApp({
    id: 'cli', modules: {
        match: match.default
    },
    userKeyEffects: [
        async (key, ownId) => {
            const currCmd = apps[ownId].el.value
            localStorage.setItem('match:initial', currCmd)
        }
    ],
    dataHandler: async (_, data) => {

        const div = document.querySelector('.matches') as HTMLBodyElement

        if (div && data !== undefined) {
            div.innerHTML = `${div.innerHTML}
<div><pre>${JSON.stringify(data, null, 2)}</pre></div>
`
        }
    },
    init: (ownId) => {
        apps[ownId].el.value = localStorage.getItem('match:initial') || ''
    }
})
