import type { EventRow } from './types.js'

// Per-app-id impure state (PLAN-dom.md "Extraction, registry, staleness").
// This file never touches `document`/`window` directly — it only holds and
// inspects `Element` instances handed to it by extract.ts (and, once
// listen.ts lands, subscription bookkeeping) — so unlike extract.ts/overlay.ts
// it needs no `requireDocument()` guard of its own; the guard already ran
// before any live Element could exist to store. Smoke-verified only, per
// constraint 5.

const MAX_ELEMENTS = 200

/**
 * A live subscription created by `on` (listen.ts, a later phase). The shape
 * lives here because registry.ts owns the per-app-id state map; `ref` is the
 * *element's* registry ref (e.g. 'el4'), distinct from this sub's own `id`
 * (e.g. 'sub1') — mirrors the `SubRow` shape in types.ts, plus the live
 * bits (`el`, `handlers`) a plain JSON row can't carry.
 */
export interface Sub {
    id: string
    ref: string
    el: Element
    events: string[]
    /** ring buffer of drained-pending serialized events, capped at 100 */
    buffer: EventRow[]
    count: number
    live: boolean
    once: boolean
    /**
     * True once the listeners have been detached but the subscription is still
     * held for draining — what `--once` leaves behind. A closed sub observes
     * nothing further; its buffer stays readable by `events` until `off`.
     */
    closed: boolean
    handlers: { type: string; handler: EventListener }[]
}

export interface DomState {
    /** last-assigned numeric suffix for 'elN' refs */
    seq: number
    els: Map<string, Element>
    /** reverse index of `els`, for stable-ref reuse in `storeElements` */
    elRefs: Map<Element, string>
    /** keyed by sub id ('sub1', ...); populated once listen.ts exists */
    subs: Map<string, Sub>
    /** opaque `OverlayHandle`; typed and created lazily by overlay.ts, which owns the shape */
    overlay: unknown
    lastHover: Element | null
}

const states = new Map<string, DomState>()

/**
 * The app id of the most recent verb invocation.
 *
 * `Module['complete']` is handed only `(prefix, args)` (core/types.ts) — no
 * `AppHandle`, so a completion hook has no way to reach the registry of the
 * app whose prompt is being typed at. Every verb `fn` records its app id here
 * so the hooks can offer that app's `elN`/`subN` refs. With two apps mounted
 * on one page the suggestion list can be drawn from the other app's registry;
 * that only ever mislabels a *suggestion*, never an action, because every `fn`
 * uses its own `ctx.app.id`.
 */
let lastActiveAppId: string | null = null

/** Called by every verb `fn`; see `lastActiveAppId`. */
export function noteActiveApp(appId: string): void {
    lastActiveAppId = appId
}

/** The app id completion hooks should read state from, if any verb has run yet. */
export function activeAppId(): string | null {
    return lastActiveAppId
}

function createState(): DomState {
    return { seq: 0, els: new Map(), elRefs: new Map(), subs: new Map(), overlay: null, lastHover: null }
}

/** Get (creating on first use) the dom state for one app id. */
export function getState(appId: string): DomState {
    let state = states.get(appId)
    if (!state) {
        state = createState()
        states.set(appId, state)
    }
    return state
}

/** Drop every entry whose element has left the document. */
function pruneDisconnected(state: DomState): void {
    for (const [ref, el] of state.els) {
        if (!el.isConnected) {
            state.els.delete(ref)
            state.elRefs.delete(el)
        }
    }
}

/**
 * Best-effort 200-entry cap: evict disconnected entries (oldest first, by
 * Map insertion order) until under cap. `storeElements` already pruned every
 * disconnected entry before this runs, so in practice this only bites if the
 * live set itself exceeds 200 — at which point every remaining entry is a
 * currently-connected element and none can be safely evicted, so the cap is
 * genuinely soft rather than enforced.
 */
function enforceCap(state: DomState): void {
    if (state.els.size <= MAX_ELEMENTS) return
    for (const [ref, el] of state.els) {
        if (state.els.size <= MAX_ELEMENTS) break
        if (!el.isConnected) {
            state.els.delete(ref)
            state.elRefs.delete(el)
        }
    }
}

/**
 * Assign stable refs to `elements`, reusing an existing ref for the same
 * Element identity across repeated finds. Prunes disconnected entries first
 * (once per find, per the plan), then enforces the soft cap.
 */
export function storeElements(appId: string, elements: readonly Element[]): Map<Element, string> {
    const state = getState(appId)
    pruneDisconnected(state)

    const out = new Map<Element, string>()
    for (const el of elements) {
        let ref = state.elRefs.get(el)
        if (ref === undefined) {
            state.seq += 1
            ref = `el${state.seq}`
            state.elRefs.set(el, ref)
            state.els.set(ref, el)
        }
        out.set(el, ref)
    }

    enforceCap(state)
    return out
}

/**
 * Resolve a registry ref to its live Element, or throw the friendly
 * staleness errors from PLAN-dom.md's "Extraction, registry, staleness":
 * unknown ref -> "run find first"; known-but-disconnected -> "re-run find".
 */
export function resolveRef(appId: string, ref: string): Element {
    const el = getState(appId).els.get(ref)
    if (el === undefined) throw new Error(`dom: no element "${ref}" — run find first`)
    if (!el.isConnected) throw new Error(`dom: ${ref} is no longer in the document — re-run find`)
    return el
}
