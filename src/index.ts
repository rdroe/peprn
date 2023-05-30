import { isNode } from 'util/index'
import { createApp as createBrowserApp } from './browser'

export { createApp as createServerApp } from './node'
export { createBrowserApp }

export * from './evaluator'

if (!isNode()) {
    (window as any).createBrowserApp = createBrowserApp
}
