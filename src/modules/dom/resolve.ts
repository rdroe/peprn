import type { Invocation } from '../../core/types.js'
import type { MatchRow, RankSpec, Role, SubRow } from './types.js'
import { rankCandidates } from './rank.js'
import { extractCandidates } from './extract.js'
import { resolveRef } from './registry.js'
import { getOrCreateOverlay } from './overlay.js'

// Shared target resolution (PLAN-dom.md "Target resolution
// (positional-partition rule)"). Every find/act/listen verb (later phases)
// calls `resolveTarget` once instead of re-deriving this logic. Smoke-verified
// only, per constraint 5 — no unit tests here, though `partitionPositional`
// itself touches no DOM and would be easy to unit-test if a future phase
// wants that.

const REF_RE = /^el\d+$/
const SUB_REF_RE = /^sub\d+$/

export interface PositionalPartition {
    /** spliced `MatchRow` objects, e.g. from `click @btn` */
    rows: MatchRow[]
    /** spliced `SubRow` objects, e.g. from `events @clicks` */
    subRows: SubRow[]
    /** bare registry ref strings ('el7', ...) */
    refs: string[]
    /** bare sub ref strings ('sub2', ...) */
    subRefs: string[]
    /** everything else, in order, stringified */
    words: string[]
}

// A `SubRow` also carries a `.ref` field (the *element* it's attached to), so
// it must be checked before `MatchRow` — `.sub` is what makes it a SubRow.
const isSubRow = (v: unknown): v is SubRow =>
    typeof v === 'object' && v !== null && typeof (v as { sub?: unknown }).sub === 'string'

const isMatchRow = (v: unknown): v is MatchRow =>
    typeof v === 'object' && v !== null && !isSubRow(v) && typeof (v as { ref?: unknown }).ref === 'string'

/**
 * Split `positional` into the five buckets the positional-partition rule
 * describes. Order is preserved within each bucket. This is the piece every
 * verb (find, the act verbs, `on`/`off`/`events`) shares: element-targeting
 * verbs consume `rows`/`refs`/`words` via `resolveTarget` below, while
 * `off`/`events` (listen.ts, a later phase) consume `subRows`/`subRefs`
 * directly — they target existing subscriptions, not elements, so they have
 * no need for `resolveTarget`'s element resolution.
 */
export const partitionPositional = (positional: readonly unknown[]): PositionalPartition => {
    const rows: MatchRow[] = []
    const subRows: SubRow[] = []
    const refs: string[] = []
    const subRefs: string[] = []
    const words: string[] = []

    for (const item of positional) {
        if (isSubRow(item)) {
            subRows.push(item)
        } else if (isMatchRow(item)) {
            rows.push(item)
        } else if (typeof item === 'string' && REF_RE.test(item)) {
            refs.push(item)
        } else if (typeof item === 'string' && SUB_REF_RE.test(item)) {
            subRefs.push(item)
        } else {
            words.push(String(item))
        }
    }
    return { rows, subRows, refs, subRefs, words }
}

export interface ResolveOptions {
    /** hard role filter, used only by the implicit-find fallback */
    role?: Role
    /** rank matches nearer to this anchor text, used only by the implicit-find fallback */
    near?: string
    /** exact normalized match only, used only by the implicit-find fallback */
    exact?: boolean
    /** pick the Nth ranked survivor of the implicit find instead of the top one */
    nth?: number
    /** skip the onscreen flash */
    quiet?: boolean
    /**
     * Whether the calling verb takes a trailing argument of its own.
     *
     * `select`/`on`/`type`/`press` do, so for them only the FIRST leftover word
     * is the target query and the rest comes back as `rest`. The seven verbs
     * that take no trailing argument (click, dblclick, clear, check, uncheck,
     * hover, focus) discard `rest` entirely, so splitting there would silently
     * drop words: `click delete all` would look for "delete" and click the
     * plain "Delete" button. Those verbs leave this false and get every word
     * joined into one query, matching how `find` treats its positionals.
     */
    consumesRest?: boolean
}

export interface ResolvedTarget {
    ref: string
    el: Element
    /** leftover positional words for the verb's own trailing argument (type text, select choice, press key, event names, ...) */
    rest: string[]
}

const guessMessage = (query: string, guesses: MatchRow[], role?: string): string => {
    // Same empty-guesses guard as find.ts: without it a role filter that empties
    // the pool renders a dangling "— closest: " with nothing after it.
    if (guesses.length === 0) {
        const because = role !== undefined ? ` — no "${role}" elements on this page` : ' — no elements found on this page'
        return `dom: no match for "${query}"${because}`
    }
    const parts = guesses.map((g) => `${g.role} "${g.name}" (${g.ref}, ${g.score})`)
    return `dom: no match for "${query}" — closest: ${parts.join(', ')}`
}

/** Rank `query` against the current page and return the winning ref, or throw the same friendly "no match" error `find` itself throws. */
function implicitFind(appId: string, query: string, opts: ResolveOptions): string {
    const candidates = extractCandidates(appId)
    const spec: RankSpec = { query, role: opts.role, near: opts.near, exact: opts.exact, nth: opts.nth }
    const { matches, guesses } = rankCandidates(candidates, spec)
    const picked = matches[0]
    if (!picked) throw new Error(guessMessage(query, guesses, opts.role))
    return picked.ref
}

/**
 * Resolve one `-t/--target` option value to a registry ref: a spliced
 * `MatchRow` (or an array containing one — a single-value option slot takes
 * a resolved `@handle` array as-is, unspread), a bare ref string, or plain
 * query text run through an implicit find.
 */
function resolveTargetOption(appId: string, value: unknown, opts: ResolveOptions): string {
    if (Array.isArray(value)) {
        const row = value.find(isMatchRow)
        if (row) return row.ref
        const text = value.find((v): v is string => typeof v === 'string')
        if (text !== undefined) return resolveTargetOption(appId, text, opts)
        throw new Error('dom: -t/--target did not resolve to an element')
    }
    if (isMatchRow(value)) return value.ref
    if (typeof value !== 'string') throw new Error('dom: -t/--target did not resolve to an element')
    return REF_RE.test(value) ? value : implicitFind(appId, value, opts)
}

/**
 * Resolve the element every dom verb acts on, per PLAN-dom.md's
 * positional-partition rule. Precedence: an explicit `-t`/`--target` option
 * wins outright (checked under both spellings, since `Args.options` is keyed
 * by whichever spelling a verb declared canonical); else a spliced row
 * object; else a bare registry ref string; else the first leading word, run
 * through an implicit (quiet — no multi-candidate overlay) find. Whatever's
 * left in `positional` after the target is consumed comes back as `rest`,
 * for the verb's own trailing argument — so `type @em hello` composes
 * naturally (the row arrives first, `'hello'` is what's left). On success,
 * the resolved element is flashed onscreen for ~1.2s unless `opts.quiet`.
 */
export function resolveTarget(ctx: Invocation, opts: ResolveOptions = {}): ResolvedTarget {
    const appId = ctx.app.id
    const targetOpt = ctx.args.options.target ?? ctx.args.options.t
    const partition = partitionPositional(ctx.args.positional)

    let ref: string
    let rest: string[]

    if (targetOpt !== undefined) {
        ref = resolveTargetOption(appId, targetOpt, opts)
        rest = partition.words
    } else if (partition.rows.length > 0) {
        ref = partition.rows[0].ref
        rest = partition.words
    } else if (partition.refs.length > 0) {
        ref = partition.refs[0]
        rest = partition.words
    } else if (partition.words.length > 0) {
        if (opts.consumesRest) {
            const [first, ...trailing] = partition.words
            ref = implicitFind(appId, first, opts)
            rest = trailing
        } else {
            ref = implicitFind(appId, partition.words.join(' '), opts)
            rest = []
        }
    } else {
        throw new Error('dom: no target given')
    }

    const el = resolveRef(appId, ref)

    if (!opts.quiet) {
        getOrCreateOverlay(appId).flash({ ref, el })
    }

    return { ref, el, rest }
}
