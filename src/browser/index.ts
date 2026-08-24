import type { AppHandle, AppOptions, KeyEffect, Modules, RunOptions, RunReport } from '../core/types.js'
import { createApp } from '../core/app.js'
import { ensureDefaultUi } from './defaultUi.js'
import { makeDefaultModules } from './defaultModules.js'
import { bindDom, defaultBrowserDataHandler } from './dom.js'
import { createLocalStorageHistory } from './history.js'

export interface BrowserAppOptions extends AppOptions {
    useBrowserDefault?: boolean
    input?: HTMLTextAreaElement
    output?: HTMLElement
    userKeyEffects?: KeyEffect[]
}

export interface BrowserApp extends AppHandle {
    input: HTMLTextAreaElement
    output: HTMLElement
}

/** Resolves the input/output elements per the explicit -> by-id -> injected-default chain. */
function resolveElements(
    id: string,
    explicitInput: HTMLTextAreaElement | undefined,
    explicitOutput: HTMLElement | undefined,
    useBrowserDefault: boolean | undefined
): { input: HTMLTextAreaElement; output: HTMLElement; injected: { remove(): void } | null } {
    let input = explicitInput ?? (document.getElementById(id) as HTMLTextAreaElement | null) ?? undefined
    let output = explicitOutput ?? (document.getElementById(`${id}-out`) as HTMLElement | null) ?? undefined
    let injected: { remove(): void } | null = null

    if ((!input || !output) && useBrowserDefault !== false) {
        const ui = ensureDefaultUi(id)
        input = input ?? ui.input
        output = output ?? ui.output
        injected = ui
    }

    if (!input || !output) {
        throw new Error(`peprn: no input element for app "${id}"`)
    }

    return { input, output, injected }
}

/**
 * Creates a peprn app bound to a browser textarea/output pair, injecting a
 * default UI, local-storage history, and the show/hide-output helper modules
 * unless the caller opts out or has already claimed those names.
 */
export async function createBrowserApp(options: BrowserAppOptions): Promise<BrowserApp> {
    const {
        useBrowserDefault,
        input: explicitInput,
        output: explicitOutput,
        userKeyEffects,
        modules: userModules,
        history: userHistory,
        dataHandler: userDataHandler,
        ...restOptions
    } = options

    const { input, output, injected } = resolveElements(options.id, explicitInput, explicitOutput, useBrowserDefault)

    const outputsByAppId = new Map<string, HTMLElement>([[options.id, output]])

    const modules: Modules = { ...(userModules ?? {}) }
    if (useBrowserDefault !== false) {
        const defaults = makeDefaultModules((appId) => outputsByAppId.get(appId))
        for (const [name, mod] of Object.entries(defaults)) {
            if (!(name in modules)) modules[name] = mod
        }
    }

    const history = userHistory === undefined ? createLocalStorageHistory() : userHistory
    const dataHandler = userDataHandler ?? defaultBrowserDataHandler(output)

    const core = await createApp({
        ...restOptions,
        modules,
        history,
        dataHandler
    })

    const unbind = bindDom(core, input, output, userKeyEffects ?? [])

    // Seam for the sibling ghost packet (P21): once src/browser/ghost.ts exists,
    // import { attachGhost } from './ghost.js' here, call it (unless
    // options.completion === false) to get its detach function, and fold that
    // detach call into dispose() below alongside `unbind`.

    const app: BrowserApp = {
        get id() {
            return core.id
        },
        get modules() {
            return core.modules
        },
        get handles() {
            return core.handles
        },
        get history() {
            return core.history
        },
        get disposed() {
            return core.disposed
        },
        run(text: string, opts?: RunOptions): Promise<RunReport> {
            return core.run(text, opts)
        },
        complete(text: string, cursor?: number) {
            return core.complete(text, cursor)
        },
        dispose(): void {
            unbind()
            if (injected) injected.remove()
            core.dispose()
        },
        input,
        output
    }

    return app
}

export { createLocalStorageHistory }
export * from '../core/index.js'
