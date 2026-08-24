import { createBrowserApp } from '../../dist/browser/index.js'
import match from '../../dist/modules/match/index.js'

createBrowserApp({ id: 'cli', modules: { match } })
