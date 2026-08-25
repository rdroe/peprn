import type { Module, OptionSpec } from '../../core/types.js'
import { ROLES, type EventRow, type Role, type SubRow } from './types.js'
import { partitionPositional, resolveTarget, type PositionalPartition, type ResolveOptions } from './resolve.js'
import { beginVerb } from './extract.js'
import { atTargetPosition, filterCap, inBrowser, subRefs, targetCompletions } from './completions.js'
import { getState, type Sub } from './registry.js'

// `on` / `off` / `events` — the last 3 leaves (PLAN-dom.md "### Listen: on /
// off / events (listen.ts)"). `serializeEvent` (below) is the pure half —
// unit-tested directly, per constraint 5 — and reads only plain fields off
// whatever it's handed, so a real KeyboardEvent/PointerEvent/InputEvent
// satisfies its parameter type structurally in the browser while a unit test
// can pass a plain object literal, with no DOM-emulation dependency either
// way. Everything else in this file (the subscription store, listener
// wrappers, the `on`/`off`/`events` Modules themselves) is impure and
// smoke-verified only, same as act.ts/find.ts. Like those two, this file
// stays self-contained rather than importing shared option/help scaffolding
// from act.ts (find.ts's `guessMessage` comment sets the precedent).

// ---------- pure: serializeEvent ----------

/**
 * The minimal shape `serializeEvent` reads from. A real DOM `Event` (and its
 * `KeyboardEvent`/`PointerEvent`/`MouseEvent`/`InputEvent` subtypes) is
 * structurally assignable here with no cast: every field below beyond
 * `type`/`timeStamp` is optional, and `target?: EventTarget | null` accepts
 * the real `target: EventTarget | null` DOM events carry (EventTarget has no
 * `value` of its own, but TS doesn't require optional properties to be
 * present). That's what lets the same function run for real, dispatched
 * events in the browser and take plain object literals in unit tests.
 */
export interface SerializableEvent {
    type: string
    timeStamp: number
    /** keyboard: KeyboardEvent.key ('a', 'Enter', ...) */
    key?: string
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    metaKey?: boolean
    /** pointer/mouse: button index + client coords */
    button?: number
    clientX?: number
    clientY?: number
    /**
     * input/change: read for `.value` only. Typed `unknown` rather than
     * `{ value?: unknown }` — a real DOM event's `target: EventTarget | null`
     * has no statically-known `value` field (only some EventTarget subtypes
     * do), and TS's weak-type detection rejects that mismatch at the call
     * site if this field were itself a some-properties-optional object type.
     * `inputSummary` below does the runtime narrowing instead.
     */
    target?: unknown
}

export interface SerializedEvent {
    type: string
    ts: number
    summary: string
}

const KEYBOARD_TYPES = new Set(['keydown', 'keyup'])
const INPUT_TYPES = new Set(['input', 'change'])
const POINTER_TYPES = new Set(['click', 'dblclick', 'pointerdown', 'pointerup', 'mouseover', 'mouseout'])

const VALUE_MAX = 40

/** `Control+Shift+a`-style combo string, mirroring keys.ts's `parseKeySpec` vocabulary in reverse. */
function keyboardSummary(ev: SerializableEvent): string {
    const mods: string[] = []
    if (ev.ctrlKey) mods.push('Control')
    if (ev.shiftKey) mods.push('Shift')
    if (ev.altKey) mods.push('Alt')
    if (ev.metaKey) mods.push('Meta')
    return [...mods, ev.key ?? ''].join('+')
}

/** `button=0 @ x,y`, coords rounded to whole pixels (rect/badge fields elsewhere in this module tree are ints too). */
function pointerSummary(ev: SerializableEvent): string {
    const button = ev.button ?? 0
    const x = Math.round(ev.clientX ?? 0)
    const y = Math.round(ev.clientY ?? 0)
    return `button=${button} @ ${x},${y}`
}

/** target value, ≤40ch, ellipsized — same truncation convention as rank.ts's `MatchRow.text`. */
function inputSummary(ev: SerializableEvent): string {
    const target = ev.target as { value?: unknown } | null | undefined
    const raw = typeof target?.value === 'string' ? target.value : ''
    return raw.length > VALUE_MAX ? `${raw.slice(0, VALUE_MAX)}…` : raw
}

/**
 * `serializeEvent(ev)` — pure (PLAN-dom.md's Files table): given only the
 * event's own fields, produce the `type`/`ts`/`summary` a listener wrapper
 * merges with its subscription's `sub`/`ref`/`seq` to build one `EventRow`.
 * Categorized by `ev.type` against the fixed set `on`'s `-e/--event` choices
 * allow: keyboard (keydown/keyup) → modifier combo; pointer (click/dblclick/
 * pointerdown/pointerup/mouseover/mouseout) → button + coords; input/change →
 * truncated target value. Anything else (submit/focus/blur) has no
 * meaningful extra detail to summarize, so the summary is just the type.
 */
export function serializeEvent(ev: SerializableEvent): SerializedEvent {
    let summary: string
    if (KEYBOARD_TYPES.has(ev.type)) summary = keyboardSummary(ev)
    else if (INPUT_TYPES.has(ev.type)) summary = inputSummary(ev)
    else if (POINTER_TYPES.has(ev.type)) summary = pointerSummary(ev)
    else summary = ev.type

    return { type: ev.type, ts: Math.round(ev.timeStamp), summary }
}

// ---------- impure: subscription store ----------

const EVENT_TYPES = [
    'click',
    'dblclick',
    'input',
    'change',
    'keydown',
    'keyup',
    'submit',
    'focus',
    'blur',
    'pointerdown',
    'pointerup',
    'mouseover',
    'mouseout'
] as const

const MAX_BUFFER = 100

/**
 * `sub`/event ids are monotonic per app id, module-local here rather than on
 * `DomState` (registry.ts phase 2 didn't reserve a counter for them — its
 * `seq` field is documented as specifically for `elN` refs). Same accepted,
 * bounded-leak shape as everything else per-app-id in this module tree:
 * entries are never removed, only ever grow for the lifetime of the page.
 */
const subSeqByApp = new Map<string, number>()
const eventSeqByApp = new Map<string, number>()

function nextSubId(appId: string): string {
    const n = (subSeqByApp.get(appId) ?? 0) + 1
    subSeqByApp.set(appId, n)
    return `sub${n}`
}

function nextEventSeq(appId: string): number {
    const n = (eventSeqByApp.get(appId) ?? 0) + 1
    eventSeqByApp.set(appId, n)
    return n
}

const toSubRow = (sub: Sub): SubRow => ({ sub: sub.id, ref: sub.ref, events: sub.events, count: sub.count, live: sub.live })

/** best-effort append of one line to the public P13 output contract (`${appId}-out`); a no-op if that element isn't present, per the plan ("buffer-only if absent"). */
function appendLive(appId: string, row: EventRow): void {
    const out = document.getElementById(`${appId}-out`)
    if (!out) return
    const line = document.createElement('div')
    line.textContent = `[${row.sub}] ${row.type} ${row.summary}`
    out.appendChild(line)
    out.scrollTop = out.scrollHeight
}

function pushBuffered(sub: Sub, row: EventRow): void {
    sub.buffer.push(row)
    if (sub.buffer.length > MAX_BUFFER) sub.buffer.shift()
}

/**
 * Detach every listener `on` attached, but keep the subscription (and its
 * buffer) so what it already observed can still be drained. Safe on a sub
 * whose element has left the document — `removeEventListener` on a
 * disconnected element is a harmless no-op.
 */
function detachSub(sub: Sub): void {
    for (const { type, handler } of sub.handlers) {
        sub.el.removeEventListener(type, handler)
    }
    sub.handlers = []
    sub.closed = true
}

/** detach and forget entirely — `off`'s job, and the end of the line for the buffer. */
function removeSub(appId: string, sub: Sub): void {
    detachSub(sub)
    getState(appId).subs.delete(sub.id)
}

/**
 * Attaches one real listener per `sub.events` entry. Never calls
 * `preventDefault` (PLAN-dom.md: "never calls preventDefault") — subscribers
 * only observe. Each firing: bump `count` (uncapped — the full historical
 * total, independent of the ring buffer below), buffer a serialized
 * `EventRow` (capped at 100, oldest dropped first), best-effort `--live`
 * append, then auto-`off` if `--once` and this was the first observation.
 */
function attachHandlers(appId: string, sub: Sub): void {
    for (const type of sub.events) {
        const handler: EventListener = (ev) => {
            sub.count += 1
            const row: EventRow = { sub: sub.id, ref: sub.ref, seq: nextEventSeq(appId), ...serializeEvent(ev) }
            pushBuffered(sub, row)
            if (sub.live) appendLive(appId, row)
            // `--once` stops listening but must NOT drop the subscription:
            // dropping it here would take the one event it just captured with
            // it, leaving nothing for `events` to drain.
            if (sub.once) detachSub(sub)
        }
        sub.el.addEventListener(type, handler)
        sub.handlers.push({ type, handler })
    }
}

function createSub(appId: string, ref: string, el: Element, events: string[], live: boolean, once: boolean): Sub {
    const sub: Sub = { id: nextSubId(appId), ref, el, events, buffer: [], count: 0, live, once, closed: false, handlers: [] }
    attachHandlers(appId, sub)
    getState(appId).subs.set(sub.id, sub)
    return sub
}

/** unknown id -> the same "run on first" friendly shape as registry.ts's `resolveRef` uses for stale/unknown element refs. */
function resolveSubRef(appId: string, id: string): Sub {
    const sub = getState(appId).subs.get(id)
    if (!sub) throw new Error(`dom: no subscription "${id}" — run on first`)
    return sub
}

/** drop any subscription whose element has left the document — the "prunes stale" half of `off` (PLAN-dom.md). */
function pruneStaleSubs(appId: string): void {
    for (const sub of Array.from(getState(appId).subs.values())) {
        if (!sub.el.isConnected) removeSub(appId, sub)
    }
}

/** resolve `--all` or the partition's spliced/bare sub references into live `Sub`s, deduped and in the order given. */
function targetSubs(appId: string, partition: PositionalPartition, all: boolean): Sub[] {
    if (all) return Array.from(getState(appId).subs.values())

    const subs: Sub[] = []
    const seen = new Set<string>()
    const add = (id: string): void => {
        if (seen.has(id)) return
        seen.add(id)
        subs.push(resolveSubRef(appId, id))
    }
    for (const row of partition.subRows) add(row.sub)
    for (const id of partition.subRefs) add(id)
    return subs
}

function dedupe(items: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of items) {
        if (!seen.has(item)) {
            seen.add(item)
            out.push(item)
        }
    }
    return out
}

const strOpt = (v: unknown): string | undefined => (v === undefined ? undefined : String(v))
const numOpt = (v: unknown): number | undefined => (v === undefined ? undefined : Number(v))

/** `--waitfor` arrives as `true` when bare (the parser's valueless-flag rule) or a number when given a timeout. */
const waitForOpt = (v: unknown): number | true | undefined =>
    v === undefined ? undefined : v === true ? true : Number(v)

// ---------- on ----------

/** the same targeting knobs act.ts's verbs carry, duplicated locally rather than imported — see the file-top note on staying self-contained. */
const TARGETING_OPTIONS: Record<string, OptionSpec> = {
    target: {
        alias: 't',
        type: 'string',
        describe: 'explicit target: a registry ref (elN), a spliced row/handle, or query text run through an implicit find'
    },
    role: {
        alias: 'k',
        type: 'string',
        choices: [...ROLES],
        describe: 'require this inferred role, for the implicit-find target resolution'
    },
    near: { type: 'string', describe: 'rank the implicit-find target nearer to this anchor text' },
    exact: { alias: 'x', type: 'boolean', describe: 'exact normalized match only for the implicit-find target (no fuzzy)' },
    nth: { alias: 'n', type: 'number', describe: 'pick the Nth ranked match for the implicit-find target (1-based)' },
    quiet: { alias: 'q', type: 'boolean', describe: 'skip the onscreen pointer flash' },
    waitfor: {
        alias: 'w',
        type: 'number',
        describe: 'retry until the target appears instead of failing immediately; optional timeout in ms (default 5000)'
    }
}

const TARGETING_HELP: Record<string, string> = Object.fromEntries(
    Object.entries(TARGETING_OPTIONS).map(([k, v]) => [k, v.describe ?? ''])
)

function buildResolveOpts(opts: Record<string, unknown>, consumesRest = false): ResolveOptions {
    return {
        role: strOpt(opts.role) as Role | undefined,
        near: strOpt(opts.near),
        exact: opts.exact === true,
        nth: numOpt(opts.nth),
        quiet: opts.quiet === true,
        consumesRest,
        waitFor: waitForOpt(opts.waitfor)
    }
}

export const on: Module<SubRow[]> = {
    help: {
        description:
            'subscribe to events on an element: never calls preventDefault, buffers observations (ring, cap 100) for `events` to drain',
        options: {
            ...TARGETING_HELP,
            event: `event names to observe (default click); choices: ${EVENT_TYPES.join(', ')}`,
            live: 'also append one line per observed event to the visible output, best-effort (buffer always fills regardless)',
            once: 'auto-off this subscription after its first observed event'
        },
        examples: {
            'submit click as clicks': 'find "submit" and watch it for clicks, saving the subscription as a handle',
            '@btn -e click -e keydown': 'watch a saved handle for both click and keydown'
        }
    },
    options: {
        ...TARGETING_OPTIONS,
        event: { alias: 'e', type: 'string', array: true, choices: [...EVENT_TYPES], describe: 'event names to observe (default click)' },
        live: { type: 'boolean', describe: 'also append one line per observed event to the visible output, best-effort' },
        once: { type: 'boolean', describe: 'auto-off this subscription after its first observed event' }
    },
    fn: async (ctx) => {
        beginVerb(ctx)
        const appId = ctx.app.id
        const opts = ctx.args.options
        const { ref, el, rest } = await resolveTarget(ctx, buildResolveOpts(opts, true))

        const fromOption = Array.isArray(opts.event) ? opts.event.map(String) : []
        const merged = dedupe([...rest, ...fromOption])
        const events = merged.length > 0 ? merged : ['click']

        for (const e of events) {
            if (!(EVENT_TYPES as readonly string[]).includes(e)) {
                throw new Error(`dom: unknown event "${e}" — expected one of ${EVENT_TYPES.join(', ')}`)
            }
        }

        const sub = createSub(appId, ref, el, events, opts.live === true, opts.once === true)
        return [toSubRow(sub)]
    }
}

// ---------- off ----------

export const off: Module<{ off: string }[]> = {
    help: {
        description: 'unsubscribe: removes listeners and drops the subscription(s); also prunes any subscription whose element has left the document',
        options: {
            all: 'remove every live subscription instead of specific ones'
        },
        examples: {
            '@sub': 'remove one subscription saved as a handle',
            '--all': 'remove every live subscription'
        }
    },
    options: {
        all: { type: 'boolean', describe: 'remove every live subscription instead of specific ones' }
    },
    fn: async (ctx) => {
        beginVerb(ctx)
        const appId = ctx.app.id

        const opts = ctx.args.options
        const all = opts.all === true
        const partition = partitionPositional(ctx.args.positional)

        if (!all && partition.subRows.length === 0 && partition.subRefs.length === 0) {
            throw new Error('dom: off needs a subscription (e.g. @sub, sub1) or --all')
        }

        // Resolve BEFORE pruning: pruning first would delete any named sub whose
        // element has since left the document, so `off sub1` would report an
        // unknown subscription instead of doing exactly what was asked.
        const subs = targetSubs(appId, partition, all)
        const rows = subs.map((sub) => ({ off: sub.id }))
        for (const sub of subs) removeSub(appId, sub)
        pruneStaleSubs(appId)
        return rows
    }
}

// ---------- events ----------

export const events: Module<EventRow[]> = {
    help: {
        description: 'drain buffered events from one or more subscriptions (default: every live subscription), oldest first',
        options: {
            all: 'drain every live subscription (implicit when no subscription is given)',
            keep: 'peek without clearing the drained rows from the buffer',
            limit: 'max rows returned (oldest first); default: everything buffered'
        },
        examples: {
            '@clicks': 'drain one subscription saved as a handle',
            '--all --keep': 'peek at every subscription without clearing their buffers'
        }
    },
    options: {
        all: { type: 'boolean', describe: 'drain every live subscription (implicit when no subscription is given)' },
        keep: { type: 'boolean', describe: 'peek without clearing the drained rows from the buffer' },
        limit: { type: 'number', describe: 'max rows returned (oldest first); default: everything buffered' }
    },
    fn: async (ctx) => {
        beginVerb(ctx)
        const appId = ctx.app.id
        const opts = ctx.args.options
        const partition = partitionPositional(ctx.args.positional)
        const explicit = partition.subRows.length > 0 || partition.subRefs.length > 0

        const subs = targetSubs(appId, partition, opts.all === true || !explicit)

        const merged = subs.flatMap((sub) => sub.buffer.map((row) => ({ sub, row })))
        merged.sort((a, b) => a.row.seq - b.row.seq)

        const limit = numOpt(opts.limit)
        const selected = limit !== undefined ? merged.slice(0, limit) : merged

        if (opts.keep !== true) {
            const drained = new Map<string, Set<number>>()
            for (const { row } of selected) {
                let seqs = drained.get(row.sub)
                if (!seqs) {
                    seqs = new Set()
                    drained.set(row.sub, seqs)
                }
                seqs.add(row.seq)
            }
            for (const sub of subs) {
                const seqs = drained.get(sub.id)
                if (!seqs) continue
                sub.buffer = sub.buffer.filter((row) => !seqs.has(row.seq))
            }
        }

        return selected.map(({ row }) => row)
    }
}

// ---------- completion hooks ----------

// PLAN-dom.md "### Completion hooks": "`on` → event names; `off`/`events` →
// live sub refs".

/** target at position 0, then the observable event names. */
on.complete = (prefix, args) => {
    if (!inBrowser()) return []
    if (atTargetPosition(args)) return targetCompletions(prefix)
    return filterCap(prefix, EVENT_TYPES)
}

// `off` and `events` take nothing but subscription refs, at every position.
off.complete = (prefix) => (inBrowser() ? subRefs(prefix) : [])
events.complete = (prefix) => (inBrowser() ? subRefs(prefix) : [])
