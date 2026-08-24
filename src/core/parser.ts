import type {
    Args,
    Module,
    Modules,
    OptionSpec,
    ParsedLine,
    RefPlaceholder,
    Token,
} from './types.js'
import { ParseError, UnknownCommandError } from './errors.js'

/** A word token that could be a flag: unquoted and shaped like `-x` / `--xx`. */
const FLAG_RE = /^--?[A-Za-z]/
/** Untyped number coercion for unquoted words. */
const NUMBER_RE = /^-?\d+(\.\d+)?$/

const has = (obj: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj, key)

const isFlagToken = (t: Token): boolean =>
    t.kind === 'word' && !t.quoted && FLAG_RE.test(t.text)

/** `--name` / `-n` → `name` / `n` (leading dashes removed). */
const flagName = (text: string): string => text.replace(/^--?/, '')

const printable = (t: Token): string => (t.kind === 'ref' ? `@${t.name}` : t.text)

/** Untyped scalar rule: quoted stays a string, unquoted numbers coerce. */
const untypedScalar = (t: { text: string; quoted: boolean }): string | number =>
    !t.quoted && NUMBER_RE.test(t.text) ? Number(t.text) : t.text

const toRef = (name: string): RefPlaceholder => ({ kind: 'ref', name })

// ---------- stem walking ----------

interface StemWalkFull {
    chain: Module[]
    pathKeys: string[]
    specs: Record<string, OptionSpec>
    consumed: number
    level: Modules
    commands: string[]
    modulePath: string[]
    wildcards: string[]
}

function mergeSpecs(
    into: Record<string, OptionSpec>,
    options: Record<string, OptionSpec> | undefined,
): void {
    if (!options) return
    for (const key of Object.keys(options)) {
        const spec = options[key]
        if (spec) into[key] = spec
    }
}

/**
 * Shared, side-effect-free stem walk. Never throws: an unmatched first token
 * simply yields an empty chain (the parser decides whether that is an error).
 */
function walkStemFull(modules: Modules, tokens: Token[]): StemWalkFull {
    const chain: Module[] = []
    const pathKeys: string[] = []
    const specs: Record<string, OptionSpec> = {}
    const commands: string[] = []
    const modulePath: string[] = []
    const wildcards: string[] = []
    let level: Modules = modules

    for (const t of tokens) {
        // quoted / ref / flag tokens end the stem permanently
        if (t.kind !== 'word' || t.quoted || isFlagToken(t)) break

        let mod: Module | undefined
        if (has(level, t.text)) {
            mod = level[t.text]
            if (!mod) break
            commands.push(t.text)
            modulePath.push(t.text)
        } else if (has(level, '$')) {
            mod = level['$']
            if (!mod) break
            commands.push(t.text)
            modulePath.push('$')
            wildcards.push(t.text)
        } else {
            break
        }

        chain.push(mod)
        pathKeys.push(commands.join(' '))
        mergeSpecs(specs, mod.options)
        level = mod.submodules ?? {}
    }

    return {
        chain,
        pathKeys,
        specs,
        consumed: commands.length,
        level,
        commands,
        modulePath,
        wildcards,
    }
}

/**
 * Walk the module tree as far as the leading tokens allow.
 * Used by both the parser and the completion engine.
 */
export function walkStem(
    modules: Modules,
    tokens: Token[],
): {
    chain: Module[]
    pathKeys: string[]
    specs: Record<string, OptionSpec>
    consumed: number
    level: Modules
} {
    const w = walkStemFull(modules, tokens)
    return {
        chain: w.chain,
        pathKeys: w.pathKeys,
        specs: w.specs,
        consumed: w.consumed,
        level: w.level,
    }
}

// ---------- option resolution ----------

/** Canonical name for a written flag name: exact key wins, then alias (deepest). */
function canonicalName(name: string, specs: Record<string, OptionSpec>): string {
    if (has(specs, name)) return name
    let found: string | null = null
    for (const key of Object.keys(specs)) {
        const spec = specs[key]
        if (spec && spec.alias === name) found = key
    }
    return found ?? name
}

function coerceValue(
    t: Token,
    spec: OptionSpec | undefined,
    canonical: string,
): unknown {
    if (t.kind === 'ref') return toRef(t.name)
    const type = spec?.type
    if (type === 'number') {
        const n = Number(t.text)
        if (Number.isNaN(n)) {
            throw new ParseError(
                `Option --${canonical} expects a number, got "${t.text}"`,
            )
        }
        return n
    }
    if (type === 'string') return t.text
    return untypedScalar(t)
}

function coercePositional(t: Token): unknown {
    if (t.kind === 'ref') return toRef(t.name)
    return untypedScalar(t)
}

// ---------- help detection ----------

function detectHelp(tokens: Token[]): 'help' | 'man' | null {
    let mode: 'help' | 'man' | null = null
    for (const t of tokens) {
        if (t.kind !== 'word' || t.quoted) continue
        if (t.text === '--man') return 'man'
        if (t.text === '--help' || t.text === '-h') mode = 'help'
    }
    return mode
}

const isHelpToken = (t: Token): boolean =>
    t.kind === 'word' &&
    !t.quoted &&
    (t.text === '--help' || t.text === '-h' || t.text === '--man')

// ---------- parseLine ----------

export function parseLine(
    modules: Modules,
    tokens: Token[],
    raw: string,
): ParsedLine {
    const help = detectHelp(tokens)
    const rest = tokens.filter((t) => !isHelpToken(t))

    const stem = walkStemFull(modules, rest)

    if (stem.chain.length === 0 && help === null) {
        const first = rest[0] ?? tokens[0]
        if (first) throw new UnknownCommandError(printable(first))
    }

    const options: Record<string, unknown> = {}
    const positional: unknown[] = []

    let i = stem.consumed
    while (i < rest.length) {
        const t = rest[i]
        if (!t) break

        if (t.kind !== 'word' || !isFlagToken(t)) {
            positional.push(coercePositional(t))
            i += 1
            continue
        }

        const written = flagName(t.text)
        const canonical = canonicalName(written, stem.specs)
        const spec = has(stem.specs, canonical) ? stem.specs[canonical] : undefined

        if (spec?.type === 'boolean') {
            options[canonical] = true
            i += 1
            continue
        }

        // gather the value tokens that follow, stopping at the next flag / EOL
        const values: Token[] = []
        let j = i + 1
        while (j < rest.length) {
            const v = rest[j]
            if (!v || isFlagToken(v)) break
            values.push(v)
            j += 1
            if (!spec?.array) break // non-array options take exactly one value
        }

        if (values.length === 0) {
            // trailing flag (or one immediately followed by another flag) → true
            options[canonical] = true
            i += 1
            continue
        }

        if (spec?.array) {
            const coerced = values.map((v) => coerceValue(v, spec, canonical))
            const prev = options[canonical]
            options[canonical] = Array.isArray(prev) ? [...prev, ...coerced] : coerced
        } else {
            const v = values[0]
            if (v) options[canonical] = coerceValue(v, spec, canonical)
        }
        i = j
    }

    const args: Args = {
        commands: stem.commands,
        modulePath: stem.modulePath,
        wildcards: stem.wildcards,
        positional,
        options,
        raw,
    }

    return { chain: stem.chain, pathKeys: stem.pathKeys, help, args }
}
