import { isNode } from './util/index'
import match from './match'
import { createApp as createBrowserApp } from './browser'
export { createBrowserApp }
export { match }


export * from './evaluator'

export const createServerApp = async (...args: Parameters<typeof createBrowserApp>) => {
    if (isNode()) {
        const defaultModule = await import('./node')
        return defaultModule.createApp(...args)
    }
    return createBrowserApp(...args)
}


if (!isNode()) {

    (window as any).createBrowserApp = createBrowserApp
}
