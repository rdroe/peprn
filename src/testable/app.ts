import { createBrowserApp } from '../'
import * as match from "../match"


createBrowserApp({
    id: 'cli', modules: {
        match: match.default
    }
})
