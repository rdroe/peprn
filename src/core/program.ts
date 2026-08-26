import type { Modules, ParsedTask, Program, TaskSpec, Token } from './types.js'
import { ParseError } from './errors.js'
import { tokenizeLine } from './tokenizer.js'
import { parseLine } from './parser.js'

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Printable form of a token, for error messages. */
function tokenText(tok: Token): string {
    return tok.kind === 'ref' ? '@' + tok.name : tok.text
}

/** True for a bare (unquoted, unescaped-word) `as` keyword token. */
function isBareAs(tok: Token): boolean {
    return tok.kind === 'word' && !tok.quoted && tok.text === 'as'
}

/**
 * Grammar rule G6 — split a trailing `as <name>` suffix off a token list.
 *
 * The suffix is recognised ONLY as the final two tokens: a bare unquoted `as`
 * followed by a token whose text matches NAME. A final lone bare `as` stays a
 * literal token. `as` anywhere else is literal.
 *
 * @throws ParseError `Invalid handle name "<token>"` when a trailing bare `as`
 *   is followed by a non-NAME token, or `Missing command before "as"` when the
 *   suffix consumes the whole line.
 */
export function extractHandle(tokens: Token[]): { tokens: Token[]; handle: string | null } {
    const n = tokens.length
    if (n < 2) return { tokens, handle: null }

    const keyword = tokens[n - 2]!
    if (!isBareAs(keyword)) return { tokens, handle: null }

    const last = tokens[n - 1]!
    const text = tokenText(last)
    if (last.kind !== 'word' || !NAME_RE.test(last.text)) {
        throw new ParseError(`Invalid handle name "${text}"`)
    }

    const rest = tokens.slice(0, n - 2)
    if (rest.length === 0) throw new ParseError('Missing command before "as"')
    return { tokens: rest, handle: last.text }
}

/** Grammar rule G7 — unique `@ref` names, in order of first appearance. */
export function collectDeps(tokens: Token[]): string[] {
    const deps: string[] = []
    for (const tok of tokens) {
        if (tok.kind === 'ref' && !deps.includes(tok.name)) deps.push(tok.name)
    }
    return deps
}

/** Remove a trailing ` as <name>` from an already-trimmed line. */
function stripAsSuffix(raw: string, handle: string | null): string {
    if (handle === null) return raw
    const m = raw.match(/\s+as\s+\S+$/)
    return m && m.index !== undefined ? raw.slice(0, m.index).trimEnd() : raw
}

function toError(err: unknown): Error {
    return err instanceof Error ? err : new ParseError(String(err))
}

/**
 * Build a Program from submitted text: one task per non-empty line, in line
 * order. A line that throws anywhere in the tokenize -> handle -> parse pipeline
 * becomes an invalid task; its siblings are unaffected. Blank/whitespace-only
 * lines produce no task but still consume a `lineIndex`.
 */
export function buildProgram(text: string, modules: Modules): Program {
    const tasks: ParsedTask[] = []
    const lines = text.split('\n')

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]!.replace(/\r$/, '')
        const raw = line.trim()
        if (raw === '') continue

        try {
            const tokens = tokenizeLine(line, lineIndex)
            if (tokens.length === 0) continue
            const { tokens: rest, handle } = extractHandle(tokens)
            const deps = collectDeps(rest)
            const parsed = parseLine(modules, rest, stripAsSuffix(raw, handle))
            const spec: TaskSpec = { kind: 'task', lineIndex, raw, tokens: rest, handle, deps }
            tasks.push({ spec, parsed, error: null })
        } catch (err) {
            const error = toError(err)
            tasks.push({ spec: { kind: 'invalid', lineIndex, raw, error }, parsed: null, error })
        }
    }

    return { input: text, tasks }
}
