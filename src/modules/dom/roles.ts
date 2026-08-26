import { ROLES, type Role } from './types.js'

// Role inference (PLAN-dom.md, "Ranking" role-inference prose). Explicit
// `role` wins; otherwise the mapping is driven by tag + the DOM `type`
// property — including the two real-browser quirks this leans on:
// `<select>.type` is natively 'select-one' or 'select-multiple' depending on
// `multiple`, so the select→combobox / multiple→listbox split needs no extra
// parameter, and a plain `<input>`'s type defaults to 'text' when absent.

const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image'])

// input types that are NOT a textbox; anything else (including the
// pragmatic type=number/email/search/… cases, noted in find's help) falls
// through to textbox.
const NON_TEXTBOX_INPUT_TYPES = new Set([
    'checkbox',
    'radio',
    'button',
    'submit',
    'reset',
    'range',
    'color',
    'file',
    'hidden',
    'image'
])

const ROLE_SET: ReadonlySet<string> = new Set(ROLES)

/**
 * Infer an element's `Role` from its tag name, its DOM `.type` (where
 * applicable — `input.type`, or `select.type`'s 'select-one'/'select-multiple'),
 * and an explicit `role` attribute if present.
 *
 * Note: `<a>` is only ever passed in for `a[href]` elements — extract.ts's
 * selector union only extracts anchors that have an href — so `tag === 'a'`
 * maps to `link` unconditionally here. Likewise `[contenteditable="true"]`
 * elements are handled by extract.ts before role inference; this function's
 * signature is deliberately just tag/type/role per the plan.
 */
export const inferRole = (tag: string, typeAttr?: string, roleAttr?: string): Role => {
    if (roleAttr) {
        const explicit = roleAttr.toLowerCase()
        if (ROLE_SET.has(explicit)) return explicit as Role
    }

    const t = tag.toLowerCase()
    const type = (typeAttr ?? '').toLowerCase()

    if (t === 'button') return 'button'
    if (t === 'input' && BUTTON_INPUT_TYPES.has(type)) return 'button'
    if (t === 'a') return 'link'
    if (t === 'textarea') return 'textbox'
    if (t === 'input' && type === 'checkbox') return 'checkbox'
    if (t === 'input' && type === 'radio') return 'radio'
    if (t === 'input' && type === 'range') return 'slider'
    if (t === 'input' && !NON_TEXTBOX_INPUT_TYPES.has(type)) return 'textbox'
    if (t === 'select') return type === 'select-multiple' ? 'listbox' : 'combobox'
    if (t === 'option') return 'option'
    if (/^h[1-6]$/.test(t)) return 'heading'
    if (t === 'img') return 'img'

    return 'generic'
}
