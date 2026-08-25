import type { Module } from '../../core/types.js'
import type { MatchRow, RankSpec, Role, Source } from './types.js'
import { ROLES } from './types.js'
import { rankCandidates } from './rank.js'
import { beginVerb, extractCandidates, invalidateCandidates } from './extract.js'
import { waitForOptions } from './resolve.js'
import { pollUntil } from '../async/poll.js'
import { candidateNames, inBrowser } from './completions.js'
import { resolveRef } from './registry.js'
import { clearOverlay, getOrCreateOverlay } from './overlay.js'

// `find` — the Module (PLAN-dom.md "### find" + "### Ranking" + "### Completion
// hooks"). The only leaf phase 3 lands; the ten act verbs and `on`/`off`/`events`
// arrive in later phases and reuse `rankCandidates`/`extractCandidates` the same
// way. Fn is synchronous — every dependency it calls (extractCandidates, rank,
// registry, overlay) is itself synchronous — but the `Module` contract allows a
// Promise return, so nothing downstream depends on that.

/** distinct source keys `find`'s per-source narrowing options address (all of Source except 'aria' — there is no `--aria` option, per the plan's option table) */
const NARROWING_SOURCES: readonly Source[] = ['label', 'placeholder', 'text', 'testid', 'value', 'alt', 'title']

const strOpt = (v: unknown): string | undefined => (v === undefined ? undefined : String(v))
const numOpt = (v: unknown): number | undefined => (v === undefined ? undefined : Number(v))
/** `--waitfor` arrives as `true` when bare (the parser's valueless-flag rule) or a number when given a timeout. */
const waitForOpt = (v: unknown): number | true | undefined =>
    v === undefined ? undefined : v === true ? true : Number(v)

/** Same "closest guesses" message shape as `resolve.ts`'s `implicitFind` — kept local so this file only depends on already-landed phase 2 exports, not an extra one. */
const guessMessage = (query: string, guesses: MatchRow[]): string => {
    if (guesses.length === 0) return `dom: no match for "${query}" — no elements found on this page`
    const parts = guesses.map((g) => `${g.role} "${g.name}" (${g.ref}, ${g.score})`)
    return `dom: no match for "${query}" — closest: ${parts.join(', ')}`
}

/** Per-source narrowing options (`--label`, `--placeholder`, …) → a `RankSpec.sources` map. Only sources whose option was actually given get an entry — `rankCandidates` treats a non-empty map as "narrowing mode" (rank.ts's `computeBase`), so an empty map here correctly falls back to scoring `query` against every source. */
function buildSources(opts: Record<string, unknown>): Partial<Record<Source, string>> {
    const sources: Partial<Record<Source, string>> = {}
    for (const key of NARROWING_SOURCES) {
        const v = strOpt(opts[key])
        if (v !== undefined) sources[key] = v
    }
    return sources
}

const find: Module<MatchRow[]> = {
    help: {
        description:
            'find and point at elements on this page by label/text/placeholder/testid (fuzzy, testing-library-style)',
        options: {
            role: 'require this inferred role (hard filter)',
            near: 'rank matches nearer to this anchor text',
            nth: 'pick the Nth ranked match (1-based)',
            all: 'return up to 25 rows instead of 5',
            exact: 'exact normalized match only (no fuzzy)',
            quiet: 'skip the onscreen pointer',
            clear: 'clear the overlay; alone (no query) just clears and returns []',
            limit: 'max rows (default 5; --all uses 25)'
        },
        examples: {
            'email': 'point at the best-scoring "Email" field (label, aria, placeholder, ... all considered)',
            'submit --role button --nth 2 as btn': 'save the 2nd-ranked "submit" button as a handle for later verbs'
        }
    },
    options: {
        role: { alias: 'k', type: 'string', choices: [...ROLES], describe: 'require this inferred role (hard filter)' },
        label: { type: 'string', describe: 'narrow to the label source only, scored against this text' },
        placeholder: { type: 'string', describe: 'narrow to the placeholder source only, scored against this text' },
        text: { type: 'string', describe: 'narrow to the text-content source only, scored against this text' },
        testid: { type: 'string', describe: 'narrow to the data-testid source only, scored against this text' },
        value: { type: 'string', describe: 'narrow to the value source only, scored against this text' },
        alt: { type: 'string', describe: 'narrow to the alt-text source only, scored against this text' },
        title: { type: 'string', describe: 'narrow to the title-attribute source only, scored against this text' },
        near: { type: 'string', describe: 'rank matches nearer to this anchor text' },
        nth: { alias: 'n', type: 'number', describe: 'pick the Nth ranked match (1-based)' },
        all: { type: 'boolean', describe: 'return up to 25 rows instead of 5' },
        exact: { alias: 'x', type: 'boolean', describe: 'exact normalized match only (no fuzzy)' },
        quiet: { alias: 'q', type: 'boolean', describe: 'skip the onscreen pointer' },
        clear: { type: 'boolean', describe: 'clear the overlay; alone (no query) just clears and returns []' },
        limit: { type: 'number', describe: 'max rows (default 5; --all uses 25)' },
        waitfor: {
            alias: 'w',
            type: 'number',
            describe: 'retry until something matches instead of failing immediately; optional timeout in ms (default 5000)'
        }
    },

    fn: async (ctx) => {
        // constraint 4: guard first, unconditionally — some paths below (e.g.
        // `--clear` alone, when no overlay has ever been created for this app)
        // would otherwise reach no DOM API at all and silently no-op in node.
        beginVerb(ctx)

        const appId = ctx.app.id
        const opts = ctx.args.options

        const roleOpt = strOpt(opts.role)
        if (roleOpt !== undefined && !(ROLES as readonly string[]).includes(roleOpt)) {
            throw new Error(`dom: unknown role "${roleOpt}" — expected one of ${ROLES.join(', ')}`)
        }

        const sources = buildSources(opts)
        const hasSources = Object.keys(sources).length > 0
        const nearOpt = strOpt(opts.near)
        const nthOpt = numOpt(opts.nth)
        const query = ctx.args.positional.map((p) => String(p)).join(' ')

        const clearRequested = opts.clear === true
        const hasQuery = query !== '' || hasSources || roleOpt !== undefined || nearOpt !== undefined || nthOpt !== undefined

        if (clearRequested) clearOverlay(appId)
        if (clearRequested && !hasQuery) return []

        const limit = opts.limit !== undefined ? numOpt(opts.limit) : opts.all === true ? 25 : undefined

        const spec: RankSpec = {
            query,
            sources,
            role: roleOpt as Role | undefined,
            near: nearOpt,
            exact: opts.exact === true,
            nth: nthOpt,
            limit
        }

        const rankOnce = (): MatchRow[] => {
            const { matches, guesses } = rankCandidates(extractCandidates(appId), spec)
            if (matches.length === 0) throw new Error(guessMessage(query, guesses))
            return matches
        }

        // `--waitfor` polls the same ranking rather than a separate code path,
        // so a wait matches exactly what a plain `find` would have returned.
        // The cache is dropped between attempts; without that every retry
        // inside one 300ms window re-reads the same snapshot.
        const waiting = waitForOptions(waitForOpt(opts.waitfor))
        let matches: MatchRow[]
        if (waiting) {
            let first = true
            matches = await pollUntil(
                () => {
                    if (first) first = false
                    else invalidateCandidates(appId)
                    return rankOnce()
                },
                query === '' ? 'a match' : `"${query}"`,
                waiting
            )
        } else {
            matches = rankOnce()
        }

        if (opts.quiet !== true) {
            // Defensive: extractCandidates only serves a cache entry whose
            // elements are all still connected, so these should all resolve —
            // but an element can still leave the document between ranking and
            // pointing. Skip what no longer resolves rather than letting one
            // stale ref throw away every valid match the user asked for.
            const targets: { ref: string; nth: number; el: Element }[] = []
            for (const row of matches) {
                try {
                    targets.push({ ref: row.ref, nth: row.nth, el: resolveRef(appId, row.ref) })
                } catch {
                    // row stays in the returned matches; it just isn't pointed at
                }
            }
            if (targets.length > 0) getOrCreateOverlay(appId).point(targets)
        }

        return matches
    },

    /**
     * Dynamic value completion (PLAN-dom.md "### Completion hooks" + "### find"):
     * distinct candidate names from label ∪ aria ∪ text ∪ placeholder, ≤30ch
     * each, prefix-filtered case-insensitively, capped at 12. Deliberately
     * unquoted even for multi-word names — find joins its positionals with
     * spaces into one query, and quoting a suggestion would break the ghost
     * overlay's proper-prefix rule (PLAN.md P21). A throw here is silently
     * dropped by the core (src/core/complete.ts's C8 try/catch), but the node
     * guard below returns `[]` directly rather than relying on that, per the
     * plan's "environment guard returns `[]` in node".
     */
    complete: (prefix) => (inBrowser() ? candidateNames(prefix) : [])
}

export default find
