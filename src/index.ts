import match from './match'


import { isNode } from './util/index'

// export { createApp as createServerApp } from './node'
import { createApp as createBrowserApp } from './browser'
export { createBrowserApp }
export { match }
export * from './evaluator'

if (!isNode()) {
    (window as any).createBrowserApp = createBrowserApp
}
