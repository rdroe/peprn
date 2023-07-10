import { isNode } from './util/index'
import match from './match'
export { createApp as createServerApp } from './node'
import { createApp as createBrowserApp } from './browser'
export { createBrowserApp }
export { match }
export * from './evaluator'

if (!isNode()) {
    (window as any).createBrowserApp = createBrowserApp
}
