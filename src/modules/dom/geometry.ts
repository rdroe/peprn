import type { Rect } from './types.js'

// Pure box math for the overlay ("point at it"). The impure applier
// (overlay.ts, later phase) turns these into styled DOM nodes; this file
// only computes numbers, so it's unit-testable without a document.

export interface Viewport {
    width: number
    height: number
}

export interface OverlayInput {
    ref: string
    /** 1-based rank position; drives the badge label */
    nth: number
    rect: Rect
}

export interface OverlayBox {
    ref: string
    nth: number
    /** the outline box, padded slightly around the element's rect */
    outline: Rect
    /** top-left position of the numbered badge chip, clamped into the viewport */
    badge: { x: number; y: number }
}

const OUTLINE_PAD = 2
const BADGE_SIZE = 18
const BADGE_MARGIN = 4

/**
 * Turn ranked rects into outline + badge boxes, clamping the badge so it
 * always stays fully inside the viewport even when the element's own rect
 * sits partly or fully offscreen (negative coordinates, or beyond
 * width/height).
 */
export const overlayBoxes = (inputs: OverlayInput[], viewport: Viewport): OverlayBox[] =>
    inputs.map(({ ref, nth, rect }) => {
        const outline: Rect = {
            x: rect.x - OUTLINE_PAD,
            y: rect.y - OUTLINE_PAD,
            width: rect.width + OUTLINE_PAD * 2,
            height: rect.height + OUTLINE_PAD * 2
        }

        const maxX = Math.max(0, viewport.width - BADGE_SIZE)
        const maxY = Math.max(0, viewport.height - BADGE_SIZE)
        const badge = {
            x: clamp(rect.x - BADGE_MARGIN, 0, maxX),
            y: clamp(rect.y - BADGE_MARGIN, 0, maxY)
        }

        return { ref, nth, outline, badge }
    })

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)
