import type { AppHandle, DataHandler, KeyEffect } from '../core/types.js'
import { isManPage } from '../core/types.js'
import { renderManHtml } from './man.js'

/**
 * Wires the default keyboard behavior onto `input`: Enter submits, Shift+Enter
 * inserts a newline, Alt+ArrowUp/Down walk history. Any `userKeyEffects` fire
 * (fire-and-forget) after the built-in handling on every keydown. Returns an
 * unbind function.
 */
export function bindDom(
    app: AppHandle,
    input: HTMLTextAreaElement,
    output: HTMLElement,
    userKeyEffects: KeyEffect[]
): () => void {
    const onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault()
            const text = input.value
            input.value = ''
            void app.run(text)
        } else if (ev.altKey && ev.key === 'ArrowUp') {
            const prev = app.history?.prev() ?? null
            if (prev !== null) input.value = prev
        } else if (ev.altKey && ev.key === 'ArrowDown') {
            const next = app.history?.next() ?? null
            if (next !== null) input.value = next
        }
        for (const effect of userKeyEffects) {
            void effect(ev, app)
        }
    }

    input.addEventListener('keydown', onKeyDown)
    return () => {
        input.removeEventListener('keydown', onKeyDown)
    }
}

/**
 * The default browser `DataHandler`: appends one `<div>` per report to `output`.
 * A `ManPage` composite result renders via `renderManHtml`; everything else
 * renders as labeled, pretty-printed JSON (or the error message).
 */
export function defaultBrowserDataHandler(output: HTMLElement): DataHandler {
    return (report, app): void => {
        if (report.internal) return

        const values = report.result ? Object.values(report.result) : []
        const div = document.createElement('div')

        if (values.length === 1 && isManPage(values[0])) {
            div.appendChild(renderManHtml(values[0], app))
        } else {
            const label =
                report.total > 1
                    ? report.handle
                        ? `[${report.handle}] `
                        : `[line ${report.lineIndex + 1}] `
                    : ''
            const body =
                report.status === 'ok'
                    ? JSON.stringify(report.result, null, 2)
                    : `Error: ${report.error ? report.error.message : ''}`
            div.textContent = label + body
        }

        output.appendChild(div)
        output.scrollTop = output.scrollHeight
    }
}
