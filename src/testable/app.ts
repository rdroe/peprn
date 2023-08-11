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
    init: (ownId) => {
        apps[ownId].el.value = localStorage.getItem('match:initial') || ''
    }
})
