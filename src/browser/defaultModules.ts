import type { Invocation, Modules } from '../core/types.js'

/**
 * The two output-visibility helper commands injected into every browser app
 * unless the caller opts out or already owns those names.
 */
export function makeDefaultModules(getOutput: (appId: string) => HTMLElement | undefined): Modules {
    return {
        hideOutput: {
            help: {
                description: "hide this app's output element",
                examples: { hideOutput: 'hide the output panel' }
            },
            fn: (ctx: Invocation): string => {
                const out = getOutput(ctx.app.id)
                if (out) out.style.display = 'none'
                return 'hidden'
            }
        },
        showOutput: {
            help: {
                description: "show this app's output element",
                examples: { showOutput: 'show the output panel' }
            },
            fn: (ctx: Invocation): string => {
                const out = getOutput(ctx.app.id)
                if (out) out.style.display = ''
                return 'shown'
            }
        }
    }
}
