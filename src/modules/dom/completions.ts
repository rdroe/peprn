import type { Args } from '../../core/types.js'
import { extractCandidates } from './extract.js'
import { activeAppId, getState } from './registry.js'
import { normalize } from './fuzzy.js'
import { keyToCode } from './keys.js'
import { rankCandidates } from './rank.js'
import { partitionPositional } from './resolve.js'

// Shared completion helpers for every dom leaf (PLAN-dom.md "### Completion
// hooks"). The rules the core imposes (constraint 3, src/core/complete.ts):
//
//  - results are NOT re-filtered by the engine, so each hook self-filters by
//    prefix, case-insensitively;
//  - the browser ghost calls these on every keystroke, so they ride
//    extract.ts's 300ms cache and cap what they return;
//  - a throw contributes nothing (C8 swallows it), so a hook must never be
//    the reason a prompt breaks — hence the environment guard and the
//    try/catch around anything that touches a live element.

/** Max suggestions any one hook returns — the ghost overlay shows a short list. */
const CAP = 12

/** Longest candidate name worth offering; longer ones are page prose, not labels. */
const NAME_MAX = 30

/**
 * The completion-side app id. Falls back to a private id so that, before any
 * verb has run, name completion still works off its own extraction cache
 * rather than returning nothing.
 */
const COMPLETE_APP_ID = '__dom_complete__'

export const completionAppId = (): string => activeAppId() ?? COMPLETE_APP_ID

/** `false` in node, where every DOM-touching hook must return `[]` (constraint 4). */
export const inBrowser = (): boolean => typeof document !== 'undefined'

/** Case-insensitive prefix filter + dedupe + cap, applied to every hook's output. */
export function filterCap(prefix: string, values: Iterable<string>, cap = CAP): string[] {
    const p = normalize(prefix)
    const out: string[] = []
    const seen = new Set<string>()
    for (const value of values) {
        if (!value || seen.has(value)) continue
        if (p.length > 0 && !normalize(value).startsWith(p)) continue
        seen.add(value)
        out.push(value)
        if (out.length >= cap) break
    }
    return out
}

/** The four naming sources the plan draws candidate names from, in weight order. */
const NAME_SOURCES = ['label', 'aria', 'text', 'placeholder'] as const

/**
 * Distinct candidate names on the page (label ∪ aria ∪ text ∪ placeholder),
 * unquoted even when multi-word: `find` joins its positionals, and quoting
 * would break the ghost's proper-prefix rule (PLAN-dom.md P21).
 */
export function candidateNames(prefix: string): string[] {
    const names: string[] = []
    for (const cand of extractCandidates(completionAppId())) {
        for (const source of NAME_SOURCES) {
            const value = cand.sources[source]
            if (value !== undefined && value.length <= NAME_MAX) names.push(value)
        }
    }
    return filterCap(prefix, names)
}

/** Live `elN` refs from the active app's registry, newest first (most recently found is likeliest wanted). */
export function elementRefs(prefix: string): string[] {
    const refs = Array.from(getState(completionAppId()).els.keys()).reverse()
    return filterCap(prefix, refs)
}

/**
 * What every act verb offers at the target position: registry refs first
 * (short, exact, and what a previous `find` just handed the user), then page
 * candidate names for an implicit find.
 */
export function targetCompletions(prefix: string): string[] {
    const refs = elementRefs(prefix)
    if (refs.length >= CAP) return refs
    return filterCap(prefix, [...refs, ...candidateNames(prefix)])
}

/** Live `subN` refs from the active app's subscription table. */
export function subRefs(prefix: string): string[] {
    return filterCap(prefix, Array.from(getState(completionAppId()).subs.keys()))
}

/** The static key names `press` understands (`keys.ts`'s table plus the printable letters/digits). */
export function keyNames(prefix: string): string[] {
    return filterCap(prefix, Object.keys(keyToCode))
}

/**
 * True when the cursor is still on a verb's FIRST positional — i.e. no
 * positional has been completed yet, so the word being typed is the target.
 *
 * `args.positional` holds only the arguments already terminated by a space;
 * the word under the cursor is the `prefix` and is not among them.
 */
export const atTargetPosition = (args: Args): boolean => args.positional.length === 0

/**
 * The element a verb's already-typed target refers to, resolved the same way
 * `resolve.ts` would but without a `ctx` (completion hooks have none) and
 * without any onscreen flash. Used only to look *inside* a target for a later
 * positional's vocabulary — currently just `select`'s option texts.
 */
export function completionTargetElement(args: Args): Element | null {
    const appId = completionAppId()
    const state = getState(appId)
    const partition = partitionPositional(args.positional)

    const firstRow = partition.rows[0]
    if (firstRow) return state.els.get(firstRow.ref) ?? null

    const firstRef = partition.refs[0]
    if (firstRef) return state.els.get(firstRef) ?? null

    const firstWord = partition.words[0]
    if (firstWord !== undefined) {
        const { matches } = rankCandidates(extractCandidates(appId), { query: firstWord })
        const top = matches[0]
        if (top) return state.els.get(top.ref) ?? null
    }
    return null
}

/**
 * Option texts of a `<select>` the user has already named, for `select`'s
 * second positional. Best-effort: resolving the target re-runs ranking, so a
 * failure here (no match yet, target isn't a select) simply offers nothing.
 */
export function optionTexts(prefix: string, resolve: () => Element | null): string[] {
    try {
        const el = resolve()
        if (!el || el.tagName !== 'SELECT') return []
        const texts = Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim())
        return filterCap(prefix, texts)
    } catch {
        return []
    }
}
