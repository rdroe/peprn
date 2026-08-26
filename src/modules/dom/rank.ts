import { dice, normalize } from './fuzzy.js'
import type { Candidate, MatchRow, RankResult, RankSpec, Rect, Source } from './types.js'

// Ranking (PLAN-dom.md "Ranking" section) — all pure, operating only on
// Candidate/RankSpec data. find.ts (later phase) is the only caller: it
// builds a RankSpec from options, calls rankCandidates, and either returns
// `matches` or throws a friendly error carrying `guesses`.

const THRESHOLD = 0.3

// Fuzzy tier band. A dice coefficient at or above FUZZY_MIN_DICE is mapped
// linearly onto [FUZZY_FLOOR, FUZZY_CEIL] rather than scaled by a flat factor:
// a flat `dice * 0.7` puts the whole accepted range below THRESHOLD once a
// source weight is applied (0.34 * 0.7 * 0.95 = 0.23), so the gate could never
// admit anything the ranker would then keep. The band keeps the tier strictly
// under the substring tier (0.75) while letting a gate-passing match survive.
const FUZZY_MIN_DICE = 0.34
const FUZZY_FLOOR = 0.32
const FUZZY_CEIL = 0.74

const SOURCE_WEIGHT: Record<Source, number> = {
    label: 1.0,
    aria: 0.98,
    text: 0.95,
    placeholder: 0.9,
    value: 0.85,
    title: 0.8,
    alt: 0.8,
    testid: 0.75,
    // below every stated source: an inferred name can add a match the page
    // never named, but must never outrank one the page did name
    proximate: 0.6
}

// scan + fallback order when nothing scores above 0 (picks a deterministic
// `via`/`name` for row display)
const SOURCE_PRIORITY: Source[] = ['label', 'aria', 'text', 'placeholder', 'value', 'title', 'alt', 'testid', 'proximate']

/**
 * How much a caption is demoted — an element whose text is what named some
 * other candidate via `proximate`.
 *
 * It has to be low enough to lose to the control it captions: a `<span>Email`
 * scores 0.95 through `text`, and the unnamed `<input>` beside it scores 0.6
 * through `proximate`, so without this the caption wins and `type email …`
 * resolves onto inert text. At 0.5 the caption lands at 0.475 and the control
 * takes it, while a genuinely-named element still outranks both.
 */
const CAPTION_PENALTY = 0.5

/**
 * Best dice coefficient of `q` against the whole of `v` and against each of
 * `v`'s individual words.
 *
 * Whole-string dice alone dilutes badly on multi-word labels: a typo of one
 * word ("sumbit" for the button labelled "Submit order") scores against the
 * trailing words too, dropping it under the gate even though one word is a
 * near-perfect match. Scoring per word as well means extra words in a label
 * can no longer bury a typo'd match of the word the user actually typed.
 */
const bestDice = (q: string, v: string): number => {
    let best = dice(q, v)
    for (const word of v.split(' ')) {
        if (word.length === 0) continue
        const d = dice(q, word)
        if (d > best) best = d
    }
    return best
}

/**
 * Tiered strength of `value` against `query`, both normalized first:
 * equality 1.0 · value starts with query 0.9 · a whole word of value starts
 * with query 0.85 · substring 0.75 · else (unless `exact`) the bigram dice
 * coefficient — best of whole-string and per-word — mapped onto the fuzzy
 * band when it clears `FUZZY_MIN_DICE` · else 0. An empty query is a wildcard
 * (matches everything at full strength) — used when a search has no text
 * query at all (e.g. `find --role button`).
 */
export const matchStrength = (query: string, value: string, exact = false): number => {
    const q = normalize(query)
    if (q.length === 0) return 1

    const v = normalize(value)
    if (v.length === 0) return 0
    if (q === v) return 1
    if (v.startsWith(q)) return 0.9
    if (v.split(' ').some((word) => word.startsWith(q))) return 0.85
    if (v.includes(q)) return 0.75

    if (!exact) {
        const d = bestDice(q, v)
        if (d >= FUZZY_MIN_DICE) {
            const t = (d - FUZZY_MIN_DICE) / (1 - FUZZY_MIN_DICE)
            return FUZZY_FLOOR + t * (FUZZY_CEIL - FUZZY_FLOOR)
        }
    }

    return 0
}

interface Scored {
    cand: Candidate
    score: number
    via: Source
    name: string
}

/** best (strength × source weight) over the sources `spec` says to consider */
const computeBase = (cand: Candidate, spec: RankSpec): { base: number; via: Source; name: string } => {
    const narrowing = spec.sources !== undefined && Object.keys(spec.sources).length > 0

    let bestSource: Source | null = null
    let bestWeighted = -1
    let bestName = ''

    for (const source of SOURCE_PRIORITY) {
        const value = cand.sources[source]
        if (value === undefined) continue

        // narrowing (--label, --placeholder, …) restricts scoring to the
        // sources explicitly given, each against its own query text
        const query = narrowing ? spec.sources?.[source] : spec.query
        if (query === undefined) continue

        const weighted = matchStrength(query, value, spec.exact) * SOURCE_WEIGHT[source]
        if (weighted > bestWeighted) {
            bestWeighted = weighted
            bestSource = source
            bestName = value
        }
    }

    if (bestSource !== null) return { base: bestWeighted, via: bestSource, name: bestName }

    // nothing scorable (e.g. narrowing named a source this candidate lacks):
    // still pick a deterministic via/name so the row has an identity
    for (const source of SOURCE_PRIORITY) {
        const value = cand.sources[source]
        if (value !== undefined) return { base: 0, via: source, name: value }
    }
    return { base: 0, via: 'text', name: cand.text ?? '' }
}

/** !visible halves the score; disabled multiplies it by 0.8; a caption loses to what it captions */
const applyModifiers = (base: number, cand: Candidate): number => {
    let score = base
    if (!cand.visible) score *= 0.5
    if (cand.disabled) score *= 0.8
    if (cand.caption) score *= CAPTION_PENALTY
    return score
}

const centerOf = (rect: Rect): { cx: number; cy: number } => ({
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2
})

/** score → visible → document order (the tie-break rule, used both for the anchor pick and the final sort) */
const compareScored = (a: Scored, b: Scored): number => {
    if (b.score !== a.score) return b.score - a.score
    if (a.cand.visible !== b.cand.visible) return a.cand.visible ? -1 : 1
    return a.cand.order - b.cand.order
}

/**
 * Rank an anchor query and return the top hit's rect center.
 *
 * Two things this must NOT do. It must not search the role-filtered pool: an
 * anchor is by definition a different element from the matches (a heading, a
 * card title), so `--role button` would usually filter the anchor away and
 * leave `--near` silently inert. And it must not return a center when nothing
 * actually matched — every candidate scoring 0 would otherwise hand back
 * whichever element happens to be first in document order, quietly reweighting
 * the whole ranking around an arbitrary point. A miss returns null, and the
 * caller then ignores `--near` rather than acting on a fiction.
 */
const resolveAnchorCenter = (
    all: Candidate[],
    anchorQuery: string,
    exact?: boolean
): { cx: number; cy: number } | null => {
    if (all.length === 0) return null
    const scored = all.map((cand) => {
        const { base, via, name } = computeBase(cand, { query: anchorQuery, exact })
        return { cand, score: applyModifiers(base, cand), via, name }
    })
    scored.sort(compareScored)
    const top = scored[0]
    if (!top || top.score < THRESHOLD) return null
    return centerOf(top.cand.rect)
}

const toRow = (item: Scored, nth: number): MatchRow => {
    const { cand, score, via, name } = item
    const row: MatchRow = {
        ref: cand.ref,
        nth,
        tag: cand.tag,
        role: cand.role,
        name,
        via,
        score: Math.round(score * 100) / 100,
        x: Math.round(cand.rect.x),
        y: Math.round(cand.rect.y),
        w: Math.round(cand.rect.width),
        h: Math.round(cand.rect.height)
    }
    if (cand.text !== undefined) {
        row.text = cand.text.length > 40 ? `${cand.text.slice(0, 40)}…` : cand.text
    }
    if (cand.testid !== undefined) row.testid = cand.testid
    return row
}

/**
 * Score, filter and sort `cands` against `spec`. `role` is a hard filter
 * applied before scoring. `near`, when given, ranks the anchor text within
 * the same (role-filtered) pool, takes the top hit's rect center `C`, and
 * scales every score by `0.7 + 0.3 * p` where `p = 1 / (1 + dist(C) / 200)`.
 *
 * With `spec.nth` set, the result is either a single-element `matches` (the
 * Nth survivor, keeping its requested nth) or an empty one with guesses.
 * Otherwise `matches` is the top `spec.limit` (default 5) survivors scoring
 * `>= 0.3`, numbered by their rank position among ALL survivors (so a caller
 * can `--nth 7` past the default limit). When no candidate survives the
 * threshold, `matches` is empty and `guesses` carries the top 3 candidates
 * regardless of score.
 */
export const rankCandidates = (cands: Candidate[], spec: RankSpec): RankResult => {
    const pool = spec.role ? cands.filter((c) => c.role === spec.role) : cands

    // anchor resolves against ALL candidates, not the role-filtered pool
    const anchorCenter = spec.near ? resolveAnchorCenter(cands, spec.near, spec.exact) : null

    const scored: Scored[] = pool.map((cand) => {
        const { base, via, name } = computeBase(cand, spec)
        let score = applyModifiers(base, cand)
        if (anchorCenter) {
            const c = centerOf(cand.rect)
            const d = Math.hypot(c.cx - anchorCenter.cx, c.cy - anchorCenter.cy)
            const p = 1 / (1 + d / 200)
            score = score * (0.7 + 0.3 * p)
        }
        return { cand, score, via, name }
    })
    scored.sort(compareScored)

    const guessRows = (): MatchRow[] => scored.slice(0, 3).map((s, i) => toRow(s, i + 1))

    if (spec.nth !== undefined) {
        const survivors = scored.filter((s) => s.score >= THRESHOLD)
        const picked = survivors[spec.nth - 1]
        if (!picked) return { matches: [], guesses: guessRows() }
        return { matches: [toRow(picked, spec.nth)], guesses: [] }
    }

    const survivors = scored.filter((s) => s.score >= THRESHOLD)
    if (survivors.length === 0) return { matches: [], guesses: guessRows() }

    const limit = spec.limit ?? 5
    return { matches: survivors.slice(0, limit).map((s, i) => toRow(s, i + 1)), guesses: [] }
}
