import type {
    Args,
    CompletionItem,
    CompletionResult,
    CompletionSources,
    Module,
    OptionSpec,
    Token,
} from './types.js'
import { parseLine, walkStem } from './parser.js'

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const FLAG_RE = /^--?[A-Za-z]/
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const HISTORY_MAX = 5

const isWs = (ch: string): boolean => ch === ' ' || ch === '\t'

const has = (obj: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj, key)

/** One lenient scan result: the token plus where it sat in the active text. */
interface Scanned {
    start: number
    end: number
    text: string
    quoted: boolean
    /** the raw token began with an unescaped `@` */
    refish: boolean
}

interface ScanResult {
    tokens: Scanned[]
    /** a quoted run reached the cursor without closing */
    unterminated: boolean
}

/**
 * Lenient variant of the real tokenizer (C2): identical token shapes, but it never
 * throws — a dangling escape is dropped and an invalid `@reference` stays a word —
 * and every token carries its offsets so completions know what range to replace.
 */
function scan(src: string, offset: number): ScanResult {
    const tokens: Scanned[] = []
    let unterminated = false
    let i = 0

    while (i < src.length) {
        if (isWs(src[i] as string)) { i += 1; continue }

        const start = i
        let text = ''
        let quoted = false
        let started = false
        const refish = src[i] === '@'

        while (i < src.length && !isWs(src[i] as string)) {
            const ch = src[i] as string

            if (ch === '\\') {
                // lenient: a trailing lone backslash contributes nothing
                if (i + 1 < src.length) text += src[i + 1] as string
                started = true
                i += 2
                continue
            }

            if ((ch === '"' || ch === "'") && !started) {
                quoted = true
                started = true
                const close = ch
                i += 1
                let closed = false
                while (i < src.length) {
                    const c = src[i] as string
                    if (c === '\\') {
                        if (i + 1 < src.length) text += src[i + 1] as string
                        i += 2
                        continue
                    }
                    if (c === close) { closed = true; i += 1; break }
                    text += c
                    i += 1
                }
                if (!closed) unterminated = true
                continue
            }

            text += ch
            started = true
            i += 1
        }

        tokens.push({ start: offset + start, end: offset + Math.min(i, src.length), text, quoted, refish })
    }

    return { tokens, unterminated }
}

const toToken = (s: Scanned): Token =>
    s.refish && !s.quoted && NAME_RE.test(s.text.slice(1))
        ? { kind: 'ref', name: s.text.slice(1) }
        : { kind: 'word', text: s.text, quoted: s.quoted }

const isFlagText = (s: Scanned): boolean =>
    !s.quoted && !s.refish && FLAG_RE.test(s.text)

/** `x` → `-x`; anything longer → `--xx` (the shared "dash rule"). */
const dashify = (name: string): string => (name.length === 1 ? `-${name}` : `--${name}`)

/** Canonical option name for a written flag name: exact key wins, then alias. */
function canonicalName(name: string, specs: Record<string, OptionSpec>): string {
    if (has(specs, name)) return name
    let found: string | null = null
    for (const key of Object.keys(specs)) {
        const spec = specs[key]
        if (spec && spec.alias === name) found = key
    }
    return found ?? name
}

const optionDetail = (spec: OptionSpec): string =>
    `${spec.type ?? 'untyped'}${spec.array ? '[]' : ''}${spec.describe ? ` ${spec.describe}` : ''}`

const emptyArgs = (raw: string): Args => ({
    commands: [],
    modulePath: [],
    wildcards: [],
    positional: [],
    options: {},
    raw,
})

const emptyResult = (prefix: string): CompletionResult => ({ items: [], prefix })

/**
 * Completion engine (rules C1–C10). Powers both the browser ghost text and the
 * node Tab handler; it never throws and never mutates `sources`.
 *
 * @param sources modules to complete against, plus optional handle and history lists
 * @param input   the full (possibly multi-line) buffer
 * @param cursor  caret offset into `input`
 */
export async function complete(
    sources: CompletionSources,
    input: string,
    cursor: number,
): Promise<CompletionResult> {
    const pos = Math.max(0, Math.min(cursor, input.length))

    // C1 — only the line holding the cursor matters; active text is lineStart..cursor
    const lineStart = input.lastIndexOf('\n', pos - 1) + 1
    const active = input.slice(lineStart, pos)

    // C2 — lenient scan; an unterminated quote at the cursor completes nothing
    const { tokens: scanned, unterminated } = scan(active, lineStart)
    if (unterminated) return emptyResult('')

    const last = scanned[scanned.length - 1]
    const currentIsReal = last !== undefined && last.end === pos
    const current: Scanned = currentIsReal
        ? last
        : { start: pos, end: pos, text: '', quoted: false, refish: false }
    const prior = currentIsReal ? scanned.slice(0, -1) : scanned

    const prefix = current.text
    const replaceFrom = current.start
    const replaceTo = pos

    // C3 — the token before an in-progress handle name completes nothing
    const prev = prior[prior.length - 1]
    if (
        prior.length >= 2 &&
        prev !== undefined &&
        !prev.quoted &&
        !prev.refish &&
        prev.text === 'as'
    ) {
        return emptyResult(prefix)
    }

    const priorTokens = prior.map(toToken)
    const stem = walkStem(sources.modules, priorTokens)

    const context: CompletionItem[] = []
    // C5's predicate is looser than the parser's: any non-numeric `-…` counts
    const currentIsFlag =
        !current.quoted && current.text.startsWith('-') && !NUMBER_RE.test(current.text)
    const currentIsHandle = current.refish && !current.quoted

    if (currentIsHandle) {
        // C4 — handle items
        const wanted = current.text.slice(1)
        for (const name of sources.handles ?? []) {
            if (!name.startsWith(wanted)) continue
            context.push({ value: `@${name}`, kind: 'handle', replaceFrom, replaceTo })
        }
    } else if (currentIsFlag) {
        // C5 — option items for every spec accumulated along the stem
        const seen = new Set<string>()
        for (const key of Object.keys(stem.specs)) {
            const spec = stem.specs[key]
            if (!spec) continue
            const names = spec.alias ? [key, spec.alias] : [key]
            for (const name of names) {
                const value = dashify(name)
                if (!value.startsWith(prefix) || seen.has(value)) continue
                seen.add(value)
                context.push({
                    value,
                    kind: 'option',
                    detail: optionDetail(spec),
                    replaceFrom,
                    replaceTo,
                })
            }
        }
    } else {
        const prevSpec =
            prev !== undefined && isFlagText(prev)
                ? stem.specs[canonicalName(prev.text.replace(/^--?/, ''), stem.specs)]
                : undefined

        if (prevSpec?.choices) {
            // C6 — value items from the flag's static choices
            for (const choice of prevSpec.choices) {
                const value = String(choice)
                if (!value.startsWith(prefix)) continue
                context.push({ value, kind: 'value', replaceFrom, replaceTo })
            }
        } else if (stem.consumed === priorTokens.length) {
            // C7 — command items from the submodule level the stem stopped at
            for (const name of Object.keys(stem.level)) {
                if (name === '$' || !name.startsWith(prefix)) continue
                const sub = stem.level[name]
                const description = sub?.help?.description
                context.push({
                    value: name,
                    kind: 'command',
                    ...(description === undefined ? {} : { detail: description }),
                    replaceFrom,
                    replaceTo,
                })
            }
        }
    }

    // C8 — dynamic value completion from the deepest module that offers one
    if (!currentIsFlag && !currentIsHandle) {
        let dynamic: Module | undefined
        for (let i = stem.chain.length - 1; i >= 0; i -= 1) {
            const mod = stem.chain[i]
            if (mod?.complete) { dynamic = mod; break }
        }
        if (dynamic?.complete) {
            const rawSoFar = input.slice(lineStart, current.start).trim()
            let argsSoFar: Args
            try {
                argsSoFar = parseLine(sources.modules, priorTokens, rawSoFar).args
            } catch {
                argsSoFar = emptyArgs(rawSoFar)
            }
            try {
                const values = await dynamic.complete(prefix, argsSoFar)
                for (const value of values) {
                    context.push({ value, kind: 'value', replaceFrom, replaceTo })
                }
            } catch {
                // user completions are best-effort: a throw contributes nothing
            }
        }
    }

    // C10 — context items alphabetical by value, history appended after
    context.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))

    // C9 — whole-line history recall
    const history: CompletionItem[] = []
    const entries = sources.history
    if (entries && !input.includes('\n') && pos === input.length && input.trim() !== '') {
        for (let i = entries.length - 1; i >= 0 && history.length < HISTORY_MAX; i -= 1) {
            const entry = entries[i]
            if (entry === undefined || !entry.startsWith(input)) continue
            history.push({ value: entry, kind: 'history', replaceFrom: 0, replaceTo: pos })
        }
    }

    const items: CompletionItem[] = []
    const seen = new Set<string>()
    for (const item of [...context, ...history]) {
        const key = `${item.replaceFrom} ${item.value}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push(item)
    }

    return { items, prefix }
}
