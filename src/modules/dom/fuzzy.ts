// Hand-rolled fuzzy matching (peprn is zero-runtime-deps, constraint 6):
// bigram Sørensen–Dice coefficient over normalized strings.

/** lowercase + trim + collapse internal whitespace runs to a single space */
export const normalize = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ')

/** character bigrams of `s`; `''` and single-character strings have none */
export const bigrams = (s: string): string[] => {
    const out: string[] = []
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
    return out
}

/**
 * Sørensen–Dice coefficient over the multisets of `a` and `b`'s bigrams:
 * `2 * |shared| / (|A| + |B|)`, each bigram consumed at most once so a
 * repeated pair in one string can't inflate the overlap. 1.0 for identical
 * strings, 0 for completely disjoint ones. Strings shorter than 2 chars have
 * no bigrams at all; two such strings are compared for equality directly so
 * dice() never divides by zero.
 */
export const dice = (a: string, b: string): number => {
    const bigramsA = bigrams(a)
    const bigramsB = bigrams(b)
    if (bigramsA.length === 0 && bigramsB.length === 0) return a === b ? 1 : 0
    if (bigramsA.length === 0 || bigramsB.length === 0) return 0

    const remaining = new Map<string, number>()
    for (const bg of bigramsA) remaining.set(bg, (remaining.get(bg) ?? 0) + 1)

    let shared = 0
    for (const bg of bigramsB) {
        const count = remaining.get(bg) ?? 0
        if (count > 0) {
            shared++
            remaining.set(bg, count - 1)
        }
    }

    return (2 * shared) / (bigramsA.length + bigramsB.length)
}
