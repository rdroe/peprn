import type { AppHandle, Args, Invocation, ParsedLine } from './types.js'

/**
 * Run a matched module chain childmost -> root in a plain sequential loop.
 *
 * Modules without an `fn` are purely syntactic: they are skipped and contribute
 * no key to the composite result. Each invoked module receives the RESOLVED
 * results of every deeper fn-bearing module in `children`, keyed by path key.
 *
 * Insertion order of the returned object is childmost-first, so
 * `Object.keys(result)[0]` is the deepest fn-bearing module's path key.
 *
 * A throw from any module propagates immediately: ancestors do not run.
 */
export async function executeChain(
    parsed: ParsedLine,
    args: Args,
    app: AppHandle
): Promise<Record<string, unknown>> {
    const { chain, pathKeys } = parsed
    const out: Record<string, unknown> = {}

    for (let i = chain.length - 1; i >= 0; i--) {
        const fn = chain[i].fn
        if (!fn) continue

        const ctx: Invocation = {
            args,
            children: { ...out },
            path: args.modulePath.slice(0, i + 1),
            depth: chain.length - 1 - i,
            app
        }

        out[pathKeys[i]] = await fn(ctx)
    }

    return out
}

/** The deepest path key in the chain whose module has an `fn`, or null if none does. */
export function childmostKey(parsed: ParsedLine): string | null {
    const { chain, pathKeys } = parsed
    for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].fn) return pathKeys[i]
    }
    return null
}
