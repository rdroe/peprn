import type { ManExample, ManOption, ManPage, Module, Modules } from './types.js'
import { UnknownCommandError } from './errors.js'

const NO_DESCRIPTION = '(no description)'

/** Dash rule: a one-character name gets a single dash, anything longer gets two. */
function dashed(name: string): string {
    return name.length === 1 ? `-${name}` : `--${name}`
}

/** Wildcard segments are documented under a readable placeholder. */
function renderName(name: string): string {
    return name === '$' ? '<name>' : name
}

function describeModule(mod: Module | undefined): string {
    return mod?.help?.description ?? NO_DESCRIPTION
}

function resolve(modules: Modules, path: string[]): Module {
    let level: Modules | undefined = modules
    let mod: Module | undefined
    for (const segment of path) {
        const next: Module | undefined =
            level?.[segment] ?? (level && '$' in level ? level['$'] : undefined)
        if (!next) throw new UnknownCommandError(segment)
        mod = next
        level = next.submodules
    }
    if (!mod) throw new UnknownCommandError(path.join(' '))
    return mod
}

function ownOptions(mod: Module): ManOption[] {
    const specs = mod.options ?? {}
    return Object.keys(specs)
        .sort()
        .map((name) => {
            const spec = specs[name]
            return {
                name,
                alias: spec.alias,
                type: spec.type ?? 'untyped',
                array: !!spec.array,
                describe: spec.describe ?? mod.help?.options?.[name],
                choices: spec.choices
            }
        })
}

function synopsisFor(title: string, options: ManOption[], hasSubmodules: boolean): string {
    let out = title
    for (const opt of options) {
        const flag = dashed(opt.name)
        if (opt.type === 'boolean') out += ` [${flag}]`
        else if (opt.array) out += ` [${flag} value ...]`
        else out += ` [${flag} value]`
    }
    if (hasSubmodules) out += ' <subcommand>'
    return out
}

function examplesFor(mod: Module, title: string): ManExample[] {
    const examples = mod.help?.examples
    if (!examples) return []
    return Object.keys(examples).map((key) => ({ cmd: `${title} ${key}`, note: examples[key] }))
}

function subcommandsFor(modules: Modules | undefined): { name: string; description: string }[] {
    if (!modules) return []
    return Object.keys(modules).map((name) => ({
        name: renderName(name),
        description: describeModule(modules[name])
    }))
}

/** Build the manual page for a command path. Throws `UnknownCommandError` on a bad segment. */
export function buildManPage(modules: Modules, path: string[]): ManPage {
    const mod = resolve(modules, path)
    const title = path.join(' ')
    const options = ownOptions(mod)
    const subs = mod.submodules
    const hasSubs = !!subs && Object.keys(subs).length > 0
    return {
        kind: 'peprn:man',
        path: [...path],
        title,
        description: describeModule(mod),
        synopsis: synopsisFor(title, options, hasSubs),
        options,
        examples: examplesFor(mod, title),
        subcommands: subcommandsFor(subs)
    }
}

/** Build the top-level index page listing every root command. */
export function buildManIndex(modules: Modules, title: string): ManPage {
    return {
        kind: 'peprn:man',
        path: [],
        title,
        description: NO_DESCRIPTION,
        synopsis: `${title} <command>`,
        options: [],
        examples: [],
        subcommands: subcommandsFor(modules)
    }
}

function section(name: string, lines: string[]): string[] {
    return lines.length === 0 ? [] : [name, ...lines]
}

/** Deterministic plain-text rendering of a manual page. No trailing newline. */
export function renderManText(page: ManPage): string {
    const blocks: string[][] = []

    blocks.push(section('NAME', [`  ${page.title} — ${page.description}`]))
    blocks.push(section('SYNOPSIS', page.synopsis ? [`  ${page.synopsis}`] : []))

    const flagCells = page.options.map((opt) =>
        opt.alias ? `${dashed(opt.name)}, ${dashed(opt.alias)}` : dashed(opt.name)
    )
    const typeCells = page.options.map((opt) => `${opt.type}${opt.array ? '[]' : ''}`)
    const flagWidth = Math.max(0, ...flagCells.map((c) => c.length)) + 2
    const typeWidth = Math.max(0, ...typeCells.map((c) => c.length)) + 2
    const optionLines = page.options.map((opt, i) =>
        `  ${flagCells[i].padEnd(flagWidth)}${typeCells[i].padEnd(typeWidth)}${opt.describe ?? ''}`.trimEnd()
    )
    blocks.push(section('OPTIONS', optionLines))

    const exampleLines: string[] = []
    for (const ex of page.examples) {
        exampleLines.push(`  ${ex.cmd}`)
        if (ex.note) exampleLines.push(`    ${ex.note}`)
    }
    blocks.push(section('EXAMPLES', exampleLines))

    const nameWidth = Math.max(0, ...page.subcommands.map((s) => s.name.length)) + 2
    const subLines = page.subcommands.map((s) =>
        `  ${s.name.padEnd(nameWidth)}${s.description}`.trimEnd()
    )
    blocks.push(section('SUBCOMMANDS', subLines))

    return blocks
        .filter((b) => b.length > 0)
        .map((b) => b.join('\n'))
        .join('\n\n')
}

/** The built-in `man` command, injected by `createApp` unless the user defines one. */
export function makeManModule(): Module {
    return {
        help: {
            description: 'show the manual page for a command',
            examples: { 'match scalar': 'show the manual page for "match scalar"' }
        },
        fn: (ctx) => {
            const path = ctx.args.positional.map(String)
            return path.length === 0
                ? buildManIndex(ctx.app.modules, ctx.app.id)
                : buildManPage(ctx.app.modules, path)
        }
    }
}
