import { createBrowserApp } from '../../dist/browser/index.js'
import match from '../../dist/modules/match/index.js'
import { domModules } from '../../dist/modules/dom/index.js'

createBrowserApp({ id: 'cli', modules: { match, ...domModules } })
