import { createBrowserApp } from '../'
import * as match from "../match"
console.log('testing repl-experiment', match)

createBrowserApp({
    id: 'cli', modules: {
        match: match.default
    }
})
