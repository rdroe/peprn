import { overlayBoxes, type OverlayInput } from './geometry.js'
import { requireDocument } from './extract.js'
import { getState } from './registry.js'

// Impure applier for the "point at it" overlay (PLAN-dom.md "Overlay").
// geometry.ts computes the pure box math; this file turns it into styled DOM
// nodes, re-measuring each target's rect live on every render (from the
// Element itself, not a rect captured earlier) so the boxes track scroll and
// resize instead of going stale. Smoke-verified only, per constraint 5 — no
// unit tests here. `createOverlay`/`getOrCreateOverlay` are the only two
// exports that touch `document`/`window`, and both funnel through
// `requireDocument()` (constraint 4); every other export just calls those or
// operates on an already-built `OverlayHandle`.

const STYLE_ID = 'peprn-dom-style'
const LAYER_CLASS = 'peprn-dom-layer'
const TTL_POINT_MS = 8000
const TTL_FLASH_MS = 1200

const OVERLAY_CSS = `
.peprn-dom-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483646;
}
.peprn-dom-point {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid rgba(120, 120, 120, 0.65);
    border-radius: 4px;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08);
}
.peprn-dom-point-top {
    border-color: #2f6fed;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.25), 0 2px 8px rgba(47, 111, 237, 0.35);
}
.peprn-dom-point.peprn-dom-flash {
    animation: peprn-dom-pulse 1.2s ease-out;
}
.peprn-dom-badge {
    position: absolute;
    min-width: 18px;
    height: 18px;
    box-sizing: border-box;
    padding: 0 4px;
    border-radius: 9px;
    background: #2f6fed;
    color: #fff;
    font: 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
@keyframes peprn-dom-pulse {
    0% { box-shadow: 0 0 0 0 rgba(47, 111, 237, 0.6); }
    70% { box-shadow: 0 0 0 10px rgba(47, 111, 237, 0); }
    100% { box-shadow: 0 0 0 0 rgba(47, 111, 237, 0); }
}
`.trim()

/** One live element to point at; `nth` drives the badge label and which entry gets the accented "top match" styling. */
export interface OverlayTarget {
    ref: string
    nth: number
    el: Element
}

export interface OverlayHandle {
    /** Point at several ranked matches (find); resets the 8s TTL. */
    point(targets: OverlayTarget[]): void
    /** Point at exactly one element with the `.peprn-dom-flash` pulse (act verbs); 1.2s TTL. */
    flash(target: Omit<OverlayTarget, 'nth'>): void
    /** `find --clear`, or anything else that wants the overlay gone right now. */
    clear(): void
    /**
     * Tear down listeners/timers/DOM. Nothing currently calls this — modules
     * have no dispose hook (PLAN-dom.md's registry section notes the same
     * bounded leak for `els`) — but it's here so a future caller, or a smoke
     * test harness resetting between runs, has a clean way to do it.
     */
    dispose(): void
}

function ensureStyle(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = OVERLAY_CSS
    doc.head.appendChild(style)
}

const measure = (target: OverlayTarget): OverlayInput => {
    const r = target.el.getBoundingClientRect()
    return { ref: target.ref, nth: target.nth, rect: { x: r.x, y: r.y, width: r.width, height: r.height } }
}

/** Build a fresh overlay layer + stylesheet, bound to the current document. */
export function createOverlay(): OverlayHandle {
    const doc = requireDocument()
    const win = doc.defaultView ?? window
    ensureStyle(doc)

    const layer = doc.createElement('div')
    layer.className = LAYER_CLASS
    doc.body.appendChild(layer)

    let current: OverlayTarget[] = []
    let flashing = false
    let ttlTimer: number | null = null
    let rafHandle: number | null = null

    const clearTtl = (): void => {
        if (ttlTimer !== null) {
            win.clearTimeout(ttlTimer)
            ttlTimer = null
        }
    }

    const render = (): void => {
        layer.replaceChildren()
        if (current.length === 0) return

        const viewport = { width: win.innerWidth, height: win.innerHeight }
        const boxes = overlayBoxes(current.map(measure), viewport)

        for (const box of boxes) {
            const point = doc.createElement('div')
            point.className = box.nth === 1 ? 'peprn-dom-point peprn-dom-point-top' : 'peprn-dom-point'
            if (flashing) point.classList.add('peprn-dom-flash')
            point.style.left = `${box.outline.x}px`
            point.style.top = `${box.outline.y}px`
            point.style.width = `${box.outline.width}px`
            point.style.height = `${box.outline.height}px`
            layer.appendChild(point)

            const badge = doc.createElement('div')
            badge.className = 'peprn-dom-badge'
            badge.style.left = `${box.badge.x}px`
            badge.style.top = `${box.badge.y}px`
            badge.textContent = String(box.nth)
            layer.appendChild(badge)
        }
    }

    const scheduleRender = (): void => {
        if (rafHandle !== null) return
        rafHandle = win.requestAnimationFrame(() => {
            rafHandle = null
            render()
        })
    }

    const onReposition = (): void => scheduleRender()
    win.addEventListener('resize', onReposition)
    win.addEventListener('scroll', onReposition, true)

    /** Shared by `point`/`flash`: sets the target set, scrolls the top match into view, re-renders after one rAF (so post-scroll rects are used), and (re)starts the TTL. */
    const pointAt = (targets: OverlayTarget[], ttlMs: number, flash: boolean): void => {
        current = targets
        flashing = flash
        clearTtl()

        const top = targets.find((t) => t.nth === 1) ?? targets[0]
        if (top) {
            top.el.scrollIntoView({ block: 'center' })
            if (rafHandle !== null) win.cancelAnimationFrame(rafHandle)
            rafHandle = win.requestAnimationFrame(() => {
                rafHandle = null
                render()
            })
        } else {
            render()
        }

        ttlTimer = win.setTimeout(() => {
            current = []
            render()
        }, ttlMs)
    }

    return {
        point(targets) {
            pointAt(targets, TTL_POINT_MS, false)
        },
        flash(target) {
            pointAt([{ ...target, nth: 1 }], TTL_FLASH_MS, true)
        },
        clear() {
            current = []
            clearTtl()
            render()
        },
        dispose() {
            clearTtl()
            if (rafHandle !== null) win.cancelAnimationFrame(rafHandle)
            win.removeEventListener('resize', onReposition)
            win.removeEventListener('scroll', onReposition, true)
            layer.remove()
        }
    }
}

/** Get (lazily creating) the one overlay instance for `appId`, cached on its registry state. */
export function getOrCreateOverlay(appId: string): OverlayHandle {
    const state = getState(appId)
    if (state.overlay) return state.overlay as OverlayHandle
    const handle = createOverlay()
    state.overlay = handle
    return handle
}

/** `find --clear`: hide the overlay for `appId` if one has ever been created; a no-op otherwise. */
export function clearOverlay(appId: string): void {
    const state = getState(appId)
    if (state.overlay) (state.overlay as OverlayHandle).clear()
}
