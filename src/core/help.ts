import type { HelpNode, HelpOutput, Module, Modules, ParsedLine } from './types.js'

const NO_HELP = 'no help defined'

const describeOf = (mod: Module): string => mod.help?.description ?? NO_HELP

/**
 * Quick `--help` output (help mode only; the recursive manual is `buildManPage`).
 *
 * - A matched stem yields ONE entry keyed by `parsed.args.commands.join(' ')`,
 *   describing the deepest matched module.
 * - An empty stem (bare `--help`) yields one `{ description }` entry per root module.
 * - `options` are copied verbatim; `examples` keys are prefixed with the entry key.
 */
export function getHelp(modules: Modules, parsed: ParsedLine): HelpOutput {
    const out: HelpOutput = {}
    const deepest: Module | undefined = parsed.chain.length > 0
        ? parsed.chain[parsed.chain.length - 1]
        : undefined

    if (deepest === undefined) {
        for (const [name, mod] of Object.entries(modules)) {
            out[name] = { description: describeOf(mod) }
        }
        return out
    }

    const key = parsed.args.commands.join(' ')
    const node: HelpNode = { description: describeOf(deepest) }
    const help = deepest.help

    if (help?.options !== undefined) {
        node.options = { ...help.options }
    }

    if (help?.examples !== undefined) {
        const examples: Record<string, string> = {}
        for (const [example, note] of Object.entries(help.examples)) {
            examples[key === '' ? example : `${key} ${example}`] = note
        }
        node.examples = examples
    }

    out[key] = node
    return out
}
