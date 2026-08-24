import type { Token } from './types.js'
import { ParseError } from './errors.js'

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

const isWs = (ch: string): boolean => ch === ' ' || ch === '\t'

/**
 * Split one line into tokens per grammar rules G1–G5.
 *
 * - `\r` is stripped; a whitespace-only (or empty) line yields `[]`.
 * - A quote character opens a quoted run ONLY at a token boundary; elsewhere it is
 *   a literal character (`it's` stays one bare word).
 * - `\` escapes the next character literally, inside and outside quotes.
 * - A token whose FIRST raw character is an unescaped `@` is a reference; the rest
 *   must match NAME or a ParseError is thrown. `@` mid-token is literal.
 *
 * The `as` suffix and dependency extraction are NOT handled here (see the program
 * builder); `as` is emitted as an ordinary word.
 *
 * @throws {ParseError} on an invalid `@reference`, an unterminated quote, or a
 * dangling trailing escape.
 */
export function tokenizeLine(line: string, lineIndex: number): Token[] {
    void lineIndex
    const src = line.replace(/\r/g, '')
    const tokens: Token[] = []
    let i = 0

    while (i < src.length) {
        // skip inter-token whitespace
        if (isWs(src[i] as string)) { i += 1; continue }

        let text = ''
        let quoted = false
        let ref = false
        let started = false

        // a leading unescaped '@' marks a reference token
        if (src[i] === '@') { ref = true }

        while (i < src.length && !isWs(src[i] as string)) {
            const ch = src[i] as string

            if (ch === '\\') {
                if (i + 1 >= src.length) throw new ParseError('Dangling escape')
                text += src[i + 1] as string
                started = true
                i += 2
                continue
            }

            if ((ch === '"' || ch === "'") && !started) {
                // quote opens a token only at a token boundary
                quoted = true
                started = true
                const close = ch
                i += 1
                let closed = false
                while (i < src.length) {
                    const c = src[i] as string
                    if (c === '\\') {
                        if (i + 1 >= src.length) throw new ParseError('Dangling escape')
                        text += src[i + 1] as string
                        i += 2
                        continue
                    }
                    if (c === close) { closed = true; i += 1; break }
                    text += c
                    i += 1
                }
                if (!closed) throw new ParseError('Unterminated quote')
                continue
            }

            text += ch
            started = true
            i += 1
        }

        if (ref) {
            const name = text.slice(1)
            if (!NAME_RE.test(name)) throw new ParseError(`Invalid @reference "${text}"`)
            tokens.push({ kind: 'ref', name })
        } else {
            tokens.push({ kind: 'word', text, quoted })
        }
    }

    return tokens
}
