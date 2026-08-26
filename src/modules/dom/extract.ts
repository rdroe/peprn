import type { Candidate, Rect, Role, Source } from './types.js'
import { inferRole } from './roles.js'
import { storeElements, noteActiveApp } from './registry.js'

// Impure DOM walk (PLAN-dom.md "Extraction, registry, staleness"). Nothing in
// this file runs at module load time — every export is a function guarded by
// `requireDocument()` (constraint 4) — so importing it in node is safe; only
// *calling* `extractCandidates` there throws. Smoke-verified only, per
// constraint 5: this file has no unit tests.

const CACHE_TTL_MS = 300
const MAX_CANDIDATES = 1500
const TEXT_MAX = 80

// A single grouped selector list matches each qualifying node once, already
// in document order (per the CSS selectors spec), so no manual dedupe/sort
// is needed beyond the REPL-UI filter and the cap below.
const SELECTOR = [
    'button', 'a[href]', 'input', 'select', 'textarea', 'option',
    '[role]', '[tabindex]', '[data-testid]', 'label',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img[alt]', '[title]', '[contenteditable="true"]', 'summary'
].join(', ')

// Drop anything belonging to the REPL's own UI — otherwise `find button`
// finds the REPL itself (P13's default UI, P21's ghost, this module's own
// overlay layer, and the manual renderer).
const SKIP_SELECTOR = '.peprn-default, .peprn-default-out, .peprn-ghost, .peprn-dom-layer, .peprn-man'

/**
 * The one guard every DOM-touching export in `peprn/dom` funnels through
 * (constraint 4): `"sideEffects": false` means this module tree may be
 * imported by node consumers that never call any of it, so nothing here may
 * touch `document`/`window` at module scope — only inside a function, and
 * only after this check.
 */
export function requireDocument(): Document {
    if (typeof document === 'undefined') {
        throw new Error('dom: requires a browser environment')
    }
    return document
}

/**
 * The preamble every verb `fn` runs: assert a browser, and record which app is
 * driving so the completion hooks — which the core hands no `AppHandle` — can
 * read that app's registry. Returns the app id, which every caller wants next.
 */
export function beginVerb(ctx: { app: { id: string } }): string {
    requireDocument()
    noteActiveApp(ctx.app.id)
    return ctx.app.id
}

const cache = new Map<string, { at: number; rows: Candidate[]; els: Element[] }>()

/**
 * Drop the cached extraction for one app.
 *
 * Required by every polling caller (`--waitfor`, the `waitfor` verb): the
 * 300ms TTL exists to keep per-keystroke completion cheap, but a poll loop
 * running every 100ms would otherwise re-read the same frozen snapshot three
 * times and conclude nothing had changed — the cache would hide the very
 * mutation being waited for.
 */
export function invalidateCandidates(appId: string): void {
    cache.delete(appId)
}

const collapse = (s: string): string => s.trim().replace(/\s+/g, ' ')
const truncate = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s)
const shorten = (s: string): string | undefined => {
    const collapsed = collapse(s)
    return collapsed ? truncate(collapsed, TEXT_MAX) : undefined
}

function isVisible(el: Element, win: Window): boolean {
    if (el.getClientRects().length === 0) return false
    return win.getComputedStyle(el).visibility !== 'hidden'
}

function isDisabled(el: Element): boolean {
    if ('disabled' in el && (el as { disabled?: unknown }).disabled === true) return true
    return el.getAttribute('aria-disabled') === 'true'
}

/** `input.type` / `select.type` — DOM properties, not raw attributes, so a bare `<input>` reads as its real default ('text'), matching roles.ts's expectations. */
function elementType(el: Element, tag: string): string | undefined {
    if (tag === 'input' || tag === 'select') {
        return (el as HTMLInputElement | HTMLSelectElement).type
    }
    return undefined
}

/** `<select>` uses its selected option's display text; other value-bearing controls use `.value` directly. */
function valueOf(el: Element, tag: string): string | undefined {
    if (tag === 'select') {
        const sel = el as HTMLSelectElement
        const opt = sel.options[sel.selectedIndex]
        return opt ? shorten(opt.text) : undefined
    }
    if ('value' in el) {
        const v = (el as { value?: unknown }).value
        return typeof v === 'string' ? shorten(v) : undefined
    }
    return undefined
}

/** Collapsed textContent, except `input[type=button|submit]` — void elements whose visible label is their `value`. */
function textOf(el: Element, tag: string, type: string | undefined): string | undefined {
    if (tag === 'input' && (type === 'button' || type === 'submit')) {
        return shorten((el as HTMLInputElement).value ?? '')
    }
    return shorten(el.textContent ?? '')
}

/** `id -> label text` for every `label[for]` in the document, built once per extraction pass rather than per candidate. */
function buildLabelIndex(doc: Document): Map<string, string> {
    const idx = new Map<string, string>()
    doc.querySelectorAll('label[for]').forEach((label) => {
        const forId = (label as HTMLLabelElement).htmlFor
        if (!forId) return
        const text = shorten(label.textContent ?? '')
        if (text) idx.set(forId, text)
    })
    return idx
}

/**
 * `<dd>` -> its preceding `<dt>`. The description-list pairing is explicit in
 * the markup, so a control inside a `<dd>` is named by its term exactly as
 * reliably as `label[for]` names an input.
 */
function termOf(el: Element): string | undefined {
    const dd = el.closest('dd')
    if (!dd) return undefined
    let prev = dd.previousElementSibling
    while (prev && prev.tagName !== 'DT') prev = prev.previousElementSibling
    return prev ? shorten(prev.textContent ?? '') : undefined
}

/**
 * The header cell naming the `<td>` a control sits in: an explicit `headers`
 * attribute first, then the row's own `<th>`, then the `<th>` at the same
 * column index in the table's first row.
 *
 * Deliberately only for elements INSIDE a cell, never for a cell itself —
 * naming every `<td>` after its column header would give a whole column
 * identical names and turn every query in that column into a tie.
 */
function headerOf(el: Element, doc: Document): string | undefined {
    const tag = el.tagName
    if (tag === 'TD' || tag === 'TH') return undefined

    const cell = el.closest('td')
    if (!cell) return undefined

    const headers = cell.getAttribute('headers')
    if (headers) {
        const text = headers
            .split(/\s+/)
            .map((id) => doc.getElementById(id)?.textContent ?? '')
            .join(' ')
        const shortened = shorten(text)
        if (shortened) return shortened
    }

    const row = cell.parentElement
    if (!row) return undefined

    const rowHeader = Array.from(row.children).find((c) => c.tagName === 'TH')
    if (rowHeader) {
        const text = shorten(rowHeader.textContent ?? '')
        if (text) return text
    }

    const index = Array.from(row.children).indexOf(cell)
    const table = cell.closest('table')
    const headRow = table?.querySelector('thead tr') ?? table?.querySelector('tr')
    const columnHeader = headRow?.children[index]
    if (columnHeader && columnHeader.tagName === 'TH') {
        return shorten(columnHeader.textContent ?? '')
    }
    return undefined
}

/** `label[for]` (via the prebuilt index) -> wrapping `<label>` -> resolved `aria-labelledby` -> `<dt>` -> table header, first hit wins. */
function labelOf(el: Element, doc: Document, labelIndex: Map<string, string>): string | undefined {
    const id = el.getAttribute('id')
    if (id) {
        const byFor = labelIndex.get(id)
        if (byFor) return byFor
    }
    // `closest()` matches the element itself, so a <label> would otherwise take
    // its own text as its label source and tie (at the top `label` weight) with
    // the control it labels — leaving `find email` liable to resolve onto inert
    // label text instead of the input. A label describes its control, never
    // itself, so search starts above it.
    const wrapping = el.tagName === 'LABEL' ? el.parentElement?.closest('label') : el.closest('label')
    if (wrapping) {
        const text = shorten(wrapping.textContent ?? '')
        if (text) return text
    }
    const labelledby = el.getAttribute('aria-labelledby')
    if (labelledby) {
        const text = labelledby
            .split(/\s+/)
            .map((refId) => doc.getElementById(refId)?.textContent ?? '')
            .join(' ')
        const shortened = shorten(text)
        if (shortened) return shortened
    }
    return termOf(el) ?? headerOf(el, doc)
}

// ---------- proximate naming ----------

// How far the search for a de-facto label may wander. Both are deliberately
// tiny: this runs per unnamed control on a cached path the ghost overlay hits
// every keystroke, and a wider net stops being "the text next to it" anyway.
const PROXIMATE_LEVELS = 3
const PROXIMATE_SIBLINGS = 4
const PROXIMATE_TEXT_MAX = 60

/** Elements that are controls in their own right — never a caption for another control. */
const CONTROL_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'OPTION'])

/** The sources that constitute a stated name; a candidate with none of them is a naming candidate for `proximate`. */
const NAMING_SOURCES: readonly Source[] = ['label', 'aria', 'text', 'placeholder', 'title', 'alt']

const hasStatedName = (sources: Partial<Record<Source, string>>): boolean =>
    NAMING_SOURCES.some((s) => sources[s] !== undefined)

/** Text belonging to `el` itself and its non-control descendants, if it reads like a label. */
function captionText(el: Element): string | undefined {
    if (CONTROL_TAGS.has(el.tagName)) return undefined
    if (el.querySelector('input, select, textarea, button')) return undefined
    const text = collapse(el.textContent ?? '')
    if (!text || text.length > PROXIMATE_TEXT_MAX) return undefined
    return text
}

/** Only the direct child text nodes of `el` — what makes `<div>Email <input></div>` work. */
function ownText(el: Element): string | undefined {
    let out = ''
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) out += node.textContent ?? ''
    }
    const text = collapse(out)
    return text && text.length <= PROXIMATE_TEXT_MAX ? text : undefined
}

type Proximate = { text: string; provider: Element }

function scanSiblings(from: Element, direction: 'prev' | 'next'): Proximate | undefined {
    let sibling = direction === 'prev' ? from.previousElementSibling : from.nextElementSibling
    for (let i = 0; i < PROXIMATE_SIBLINGS && sibling; i++) {
        const text = captionText(sibling)
        if (text) return { text, provider: sibling }
        sibling = direction === 'prev' ? sibling.previousElementSibling : sibling.nextElementSibling
    }
    return undefined
}

/**
 * The text that visually labels `el` despite no DOM association to it.
 *
 * Walks up at most `PROXIMATE_LEVELS`, and at each level looks first at the
 * preceding siblings (labels overwhelmingly precede their control) and then at
 * the parent's own direct text. Checkboxes and radios invert that: their label
 * conventionally follows, so they are scanned forwards first.
 *
 * Distance is measured by walking the tree, never by geometry — `--near`
 * already covers the visual axis, and these two fail in opposite directions:
 * this one survives CSS that moves things around, `--near` survives markup
 * that puts the label far from its control.
 */
function proximateName(el: Element, role: Role): Proximate | undefined {
    const labelFollows = role === 'checkbox' || role === 'radio'
    if (labelFollows) {
        const after = scanSiblings(el, 'next')
        if (after) return after
    }

    let node: Element = el
    for (let level = 0; level < PROXIMATE_LEVELS; level++) {
        const before = scanSiblings(node, 'prev')
        if (before) return before

        const parent = node.parentElement
        if (!parent) break

        const direct = ownText(parent)
        if (direct) return { text: direct, provider: parent }

        node = parent
    }

    return labelFollows ? undefined : scanSiblings(el, 'next')
}

function collectSources(
    el: Element,
    tag: string,
    type: string | undefined,
    doc: Document,
    labelIndex: Map<string, string>
): Partial<Record<Source, string>> {
    const sources: Partial<Record<Source, string>> = {}

    const label = labelOf(el, doc, labelIndex)
    if (label) sources.label = label

    const aria = el.getAttribute('aria-label')
    if (aria) sources.aria = collapse(aria)

    const text = textOf(el, tag, type)
    if (text) sources.text = text

    const placeholder = el.getAttribute('placeholder')
    if (placeholder) sources.placeholder = placeholder

    const value = valueOf(el, tag)
    if (value) sources.value = value

    const title = el.getAttribute('title')
    if (title) sources.title = title

    const alt = el.getAttribute('alt')
    if (alt) sources.alt = alt

    const testid = el.getAttribute('data-testid')
    if (testid) sources.testid = testid

    return sources
}

/**
 * Explicit `role` attr still wins (inferRole checks it first); otherwise a
 * live-editable region reads as a textbox before falling through to
 * inferRole's tag-based table — roles.ts documents this element-level case
 * as handled here rather than in its own (purely tag/type/role) signature.
 */
function roleOf(el: Element, tag: string, type: string | undefined): Role {
    const roleAttr = el.getAttribute('role') ?? undefined
    if (!roleAttr && el.getAttribute('contenteditable') === 'true') return 'textbox'
    return inferRole(tag, type, roleAttr)
}

function toRect(el: Element): Rect {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/**
 * Walk the document for candidate elements, skip the REPL's own UI, cap at
 * ~1500, and turn each survivor into a pure `Candidate` carrying a stable
 * registry ref (via `registry.storeElements`, so repeated finds reuse the
 * same ref for the same live element). Results are cached 300ms per app id
 * and shared by find's `fn` and its `complete()` hook (constraint 3).
 */
export function extractCandidates(appId: string): Candidate[] {
    const doc = requireDocument()

    const now = Date.now()
    const cached = cache.get(appId)
    // A cache hit must also still be TRUE. On a hit neither storeElements nor
    // pruneDisconnected runs, so a row whose element left the document in the
    // meantime keeps scoring normally off its frozen visible/rect copy, and the
    // caller then resolves a ref that no longer exists. Since one input line can
    // run several tasks back-to-back (core/program.ts splits on newlines), a
    // `click` whose handler re-renders followed by a `find` lands well inside the
    // 300ms TTL. `isConnected` is a cheap property read; re-extracting is what
    // costs, and that is exactly what a stale entry should force.
    if (cached && now - cached.at < CACHE_TTL_MS && cached.els.every((el) => el.isConnected)) {
        return cached.rows
    }

    const win = doc.defaultView ?? window
    const matched = Array.from(doc.querySelectorAll(SELECTOR))
        .filter((el) => !el.closest(SKIP_SELECTOR))
        .slice(0, MAX_CANDIDATES)

    const refs = storeElements(appId, matched)
    const labelIndex = buildLabelIndex(doc)

    const rows: Candidate[] = matched.map((el, order) => {
        const tag = el.tagName.toLowerCase()
        const type = elementType(el, tag)
        const sources = collectSources(el, tag, type, doc, labelIndex)

        // every element in `matched` was just passed to storeElements above,
        // so it is guaranteed a ref
        const ref = refs.get(el) as string

        const candidate: Candidate = {
            ref,
            tag,
            role: roleOf(el, tag, type),
            sources,
            visible: isVisible(el, win),
            disabled: isDisabled(el),
            rect: toRect(el),
            order
        }
        if (sources.testid !== undefined) candidate.testid = sources.testid
        if (sources.text !== undefined) candidate.text = sources.text
        return candidate
    })

    // Second pass: name what the markup left nameless, from the text beside it.
    // Split from the first pass because a provider's `caption` flag can only be
    // set once every candidate's stated sources are known.
    const captions = new Set<Element>()
    rows.forEach((candidate, i) => {
        if (hasStatedName(candidate.sources)) return
        const found = proximateName(matched[i], candidate.role)
        if (!found) return
        candidate.sources.proximate = found.text
        captions.add(found.provider)
    })
    rows.forEach((candidate, i) => {
        if (captions.has(matched[i])) candidate.caption = true
    })

    cache.set(appId, { at: now, rows, els: matched })
    return rows
}
