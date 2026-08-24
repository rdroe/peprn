// Pure data shapes for peprn/dom. Nothing in this file touches `document` or
// `window` — the impure layer (extract.ts, registry.ts, …) builds these from
// real DOM state, and the pure layer (fuzzy/roles/keys/rank/geometry) only
// ever sees plain data.

/**
 * ARIA-ish roles peprn/dom infers and lets `find --role` filter on. Closed
 * union so ranking/rows stay exhaustive; see `roles.ts` for the inference
 * rules that produce one of these from a tag/type/role attribute.
 */
export const ROLES = [
    'button',
    'link',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'listbox',
    'option',
    'slider',
    'heading',
    'img',
    'generic'
] as const

export type Role = (typeof ROLES)[number]

/**
 * The named "places" an accessible name/value can come from on an element,
 * in the priority order used to pick `via` when several sources tie.
 * Weights live in `rank.ts`.
 */
/**
 * Where a candidate's name came from. The first eight are facts the markup
 * states outright. `proximate` is the one inference: text that visually labels
 * a control without any DOM association to it (a `<span>` before an `<input>`,
 * a cell to the left), used only when a candidate has no stated name at all
 * and weighted below every stated source, so it can add matches that scored
 * zero but can never displace one the page actually named. A row's `via` field
 * reports it, so a guess always announces itself as a guess.
 */
export type Source =
    | 'label'
    | 'aria'
    | 'text'
    | 'placeholder'
    | 'value'
    | 'title'
    | 'alt'
    | 'testid'
    | 'proximate'

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/**
 * One extracted, scoreable element. Produced by `extract.ts` (impure, later
 * phase); everything downstream of extraction — ranking, geometry — is pure
 * and operates only on this shape.
 */
export interface Candidate {
    /** stable registry ref, e.g. 'el7' */
    ref: string
    tag: string
    role: Role
    /** raw string per source; only sources that actually apply are present */
    sources: Partial<Record<Source, string>>
    testid?: string
    /** collapsed textContent, ≤80ch, for row display */
    text?: string
    visible: boolean
    disabled: boolean
    /**
     * This element's text is what named some OTHER candidate via `proximate` —
     * it is a caption, and the thing it captions is almost always the better
     * target. Demoted in ranking so `find email` lands on the input rather than
     * the `<span>` that labels it.
     */
    caption?: boolean
    rect: Rect
    /** document order index; the last-resort tie-break */
    order: number
}

/** A ranked find result row — pure JSON, safe to splice through `@handle`. */
export interface MatchRow {
    ref: string
    /** 1-based rank position among survivors */
    nth: number
    tag: string
    role: Role
    name: string
    via: Source
    score: number
    /** ≤40ch, ellipsized */
    text?: string
    testid?: string
    x: number
    y: number
    w: number
    h: number
}

/** A `find`-style query plus the ranking knobs `rankCandidates` honors. */
export interface RankSpec {
    /** normalized internally; empty string matches every candidate fully */
    query: string
    /**
     * per-source narrowing (`--label`, `--placeholder`, …). When present and
     * non-empty, only the listed sources are scored, each against its own
     * value, instead of `query` against every source.
     */
    sources?: Partial<Record<Source, string>>
    /** hard filter: candidates whose role differs are excluded entirely */
    role?: Role
    /** rank matches nearer to this anchor text (resolved within the same pool) */
    near?: string
    /** exact normalized match only; disables the dice fallback tier */
    exact?: boolean
    /** pick the Nth ranked survivor (1-based) instead of the top slice */
    nth?: number
    /** max rows returned when `nth` is not given; default 5 */
    limit?: number
}

export interface RankResult {
    matches: MatchRow[]
    /** populated only when `matches` is empty: the top 3 candidates regardless of threshold */
    guesses: MatchRow[]
}

/** A live subscription row for `on` / `off` / `events` (listen.ts, later phase). */
export interface SubRow {
    sub: string
    ref: string
    events: string[]
    count: number
    live: boolean
}

/** A drained event row for `events` (listen.ts, later phase). */
export interface EventRow {
    sub: string
    ref: string
    seq: number
    type: string
    ts: number
    summary: string
}
