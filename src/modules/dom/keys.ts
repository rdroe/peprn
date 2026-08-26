// KeyboardEvent-shaped parsing for `press` (act verb, later phase) and its
// `Control+Shift+a` key-spec syntax. Pure string parsing only.

export interface KeySpec {
    /** KeyboardEvent.key, e.g. 'a', 'Enter' */
    key: string
    /** KeyboardEvent.code, e.g. 'KeyA', 'Enter' */
    code: string
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    metaKey: boolean
}

const MODIFIER_ALIASES: Record<string, keyof Omit<KeySpec, 'key' | 'code'>> = {
    control: 'ctrlKey',
    ctrl: 'ctrlKey',
    shift: 'shiftKey',
    alt: 'altKey',
    option: 'altKey',
    meta: 'metaKey',
    cmd: 'metaKey',
    command: 'metaKey'
}

/** named (non-letter, non-digit) keys → their `KeyboardEvent.code` */
export const keyToCode: Record<string, string> = {
    Enter: 'Enter',
    Tab: 'Tab',
    Escape: 'Escape',
    Esc: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ' ': 'Space',
    Space: 'Space',
    F1: 'F1',
    F2: 'F2',
    F3: 'F3',
    F4: 'F4',
    F5: 'F5',
    F6: 'F6',
    F7: 'F7',
    F8: 'F8',
    F9: 'F9',
    F10: 'F10',
    F11: 'F11',
    F12: 'F12'
}

/** exported for `actions.ts`'s per-character `type` sequence, which needs the same key -> `KeyboardEvent.code` guess for literal typed characters (not just named keys) */
export const codeFor = (key: string): string => {
    if (keyToCode[key] !== undefined) return keyToCode[key]
    if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`
    if (/^[0-9]$/.test(key)) return `Digit${key}`
    return key
}

/** a single character is printable; named keys ('Enter', 'Tab', …) are not */
export const isPrintable = (key: string): boolean => key.length === 1

/**
 * Spec spellings that are NOT what a real `KeyboardEvent.key` carries. The
 * `code` side is handled by `keyToCode`; without this map `press Space` would
 * dispatch `key: 'Space'` and `press Esc` would dispatch `key: 'Esc'`, neither
 * of which any real event uses — so a handler branching on `e.key === ' '` or
 * `e.key === 'Escape'` silently ignores the press.
 */
const KEY_ALIASES: Record<string, string> = {
    Space: ' ',
    Esc: 'Escape'
}

/**
 * Parse a `press`-style key spec: `+`-joined modifier names followed by the
 * key itself, e.g. `'Control+Shift+a'`, `'Enter'`, `'ArrowDown'`. Unknown
 * modifier tokens are ignored rather than rejected — a typo in a modifier
 * name degrades to "just press the key", not a throw.
 *
 * `+` is both the separator and a legitimate key, so a spec ending in `+`
 * (`'+'`, `'Control++'`) means that trailing `+` IS the key. Dropping empty
 * segments instead would silently turn `Control++` into a bare `Control`.
 * A spec that is only whitespace means the space bar.
 */
export const parseKeySpec = (spec: string): KeySpec => {
    const result: KeySpec = { key: '', code: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

    const raw = spec.split('+')
    const trailingPlus = raw.length > 1 && raw[raw.length - 1] === ''

    let keyPart: string
    if (trailingPlus) {
        keyPart = '+'
    } else {
        const rawKey = raw[raw.length - 1]
        // whitespace-only but non-empty means the space bar, which `.trim()` would erase
        keyPart = rawKey.trim() === '' && rawKey.length > 0 ? ' ' : rawKey.trim()
    }

    const modifierParts = raw.slice(0, -1)
    for (const part of modifierParts) {
        const modifier = MODIFIER_ALIASES[part.trim().toLowerCase()]
        if (modifier) result[modifier] = true
    }

    if (keyPart === '') return result

    result.key = KEY_ALIASES[keyPart] ?? keyPart
    result.code = codeFor(keyPart)
    return result
}
