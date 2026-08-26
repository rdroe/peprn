import type { AppHandle, CompletionItem } from '../core/types.js'

/**
 * Pure lookup: find the first completion item that is a live ghost candidate
 * for `text` at `cursor` — i.e. it replaces exactly up to the cursor and the
 * text already typed for it is a PROPER prefix of its full value.
 */
export function ghostRemainder(
    items: CompletionItem[],
    text: string,
    cursor: number,
): { item: CompletionItem; remainder: string } | null {
    if (cursor !== text.length) return null
    for (const item of items) {
        if (item.replaceTo !== cursor) continue
        const typed = text.slice(item.replaceFrom)
        if (typed.length >= item.value.length) continue
        if (!item.value.startsWith(typed)) continue
        return { item, remainder: item.value.slice(cursor - item.replaceFrom) }
    }
    return null
}

interface GhostState {
    items: CompletionItem[]
    cycle: number
    hidden: boolean
}

const MIRROR_STYLE_PROPS: readonly string[] = [
    'boxSizing',
    'width',
    'height',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'wordSpacing',
    'textIndent',
    'textAlign',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
    'whiteSpace',
    'wordWrap',
    'overflowWrap',
]

/**
 * Attaches a ghost-text (inline type-ahead) overlay to `input`, driven by
 * `app.complete`. Returns a detach function that removes the mirror element
 * and all listeners.
 */
export function attachGhost(app: AppHandle, input: HTMLTextAreaElement): () => void {
    const doc = input.ownerDocument
    const win = doc.defaultView ?? window

    const mirror = doc.createElement('pre')
    mirror.className = 'peprn-ghost'
    mirror.style.position = 'absolute'
    mirror.style.margin = '0'
    mirror.style.pointerEvents = 'none'
    mirror.style.overflow = 'hidden'
    mirror.style.color = 'transparent'
    mirror.style.background = 'transparent'
    mirror.style.zIndex = '1'

    const parent = input.parentNode
    if (parent) parent.insertBefore(mirror, input)

    let state: GhostState | null = null
    let escaped = false
    let rafHandle: number | null = null
    let token = 0

    const position = (): void => {
        const cs = win.getComputedStyle(input)
        for (const prop of MIRROR_STYLE_PROPS) {
            const value = cs.getPropertyValue(cssPropName(prop))
            if (value) mirror.style.setProperty(cssPropName(prop), value)
        }
        mirror.style.left = `${input.offsetLeft}px`
        mirror.style.top = `${input.offsetTop}px`
        mirror.style.width = `${input.offsetWidth}px`
        mirror.style.height = `${input.offsetHeight}px`
    }

    const cssPropName = (camel: string): string =>
        camel.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

    const render = (): void => {
        const value = input.value
        mirror.textContent = ''
        const typedNode = doc.createTextNode(value)
        mirror.appendChild(typedNode)

        if (escaped || !state) return

        const at = ghostRemainder(state.items, value, input.selectionStart ?? value.length)
        if (!at) return

        const hint = doc.createElement('span')
        hint.className = 'peprn-ghost-hint'
        hint.textContent = at.remainder
        mirror.appendChild(hint)
    }

    const atCaretEnd = (): boolean => {
        const value = input.value
        const pos = input.selectionStart
        if (pos === null || pos !== input.selectionEnd) return false
        return pos === value.length
    }

    const currentGhost = (): { item: CompletionItem; remainder: string } | null => {
        if (!state || escaped) return null
        if (!atCaretEnd()) return null
        return ghostRemainder(state.items, input.value, input.selectionStart ?? input.value.length)
    }

    const refresh = (): void => {
        if (rafHandle !== null) win.cancelAnimationFrame(rafHandle)
        rafHandle = win.requestAnimationFrame(() => {
            rafHandle = null
            void update()
        })
    }

    const update = async (): Promise<void> => {
        const myToken = ++token
        if (!atCaretEnd()) {
            state = null
            render()
            return
        }
        const value = input.value
        const cursor = input.selectionStart ?? value.length
        let items: CompletionItem[]
        try {
            const result = await app.complete(value, cursor)
            items = result.items
        } catch {
            items = []
        }
        if (myToken !== token) return
        state = { items, cycle: 0, hidden: false }
        render()
    }

    const cycle = (): void => {
        if (!state) return
        const value = input.value
        const cursor = input.selectionStart ?? value.length
        const candidates = state.items.filter((item) => {
            if (item.replaceTo !== cursor) return false
            const typed = value.slice(item.replaceFrom)
            return typed.length < item.value.length && item.value.startsWith(typed)
        })
        if (candidates.length === 0) return
        state.cycle = (state.cycle + 1) % candidates.length
        const picked = candidates[state.cycle]
        if (!picked) return
        const idx = state.items.indexOf(picked)
        // Rotate the picked candidate to the front so ghostRemainder finds it first.
        state.items = [picked, ...state.items.filter((_, i) => i !== idx)]
        escaped = false
        render()
    }

    const accept = (): void => {
        const at = currentGhost()
        if (!at) return
        const value = input.value
        const newValue = value.slice(0, at.item.replaceFrom) + at.item.value
        input.value = newValue
        input.selectionStart = newValue.length
        input.selectionEnd = newValue.length
        state = null
        escaped = false
        render()
    }

    const onKeydown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Tab') {
            ev.preventDefault()
            if (ev.shiftKey) {
                cycle()
                return
            }
            if (currentGhost()) accept()
            return
        }
        if (ev.key === 'ArrowRight') {
            if (atCaretEnd() && currentGhost()) {
                ev.preventDefault()
                accept()
            }
            return
        }
        if (ev.key === 'Escape') {
            escaped = true
            render()
            return
        }
        if (ev.key === 'Enter') {
            state = null
            escaped = false
            render()
            return
        }
    }

    const onInput = (): void => {
        escaped = false
        position()
        refresh()
    }

    const onClick = (): void => {
        position()
        refresh()
    }

    const onFocus = (): void => {
        position()
        refresh()
    }

    const onResize = (): void => {
        position()
    }

    input.addEventListener('input', onInput)
    input.addEventListener('click', onClick)
    input.addEventListener('focus', onFocus)
    input.addEventListener('keydown', onKeydown)
    win.addEventListener('resize', onResize)

    position()
    render()

    return () => {
        token++
        if (rafHandle !== null) win.cancelAnimationFrame(rafHandle)
        input.removeEventListener('input', onInput)
        input.removeEventListener('click', onClick)
        input.removeEventListener('focus', onFocus)
        input.removeEventListener('keydown', onKeydown)
        win.removeEventListener('resize', onResize)
        mirror.remove()
    }
}
