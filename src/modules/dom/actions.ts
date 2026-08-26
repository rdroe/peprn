import { dice, normalize } from './fuzzy.js'
import { inferRole } from './roles.js'
import { codeFor, isPrintable, type KeySpec } from './keys.js'
import { getState } from './registry.js'

// Act verbs, event layer (PLAN-dom.md "### Act verbs (user-event-grade
// sequences, actions.ts)"). This file dispatches the actual synthetic-event
// sequences and owns the React-controlled-input native-setter technique;
// act.ts's ten Modules are thin wrappers around these functions
// (resolveTarget -> actions -> rows). Nothing here calls `requireDocument()`
// itself (constraint 4) — every export is only ever reached from an act-verb
// `fn`, which guards first (find.ts's pattern) — but nothing at module scope
// touches `document`/`window` either, so importing this file in node is
// still safe on its own. Smoke-verified only, per constraint 5.

/** One act verb's result row (PLAN-dom.md "Universal return-shape rule" — Act rows). Defined here, not types.ts, since types.ts's file responsibility is fixed to Candidate/MatchRow/SubRow/EventRow/RankSpec/Source/ROLES. */
export interface ActRow {
    ref: string
    did: string
    value?: string
    changed?: boolean
}

const BASE_INIT = { bubbles: true, cancelable: true, composed: true }

/**
 * The four enter/leave types are constructed `bubbles: false, cancelable:
 * false` by real browsers, and `dispatchEvent` honours whatever the init dict
 * says — so spreading `BASE_INIT` into them would make a child's `mouseleave`
 * propagate to every ancestor with a directly-bound leave handler, something
 * that never happens with a real pointer. Moving between two items of a menu
 * would fire the menu's own `mouseleave` and close it.
 */
const ENTER_LEAVE_INIT = { bubbles: false, cancelable: false, composed: true }
const ENTER_LEAVE_TYPES = new Set(['pointerenter', 'pointerleave', 'mouseenter', 'mouseleave'])

const initFor = (type: string): { bubbles: boolean; cancelable: boolean; composed: boolean } =>
    ENTER_LEAVE_TYPES.has(type) ? ENTER_LEAVE_INIT : BASE_INIT

interface Coords { x: number; y: number }

const centerOf = (el: Element): Coords => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
}

/**
 * `PointerEvent` where the constructor exists, else `MouseEvent` (plan's
 * blanket rule for pointer-type events). `pointerType: 'mouse'` is not
 * optional dressing: the constructor defaults it to `''`, and libraries that
 * positively test for mouse to enable a path (Radix's `whenMouse`, drag
 * sensors branching on `pointerType`) then skip the branch real hardware
 * would take.
 */
const firePointerEvent = (el: Element, type: string, coords: Coords, extra: PointerEventInit = {}): void => {
    const init: PointerEventInit = {
        ...initFor(type),
        clientX: coords.x,
        clientY: coords.y,
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        ...extra
    }
    const Ctor: typeof PointerEvent | typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent
    el.dispatchEvent(new Ctor(type, init))
}

const fireMouseEvent = (el: Element, type: string, coords: Coords, extra: MouseEventInit = {}): void => {
    const init: MouseEventInit = { ...initFor(type), clientX: coords.x, clientY: coords.y, button: 0, buttons: 0, detail: 1, ...extra }
    el.dispatchEvent(new MouseEvent(type, init))
}

/** `pointerover, pointerenter, mouseover, mouseenter, pointermove, mousemove` — shared by `click` and `hover`. */
const fireEnterSequence = (el: Element): void => {
    const coords = centerOf(el)
    firePointerEvent(el, 'pointerover', coords)
    firePointerEvent(el, 'pointerenter', coords)
    fireMouseEvent(el, 'mouseover', coords)
    fireMouseEvent(el, 'mouseenter', coords)
    firePointerEvent(el, 'pointermove', coords)
    fireMouseEvent(el, 'mousemove', coords)
}

/** the reverse of `fireEnterSequence`, dispatched on the previously-hovered element when the pointer moves to a new one. */
const fireLeaveSequence = (el: Element): void => {
    const coords = centerOf(el)
    firePointerEvent(el, 'pointerout', coords)
    firePointerEvent(el, 'pointerleave', coords)
    fireMouseEvent(el, 'mouseout', coords)
    fireMouseEvent(el, 'mouseleave', coords)
}

const isFocusable = (el: Element): boolean => el instanceof HTMLElement && el.tabIndex >= 0

/** leaves `lastHover` alone if it's already `el`, or if the old one has since left the document. */
const leaveOldHover = (appId: string, el: Element): void => {
    const state = getState(appId)
    if (state.lastHover && state.lastHover !== el && state.lastHover.isConnected) {
        fireLeaveSequence(state.lastHover)
    }
}

// ---------- native setters (the React-controlled-input technique) ----------

/** The value-bearing prototype for `el`'s tag, per PLAN-dom.md's `nativeSetValue` spec — `HTMLInputElement` / `HTMLTextAreaElement` / `HTMLSelectElement`, exactly. */
const valuePrototypeFor = (tag: string): { prototype: object } | null => {
    if (tag === 'input') return HTMLInputElement
    if (tag === 'textarea') return HTMLTextAreaElement
    if (tag === 'select') return HTMLSelectElement
    return null
}

/**
 * `nativeSetValue(el, v)` — the React-controlled-input technique: call the
 * native prototype's `value` setter directly (`Object.getOwnPropertyDescriptor`
 * + `.set.call`), bypassing any subclass `value` setter React has installed
 * on the instance to intercept plain assignment. This is what makes a
 * subsequent `input` event actually register with React's synthetic-event
 * system instead of being swallowed as a no-op controlled-value write.
 */
export function nativeSetValue(el: Element, v: string): void {
    const tag = el.tagName.toLowerCase()
    const proto = valuePrototypeFor(tag)?.prototype ?? Object.getPrototypeOf(el)
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (desc?.set) {
        desc.set.call(el, v)
    } else {
        ;(el as unknown as { value: string }).value = v
    }
}

/** Same technique for `checked`, always via `HTMLInputElement.prototype` (checkboxes/radios are the only checked-bearing elements this module acts on). */
export function nativeSetChecked(el: Element, v: boolean): void {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')
    if (desc?.set) {
        desc.set.call(el, v)
    } else {
        ;(el as unknown as { checked: boolean }).checked = v
    }
}

const isContentEditable = (el: Element): boolean => el.getAttribute('contenteditable') === 'true'

/** contenteditable regions have no `.value` at all; `type`/`clear` read/write through `textContent` for those, and through `nativeSetValue` (the exported, spec-exact function) for everything else. */
const currentValue = (el: Element): string => (isContentEditable(el) ? (el.textContent ?? '') : ((el as HTMLInputElement).value ?? ''))
const setValue = (el: Element, v: string): void => {
    if (isContentEditable(el)) el.textContent = v
    else nativeSetValue(el, v)
}

const assertTextControl = (el: Element): void => {
    const tag = el.tagName.toLowerCase()
    const type = tag === 'input' ? (el as HTMLInputElement).type : undefined
    const isText = isContentEditable(el) || inferRole(tag, type) === 'textbox'
    if (!isText) throw new Error(`dom: <${tag}> is not a text control`)
}

/**
 * A text-like `<input>` specifically — NOT `<textarea>` and not a
 * checkbox/radio/file/range input. Only these carry HTML's implicit form
 * submission on Enter; see the carve-out in `performPress`.
 */
const isTextInput = (el: Element): boolean =>
    el.tagName.toLowerCase() === 'input' && inferRole('input', (el as HTMLInputElement).type) === 'textbox'

// ---------- click / dblclick ----------

/**
 * `click` (PLAN-dom.md): leave-sequence on the old `lastHover` if different,
 * then the full enter + down + focus + up + click sequence, recording `el`
 * as the new `lastHover`. Untrusted `click` still runs native activation
 * behavior (checkbox toggle, link navigation, form submission) — that's a
 * browser guarantee for the `click` event specifically, independent of
 * `isTrusted`.
 */
export function performClick(appId: string, el: Element): void {
    leaveOldHover(appId, el)
    fireEnterSequence(el)

    const coords = centerOf(el)
    firePointerEvent(el, 'pointerdown', coords, { button: 0, buttons: 1 })
    fireMouseEvent(el, 'mousedown', coords, { button: 0, buttons: 1, detail: 1 })

    if (isFocusable(el)) (el as HTMLElement).focus()

    firePointerEvent(el, 'pointerup', coords, { button: 0, buttons: 0 })
    fireMouseEvent(el, 'mouseup', coords, { button: 0, buttons: 0, detail: 1 })
    fireMouseEvent(el, 'click', coords, { button: 0, detail: 1 })

    getState(appId).lastHover = el
}

/** `dblclick`: a full `click` (detail:1), then a second down/up/click at `detail:2`, then `dblclick`. */
export function performDblClick(appId: string, el: Element): void {
    performClick(appId, el)

    const coords = centerOf(el)
    firePointerEvent(el, 'pointerdown', coords, { button: 0, buttons: 1 })
    fireMouseEvent(el, 'mousedown', coords, { button: 0, buttons: 1, detail: 2 })
    firePointerEvent(el, 'pointerup', coords, { button: 0, buttons: 0 })
    fireMouseEvent(el, 'mouseup', coords, { button: 0, buttons: 0, detail: 2 })
    fireMouseEvent(el, 'click', coords, { button: 0, detail: 2 })
    fireMouseEvent(el, 'dblclick', coords, { button: 0, detail: 2 })
}

// ---------- type / clear ----------

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One character: `keydown -> keypress (printable) -> beforeinput ->
 * nativeSetValue(el, valueAfter) -> input -> keyup`.
 *
 * `valueAfter` is the caller's running accumulation, NOT `currentValue(el) +
 * ch`. Reading the value back off the element loses everything typed so far
 * on any input with a value sanitization algorithm (number, date, time,
 * month, week, datetime-local): those setters coerce a string that isn't
 * valid *for the type* to `''`, so every intermediate prefix of a date is
 * discarded and the accumulator restarts from empty on each keystroke.
 * Accumulating outside the element means the final write is the complete
 * (and therefore valid) string, which sticks.
 */
function typeChar(el: Element, ch: string, valueAfter: string): void {
    const code = codeFor(ch)
    const keyInit = { ...BASE_INIT, key: ch, code }
    el.dispatchEvent(new KeyboardEvent('keydown', keyInit))
    if (isPrintable(ch)) el.dispatchEvent(new KeyboardEvent('keypress', keyInit))
    el.dispatchEvent(new InputEvent('beforeinput', { ...BASE_INIT, inputType: 'insertText', data: ch }))
    setValue(el, valueAfter)
    el.dispatchEvent(new InputEvent('input', { ...BASE_INIT, inputType: 'insertText', data: ch }))
    el.dispatchEvent(new KeyboardEvent('keyup', keyInit))
}

export interface TypeOptions {
    /** ms to wait between characters; omitted/0 = no delay (synchronous typing) */
    delayMs?: number
    /** fire `change` once at the end if the value changed; default true */
    fireChange?: boolean
}

export interface TypeResult {
    value: string
    changed: boolean
}

/**
 * `type <target> <text>`: focuses `el` via the full `click` sequence, then
 * dispatches `typeChar` per character (an array-from split, so astral
 * characters travel as one unit rather than a broken surrogate pair), then
 * fires `change` once at the end if the value actually changed (deliberate
 * fidelity deviation from user-event's blur-only timing, documented in the
 * plan: React is already served by the per-char `input` events; vanilla
 * `change` listeners need this nudge since nothing ever blurs).
 */
export async function performType(appId: string, el: Element, text: string, opts: TypeOptions = {}): Promise<TypeResult> {
    assertTextControl(el)
    performClick(appId, el)

    const before = currentValue(el)
    let intended = before
    for (const ch of Array.from(text)) {
        intended += ch
        typeChar(el, ch, intended)
        if (opts.delayMs) await delay(opts.delayMs)
    }

    const value = currentValue(el)
    const changed = value !== before
    if (changed && opts.fireChange !== false) {
        el.dispatchEvent(new Event('change', BASE_INIT))
    }
    return { value, changed }
}

/** `clear`: focus, `beforeinput (deleteContentBackward) -> nativeSetValue(el, '') -> input -> change`. */
export function performClear(el: Element): TypeResult {
    assertTextControl(el)
    if (isFocusable(el)) (el as HTMLElement).focus()

    const before = currentValue(el)
    el.dispatchEvent(new InputEvent('beforeinput', { ...BASE_INIT, inputType: 'deleteContentBackward' }))
    setValue(el, '')
    el.dispatchEvent(new InputEvent('input', { ...BASE_INIT, inputType: 'deleteContentBackward' }))
    el.dispatchEvent(new Event('change', BASE_INIT))

    return { value: currentValue(el), changed: currentValue(el) !== before }
}

// ---------- select ----------

export interface SelectOptions {
    /** match the option query against option *values* instead of visible text */
    byValue?: boolean
    /** pick the option at this 1-based index directly, skipping text/value matching */
    index?: number
    /** multi-select: append to the current selection via `option.selected = true` instead of replacing it */
    add?: boolean
}

export interface SelectResult {
    value: string
    text: string
    changed: boolean
}

/** exact text -> exact value -> substring -> Dice fuzzy over texts (PLAN-dom.md's `select` resolution order), or `--index`/`--value` short-circuits straight to a match. */
function resolveOption(select: HTMLSelectElement, query: string, opts: SelectOptions): HTMLOptionElement {
    const options = Array.from(select.options)

    if (opts.index !== undefined) {
        const opt = options[opts.index - 1]
        if (!opt) throw new Error(`dom: select has no option at index ${opts.index}`)
        return opt
    }

    if (opts.byValue) {
        const byValue = options.find((o) => o.value === query)
        if (byValue) return byValue
        throw new Error(`dom: no option with value "${query}"`)
    }

    const norm = normalize(query)
    const exactText = options.find((o) => normalize(o.text) === norm)
    if (exactText) return exactText

    const exactValue = options.find((o) => o.value === query)
    if (exactValue) return exactValue

    const substr = options.find((o) => normalize(o.text).includes(norm))
    if (substr) return substr

    let best: HTMLOptionElement | null = null
    let bestScore = 0
    for (const o of options) {
        const d = dice(norm, normalize(o.text))
        if (d > bestScore) {
            bestScore = d
            best = o
        }
    }
    if (best && bestScore >= 0.34) return best

    throw new Error(`dom: no option matching "${query}"`)
}

/**
 * `select <target> <option query>`: resolve the option per
 * `resolveOption`, apply it (`nativeSetValue`, or `option.selected = true`
 * for `--add` multi-select append — deliberately no synthetic option-popup
 * mouse events, a documented simplification), then `input` + `change`.
 */
export function performSelect(el: Element, query: string, opts: SelectOptions = {}): SelectResult {
    if (!(el instanceof HTMLSelectElement)) throw new Error('dom: select target is not a <select> element')

    const option = resolveOption(el, query, opts)
    const before = el.value
    const appending = opts.add === true && el.multiple

    // `el.value` reports only the FIRST selected option in tree order, so it
    // cannot detect an append of a later option — hence tracking the option's
    // own `selected` for that path instead of short-circuiting `changed` to
    // true, which reported a change even when the option was already selected.
    const selectedBefore = option.selected

    if (appending) {
        option.selected = true
    } else {
        nativeSetValue(el, option.value)
    }

    el.dispatchEvent(new Event('input', BASE_INIT))
    el.dispatchEvent(new Event('change', BASE_INIT))

    const changed = appending ? option.selected !== selectedBefore : el.value !== before
    return { value: option.value, text: option.text, changed }
}

// ---------- check / uncheck ----------

export interface CheckResult {
    checked: boolean
    changed: boolean
}

/**
 * `check` / `uncheck`: already in `desired` state -> no-op (`changed: false`);
 * else run the full click sequence (native activation toggles `checked` and
 * fires `input`/`change` on its own); if that somehow left it unchanged
 * (e.g. a `preventDefault`-ing handler), force it with `nativeSetChecked` +
 * `input` + `change`.
 */
export function performCheck(appId: string, el: Element, desired: boolean): CheckResult {
    if (!(el instanceof HTMLInputElement)) throw new Error('dom: check/uncheck target is not a checkbox or radio input')

    if (el.checked === desired) return { checked: el.checked, changed: false }

    performClick(appId, el)

    if (el.checked !== desired) {
        nativeSetChecked(el, desired)
        el.dispatchEvent(new Event('input', BASE_INIT))
        el.dispatchEvent(new Event('change', BASE_INIT))
    }

    return { checked: el.checked, changed: true }
}

// ---------- press ----------

/**
 * `press`: `keydown` (+ `keypress` if printable) -> `keyup`, `--repeat`
 * times, all carrying `spec`'s modifier flags. Untrusted keys run no default
 * browser action — the one deliberate convenience, mirroring user-event's
 * implicit submission: Enter on a text control inside a `<form>` calls
 * `form.requestSubmit()`.
 */
export function performPress(el: Element, spec: KeySpec, repeat = 1): void {
    const init = {
        ...BASE_INIT,
        key: spec.key,
        code: spec.code,
        ctrlKey: spec.ctrlKey,
        shiftKey: spec.shiftKey,
        altKey: spec.altKey,
        metaKey: spec.metaKey
    }

    let lastKeydownAccepted = true
    for (let i = 0; i < repeat; i++) {
        lastKeydownAccepted = el.dispatchEvent(new KeyboardEvent('keydown', init))
        if (isPrintable(spec.key)) el.dispatchEvent(new KeyboardEvent('keypress', init))
        el.dispatchEvent(new KeyboardEvent('keyup', init))
    }

    // Implicit submission, mirroring user-event — the one carve-out to "untrusted
    // keys run no default action". Deliberately narrow, because a submit that
    // isn't prevented navigates the host page and ends the REPL session:
    //  - `<textarea>` is excluded (Enter inserts a newline there in every real
    //    browser), as are non-text inputs like checkbox/radio/file;
    //  - a `preventDefault()`-ed keydown suppresses it, exactly as a real
    //    browser suppresses the default action it is cancelling.
    if (spec.key === 'Enter' && lastKeydownAccepted && isTextInput(el)) {
        const form = el instanceof HTMLElement ? el.closest('form') : null
        if (form) form.requestSubmit()
    }
}

// ---------- hover / focus ----------

/** `hover`: leave-sequence on `lastHover`, then the enter sequence on `el`; records `lastHover`. */
export function performHover(appId: string, el: Element): void {
    leaveOldHover(appId, el)
    fireEnterSequence(el)
    getState(appId).lastHover = el
}

/** `focus`: `el.focus()`, falling back to dispatching `focus` + `focusin` directly if that didn't actually move `document.activeElement` (e.g. the element isn't natively focusable). */
export function performFocus(el: Element): void {
    if (el instanceof HTMLElement) {
        el.focus()
        if (el.ownerDocument.activeElement === el) return
    }
    el.dispatchEvent(new FocusEvent('focus', BASE_INIT))
    el.dispatchEvent(new FocusEvent('focusin', BASE_INIT))
}
